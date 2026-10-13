import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { logAction } from '@/lib/logAction'
import { normaliseModUrl, sanitiseMod } from '@/lib/mods/mod-database'
import { canEditMods, toModView } from '@/lib/mods/access'

/**
 * `/api/mods` — the Mod Database.
 *
 * GET is the whole list, to every member with dashboard access: it is a few
 * hundred short rows at most, and the page filters it as you type. `?ticketId=`
 * instead answers one question for a mod-request ticket's page — is there
 * already an entry made from this ticket, and may the caller make one.
 *
 * POST adds an entry (J2 and J7). With `sourceTicketId` it is the ticket's
 * *Send to mod database* button, and the entry remembers where it came from.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const canEdit = canEditMods(me)

    const ticketId = req.nextUrl.searchParams.get('ticketId')
    if (ticketId) {
        const entry = await Db.modDatabase.findOne({ sourceTicketId: ticketId })
        return NextResponse.json({ canEdit, entry: entry ? toModView(entry) : null })
    }

    const mods = await Db.modDatabase.find({}).sort({ name: 1 }).toArray()
    return NextResponse.json({ canEdit, mods: mods.map(toModView) })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canEditMods(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { fields, error } = sanitiseMod(body)
    if (error) return NextResponse.json({ error }, { status: 400 })

    // One entry per mod: the same link twice is the same mod.
    const urlKey = normaliseModUrl(fields.workshopUrl)
    if (urlKey) {
        const existing = await Db.modDatabase.findOne({ urlKey })
        if (existing) {
            return NextResponse.json({ error: `That mod is already in the database as "${existing.name}".`, existingId: String(existing._id) }, { status: 409 })
        }
    }

    let sourceTicketId: string | undefined
    if (typeof body.sourceTicketId === 'string' && ObjectId.isValid(body.sourceTicketId)) {
        const ticket = await Db.communityTickets.findOne(
            { _id: new ObjectId(body.sourceTicketId), subtype: 'mod-request', isDeleted: { $ne: true } },
            { projection: { _id: 1 } },
        )
        if (!ticket) return NextResponse.json({ error: 'That ticket is not a mod request.' }, { status: 400 })
        if (await Db.modDatabase.findOne({ sourceTicketId: body.sourceTicketId })) {
            return NextResponse.json({ error: 'That ticket has already been sent to the mod database.' }, { status: 409 })
        }
        sourceTicketId = body.sourceTicketId
    }

    const now = new Date()
    const name = me.guild?.displayName || me.globalName || me.username || me.id
    const entry: ModEntry = {
        _id: new ObjectId(),
        name: fields.name as string,
        workshopUrl: fields.workshopUrl ?? null,
        ...(urlKey ? { urlKey } : {}),
        status: fields.status ?? 'testing',
        notes: fields.notes ?? '',
        testedByName: fields.testedByName ?? '',
        testedOn: fields.testedOn ?? '',
        ...(sourceTicketId ? { sourceTicketId } : {}),
        createdAt: now, createdById: me.id, createdByName: name,
        updatedAt: now, updatedByName: name,
    }
    await Db.modDatabase.insertOne(entry)

    logAction({
        action: 'mods.create', category: 'system', performedBy: me.id, performedByName: name,
        entityType: 'mod', entityId: String(entry._id), target: entry.name,
        details: { status: entry.status, sourceTicketId },
    }).catch(console.error)

    return NextResponse.json(toModView(entry), { status: 201 })
}
