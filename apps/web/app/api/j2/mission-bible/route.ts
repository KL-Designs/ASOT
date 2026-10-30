import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { createNotificationForRole } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { sanitizeDocHtml } from '@/lib/training-docs/parse-gdocs-zip'
import { changesOnly, diffBlocks, htmlToBlocks, summariseDiff } from '@/lib/j2/bible-diff'

const RECENT_DAYS = 30
const MAX_HTML = 1_500_000
const MAX_BLOCKS = 3000

/**
 * `/api/j2/mission-bible` — the Mission Making Bible.
 *
 * J2 leads edit a **draft** and publish it as a numbered **version** with a
 * summary of what changed. Everybody else in J2 reads the latest published
 * version and never the draft: half-written rules are not rules.
 *
 *  - `GET` — the latest version, the change log, and (leads only) the draft.
 *  - `GET ?version=n` — that version compared with the one before it.
 *  - `GET ?recent=1` — the latest version compared with what stood 30 days ago:
 *    the "recent changes only" view.
 *  - `PUT { html }` — save the draft (leads).
 *  - `POST { summary }` — publish the draft as the next version (leads).
 */

async function access() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    if (!isJ4 && !client.hasRoles(me, PERMISSIONS.departments.j2)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { me, canEdit: isJ4 || await hasPermission(me, 'departmentLeads.j2') }
}

const meta = (v: MissionBibleVersion) => ({
    version: v.version,
    summary: v.summary,
    publishedAt: new Date(v.publishedAt).toISOString(),
    publishedByName: v.publishedByName,
})

/** The comparison between two versions, or everything-is-new for the first. */
function compare(before: MissionBibleVersion | null, after: MissionBibleVersion) {
    const a = htmlToBlocks(before?.html ?? '').slice(0, MAX_BLOCKS)
    const b = htmlToBlocks(after.html).slice(0, MAX_BLOCKS)
    const changes = diffBlocks(a, b)
    return { changes, summary: summariseDiff(changes) }
}

export async function GET(req: NextRequest) {
    const who = await access()
    if (who.error) return who.error

    const versions = await Db.missionBibleVersions.find({}).sort({ version: -1 }).toArray()
    const latest = versions[0] ?? null
    const params = req.nextUrl.searchParams

    const wanted = params.get('version')
    if (wanted) {
        const number = Number(wanted)
        const target = versions.find(v => v.version === number)
        if (!target) return NextResponse.json({ error: 'No such version' }, { status: 404 })
        const before = versions.find(v => v.version === number - 1) ?? null
        return NextResponse.json({ ...meta(target), comparedWith: before?.version ?? null, ...compare(before, target) })
    }

    if (params.get('recent')) {
        if (!latest) return NextResponse.json({ changes: [], summary: { added: 0, removed: 0, changed: 0 }, comparedWith: null, days: RECENT_DAYS })
        const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
        // What stood when the window opened: the newest version published
        // before it. With none that old, everything published since the first
        // version counts — so the base is the first version, not "nothing",
        // which would mark the whole Bible as new.
        const base = versions.find(v => new Date(v.publishedAt).getTime() < cutoff) ?? versions[versions.length - 1]
        const { changes, summary } = base.version === latest.version
            ? { changes: [], summary: { added: 0, removed: 0, changed: 0 } }
            : compare(base, latest)
        return NextResponse.json({ changes: changesOnly(changes), summary, comparedWith: base.version, days: RECENT_DAYS })
    }

    const draft = who.canEdit ? await Db.missionBibleDraft.findOne({ _id: 'draft' }) : null

    return NextResponse.json({
        canEdit: who.canEdit,
        latest: latest ? { ...meta(latest), html: latest.html } : null,
        versions: versions.map(meta),
        draft: who.canEdit
            ? {
                // No draft yet means "start from what is published".
                html: draft?.html ?? latest?.html ?? '',
                updatedAt: draft ? new Date(draft.updatedAt).toISOString() : null,
                updatedByName: draft?.updatedByName ?? null,
                // Whether publishing now would change anything.
                dirty: !!draft && draft.html !== (latest?.html ?? ''),
            }
            : null,
    })
}

export async function PUT(req: NextRequest) {
    const who = await access()
    if (who.error) return who.error
    if (!who.canEdit) return NextResponse.json({ error: 'Only J2 leads can edit the Mission Bible.' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    if (typeof body.html !== 'string') return NextResponse.json({ error: 'html is required' }, { status: 400 })
    if (body.html.length > MAX_HTML) return NextResponse.json({ error: 'The document is too large to save.' }, { status: 413 })

    const html = sanitizeDocHtml(body.html)
    const name = who.me.guild?.displayName || who.me.globalName || who.me.username || who.me.id
    const now = new Date()

    await Db.missionBibleDraft.updateOne(
        { _id: 'draft' },
        { $set: { html, updatedAt: now, updatedById: who.me.id, updatedByName: name } },
        { upsert: true },
    )
    return NextResponse.json({ ok: true, updatedAt: now.toISOString(), updatedByName: name })
}

export async function POST(req: NextRequest) {
    const who = await access()
    if (who.error) return who.error
    if (!who.canEdit) return NextResponse.json({ error: 'Only J2 leads can publish the Mission Bible.' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 600) : ''
    // Required: the change log is only worth reading if every line says something.
    if (!summary) return NextResponse.json({ error: 'Say what changed in this version.' }, { status: 400 })

    const [draft, latest] = await Promise.all([
        Db.missionBibleDraft.findOne({ _id: 'draft' }),
        Db.missionBibleVersions.findOne({}, { sort: { version: -1 } }),
    ])
    if (!draft || !htmlToBlocks(draft.html).length) {
        return NextResponse.json({ error: 'There is nothing in the draft to publish.' }, { status: 400 })
    }
    if (latest && latest.html === draft.html) {
        return NextResponse.json({ error: 'The draft is the same as the published version.' }, { status: 409 })
    }

    const name = who.me.guild?.displayName || who.me.globalName || who.me.username || who.me.id
    const version: MissionBibleVersion = {
        _id: new ObjectId(),
        version: (latest?.version ?? 0) + 1,
        html: draft.html,
        summary,
        publishedAt: new Date(),
        publishedById: who.me.id,
        publishedByName: name,
    }
    await Db.missionBibleVersions.insertOne(version)

    // Every mission maker, since the rules they work to have just changed.
    await Promise.all(PERMISSIONS.departments.j2.map(role => createNotificationForRole(role, {
        type: 'system',
        title: `Mission Bible updated to version ${version.version}`,
        body: `${name} published a new version: ${summary}`,
        actionUrl: '/dashboard/j2?tab=7',
        relatedId: String(version._id),
    })))

    logAction({
        action: 'j2.bible.publish', category: 'system', department: 'j2',
        performedBy: who.me.id, performedByName: name,
        entityType: 'mission_bible', entityId: String(version._id), target: `Version ${version.version}`,
        details: { summary },
    }).catch(console.error)

    return NextResponse.json(meta(version), { status: 201 })
}
