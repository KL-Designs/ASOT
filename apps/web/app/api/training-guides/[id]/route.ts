import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { createNotificationForRole } from '@/lib/notifications'

const J3_LEAD_ROLES = ['J3 - Department Leader', 'J3 - Head Trainer', 'J3 - Assistant Head Trainer']

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function parseOid(id: string) {
    try { return new ObjectId(id) } catch { return null }
}

function callerName(me: Awaited<ReturnType<typeof client.fetchMe>>) {
    return me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
}

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const isJ3     = client.hasRoles(me, PERMISSIONS.departments.j3)
    const isJ3Lead = client.hasRoles(me, PERMISSIONS.trainingGuides.delete)

    // J3 leads may view deleted guides (for recycle-bin preview); everyone else cannot
    const filter = isJ3Lead ? { _id: oid } : { _id: oid, deletedAt: { $exists: false } }
    const guide = await Db.trainingGuides.findOne(filter)
    if (!guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (guide.status !== 'approved' && !isJ3) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json(guide)
}

function buildChangeSummary(body: Partial<TrainingGuide>, existing: TrainingGuide): string[] {
    const changes: string[] = []

    if (body.title !== undefined && body.title !== existing.title)
        changes.push('Title updated')
    if (body.duration !== undefined && body.duration !== existing.duration)
        changes.push('Duration updated')
    if (body.overview !== undefined && body.overview !== existing.overview)
        changes.push('Overview updated')
    if (body.trainingAreaDescription !== undefined && body.trainingAreaDescription !== existing.trainingAreaDescription)
        changes.push('Training area updated')
    if (body.notes !== undefined && body.notes !== existing.notes)
        changes.push('Notes updated')
    if (body.accentColor !== undefined && body.accentColor !== existing.accentColor)
        changes.push(`Accent colour changed to ${body.accentColor}`)
    if (body.outlineColor !== undefined && body.outlineColor !== (existing.outlineColor ?? existing.accentColor))
        changes.push(`Outline colour changed to ${body.outlineColor}`)
    if (body.revisionColor !== undefined && body.revisionColor !== (existing.revisionColor ?? '#d97706'))
        changes.push(`Revision colour changed to ${body.revisionColor}`)

    if (body.equipment) {
        const added   = body.equipment.filter(e => !existing.equipment.find(x => x.id === e.id)).length
        const removed = existing.equipment.filter(x => !body.equipment!.find(e => e.id === x.id)).length
        const changed = body.equipment.filter(e => {
            const x = existing.equipment.find(x => x.id === e.id)
            return x && x.text !== e.text
        }).length
        if (added)   changes.push(`${added} equipment item${added   > 1 ? 's' : ''} added`)
        if (removed) changes.push(`${removed} equipment item${removed > 1 ? 's' : ''} removed`)
        if (changed) changes.push(`${changed} equipment item${changed > 1 ? 's' : ''} updated`)
    }

    if (body.teachingPoints) {
        const newCount = body.teachingPoints.length
        const oldCount = existing.teachingPoints.length
        if (newCount > oldCount) changes.push(`${newCount - oldCount} teaching point${newCount - oldCount > 1 ? 's' : ''} added`)
        if (newCount < oldCount) changes.push(`${oldCount - newCount} teaching point${oldCount - newCount > 1 ? 's' : ''} removed`)

        let titleChanged = 0, dpChanged = 0, vpChanged = 0, cfChanged = 0
        for (const tp of body.teachingPoints) {
            const ex = existing.teachingPoints.find(e => e.id === tp.id)
            if (!ex) continue
            if (tp.title !== ex.title) titleChanged++
            if (JSON.stringify(tp.dotPoints)    !== JSON.stringify(ex.dotPoints))    dpChanged++
            if (JSON.stringify(tp.vitalPoints)  !== JSON.stringify(ex.vitalPoints))  vpChanged++
            if (JSON.stringify(tp.commonFaults) !== JSON.stringify(ex.commonFaults)) cfChanged++
        }
        if (titleChanged) changes.push(`Teaching point title${titleChanged > 1 ? 's' : ''} updated`)
        if (dpChanged)    changes.push(`Dot points updated in ${dpChanged} teaching point${dpChanged > 1 ? 's' : ''}`)
        if (vpChanged)    changes.push(`Vital points updated in ${vpChanged} teaching point${vpChanged > 1 ? 's' : ''}`)
        if (cfChanged)    changes.push(`Common faults updated in ${cfChanged} teaching point${cfChanged > 1 ? 's' : ''}`)
    }

    if (changes.length === 0) changes.push('Minor edits')
    return changes
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const existing = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: Partial<TrainingGuide>
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const name    = callerName(me)
    const now     = new Date()
    const changes = buildChangeSummary(body, existing)

    const setFields = {
        title:                   body.title                   ?? existing.title,
        accentColor:             body.accentColor             ?? existing.accentColor,
        outlineColor:            body.outlineColor            ?? existing.outlineColor,
        revisionColor:           body.revisionColor           ?? existing.revisionColor ?? '#d97706',
        duration:                body.duration                ?? existing.duration,
        overview:                body.overview                ?? existing.overview,
        equipment:               body.equipment               ?? existing.equipment,
        trainingAreaDescription: body.trainingAreaDescription ?? existing.trainingAreaDescription,
        teachingPoints:          body.teachingPoints          ?? existing.teachingPoints,
        revisionTopics:          body.revisionTopics          ?? existing.revisionTopics ?? [],
        notes:                   body.notes                   ?? existing.notes,
        lastRevisedAt: now,
        updatedAt:     now,
        updatedById:   me.id,
        updatedByName: name,
    }

    // Group edits within a 15-minute window from the same user into one history entry
    const history  = existing.editHistory ?? []
    const lastEdit = history[history.length - 1]
    const SESSION_MS = 15 * 60 * 1000
    const isRecentSession =
        lastEdit?.type === 'edit' &&
        lastEdit.byId === me.id &&
        now.getTime() - new Date(lastEdit.at).getTime() < SESSION_MS

    const snapshot = JSON.stringify({
        title:                   setFields.title,
        duration:                setFields.duration,
        overview:                setFields.overview,
        trainingAreaDescription: setFields.trainingAreaDescription,
        notes:                   setFields.notes,
        equipment:               setFields.equipment.map(e => ({ id: e.id, text: e.text })),
        teachingPoints:          setFields.teachingPoints.map(tp => ({
            id: tp.id, title: tp.title,
            dotPoints:    tp.dotPoints.map(dp => ({ id: dp.id, text: dp.text, indent: dp.indent ?? 0 })),
            vitalPoints:  tp.vitalPoints.map(vp => ({ id: vp.id, text: vp.text })),
            commonFaults: tp.commonFaults.map(cf => ({ id: cf.id, fault: cf.fault, correction: cf.correction })),
        })),
    })

    const editEntry: TrainingGuideEditEntry = {
        at: now, byId: me.id, byName: name, type: 'edit', changes, snapshot,
    }

    if (isRecentSession) {
        // Merge into the existing open session entry — update in place
        const updatedHistory = [...history.slice(0, -1), editEntry]
        await Db.trainingGuides.updateOne({ _id: oid }, { $set: { ...setFields, editHistory: updatedHistory } })
    } else {
        await Db.trainingGuides.updateOne({ _id: oid }, { $set: setFields, $push: { editHistory: editEntry } })
    }

    return NextResponse.json({ ok: true, version: existing.version, editEntry, sessionMerged: isRecentSession })
}

export async function PATCH(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    let body: { trainingTypeId?: string | null }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const now  = new Date()
    const meta = { updatedAt: now, updatedById: me.id, updatedByName: callerName(me) }

    const res = body.trainingTypeId === null
        ? await Db.trainingGuides.updateOne({ _id: oid, deletedAt: { $exists: false } }, { $unset: { trainingTypeId: 1 }, $set: meta })
        : await Db.trainingGuides.updateOne({ _id: oid, deletedAt: { $exists: false } }, { $set: { ...meta, trainingTypeId: body.trainingTypeId } })
    if (!res.matchedCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.delete)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const oid = parseOid(id)
    if (!oid) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const guide = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const name = callerName(me)
    const now  = new Date()
    await Db.trainingGuides.updateOne(
        { _id: oid },
        { $set: { deletedAt: now, deletedById: me.id, deletedByName: name } },
    )

    await logAction({
        action: 'training_guide.delete',
        category: 'training',
        department: 'j3',
        performedBy: me.id,
        performedByName: name,
        entityType: 'training_guide',
        entityId: id,
        after: JSON.stringify({ title: guide.title, docRef: guide.docRef }),
    })

    await Promise.all(J3_LEAD_ROLES.map(role =>
        createNotificationForRole(role, {
            type: 'training_guide_deleted',
            title: 'Training Guide Deleted',
            body: `${name} deleted "${guide.title}" (${guide.docRef})`,
            actionUrl: '/dashboard/unit/training-docs?tab=guides',
            relatedId: id,
        })
    ))

    return NextResponse.json({ ok: true })
}
