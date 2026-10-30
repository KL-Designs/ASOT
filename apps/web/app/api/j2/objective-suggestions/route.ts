import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { objectiveFromTicket, sanitiseObjective } from '@/lib/j2/objective-suggestions'
import { objectiveAccess, toObjectiveView } from '@/lib/j2/objective-access'

/**
 * `/api/j2/objective-suggestions` — the pool of confirmed objective ideas.
 *
 * GET is the whole list, for J2 and for staff (the All Staff dashboard mirrors
 * it read-only by polling this). `?ticketId=` instead answers, for an
 * Objective Idea ticket's page: has this been confirmed into the pool, and may
 * the caller confirm it.
 *
 * POST adds an entry. With `sourceTicketId` it is a J2 lead confirming a
 * ticket, and the entry is built from the ticket's own fields — the request
 * cannot rewrite what the member pitched. Without it, a J2 mission maker is
 * adding an idea of their own.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await objectiveAccess(me)

    const ticketId = req.nextUrl.searchParams.get('ticketId')
    if (ticketId) {
        // Asked from a ticket anybody may be reading, so it answers without
        // revealing the pool: only whether this one ticket is in it.
        const entry = await Db.objectiveSuggestions.findOne({ sourceTicketId: ticketId }, { projection: { _id: 1 } })
        return NextResponse.json({ canConfirm: access.canConfirm, confirmed: !!entry })
    }

    if (!access.canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const items = await Db.objectiveSuggestions.find({}).sort({ createdAt: -1 }).toArray()
    return NextResponse.json({
        canEdit: access.canEdit,
        canConfirm: access.canConfirm,
        items: items.map(toObjectiveView),
    })
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await objectiveAccess(me)
    const body = await req.json().catch(() => ({}))
    const name = me.guild?.displayName || me.globalName || me.username || me.id
    const now = new Date()

    let fields
    let sourceTicketId: string | undefined
    let suggestedByName: string | undefined
    let suggestedById: string | undefined

    if (typeof body.sourceTicketId === 'string') {
        if (!access.canConfirm) return NextResponse.json({ error: 'Only J2 leads can confirm an objective idea.' }, { status: 403 })
        if (!ObjectId.isValid(body.sourceTicketId)) return NextResponse.json({ error: 'Invalid ticket' }, { status: 400 })

        const ticket = await Db.communityTickets.findOne({
            _id: new ObjectId(body.sourceTicketId), subtype: 'objective', isDeleted: { $ne: true },
        })
        if (!ticket) return NextResponse.json({ error: 'That ticket is not an objective idea.' }, { status: 400 })
        if (await Db.objectiveSuggestions.findOne({ sourceTicketId: body.sourceTicketId })) {
            return NextResponse.json({ error: 'That idea is already in Objective Suggestions.' }, { status: 409 })
        }

        fields = objectiveFromTicket(ticket)
        sourceTicketId = body.sourceTicketId
        if (!ticket.isAnonymous) { suggestedByName = ticket.authorName; suggestedById = ticket.authorId }
    } else {
        if (!access.canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        const result = sanitiseObjective(body)
        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
        fields = result.fields as Required<typeof result.fields>
    }

    const entry: ObjectiveSuggestion = {
        _id: new ObjectId(),
        name: fields.name ?? '',
        overview: fields.overview ?? '',
        intel: fields.intel ?? '',
        linkedIntel: fields.linkedIntel ?? '',
        comments: fields.comments ?? '',
        ...(sourceTicketId ? { sourceTicketId } : {}),
        ...(suggestedByName ? { suggestedByName } : {}),
        createdAt: now, addedById: me.id, addedByName: name,
        updatedAt: now, updatedByName: name,
    }
    await Db.objectiveSuggestions.insertOne(entry)

    // Tell the member their idea made it — they pitched it for this.
    if (suggestedById && suggestedById !== me.id) {
        createNotification({
            userId: suggestedById,
            type: 'system',
            title: 'Your objective idea was added',
            body: `J2 added "${entry.name}" to Objective Suggestions, where mission makers browse for ideas.`,
            actionUrl: `/tickets/${sourceTicketId}`,
            relatedId: sourceTicketId,
        }).catch(() => { })
    }

    logAction({
        action: sourceTicketId ? 'j2.objective.confirm' : 'j2.objective.create', category: 'system', department: 'j2',
        performedBy: me.id, performedByName: name,
        entityType: 'objective_suggestion', entityId: String(entry._id), target: entry.name,
        details: { sourceTicketId },
    }).catch(console.error)

    return NextResponse.json(toObjectiveView(entry), { status: 201 })
}
