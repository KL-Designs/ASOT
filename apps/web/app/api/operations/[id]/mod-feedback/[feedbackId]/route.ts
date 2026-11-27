import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

type Params = { params: Promise<{ id: string; feedbackId: string }> }

/**
 * PATCH /api/operations/[id]/mod-feedback/[feedbackId]
 * Actions: add-to-db — promotes feedback to a ModEntry in the mod database.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ2 = client.hasRoles(me, PERMISSIONS.tickets.actionJ2)
    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    if (!isJ2 && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, feedbackId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(feedbackId)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const feedback = await Db.operationModFeedback.findOne({ _id: new ObjectId(feedbackId), operationId: id })
    if (!feedback) return NextResponse.json({ error: 'Feedback not found' }, { status: 404 })

    if (feedback.addedToDbAt) {
        return NextResponse.json({ error: 'Already added to mod database', modEntryId: feedback.modEntryId }, { status: 409 })
    }

    const body = await req.json().catch(() => ({}))
    const { action, status = 'known_issues', notes } = body

    if (action !== 'add-to-db') {
        return NextResponse.json({ error: 'action must be add-to-db' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const now = new Date()

    // Check if a mod with the same url key already exists
    const urlKey = feedback.workshopUrl
        ? feedback.workshopUrl.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
        : null

    const existing = urlKey
        ? await Db.modDatabase.findOne({ urlKey })
        : null

    let modEntryId: string

    if (existing) {
        // Update existing entry with new notes from feedback
        const updatedNotes = [existing.notes, `[${feedback.operationTitle}] ${feedback.issue}`]
            .filter(Boolean).join('\n')
        await Db.modDatabase.updateOne({ _id: existing._id }, {
            $set: { notes: updatedNotes, updatedAt: now, updatedByName: displayName },
        })
        modEntryId = existing._id.toString()
    } else {
        // Create new ModEntry
        const result = await Db.modDatabase.insertOne({
            _id: new ObjectId(),
            name: feedback.modName,
            workshopUrl: feedback.workshopUrl ?? null,
            ...(urlKey ? { urlKey } : {}),
            status: status as ModEntry['status'],
            notes: notes?.trim() || `[${feedback.operationTitle}] ${feedback.issue}`,
            testedByName: displayName,
            testedOn: now.toISOString().split('T')[0],
            sourceTicketId: feedbackId,
            createdAt: now,
            createdById: me.id,
            createdByName: displayName,
            updatedAt: now,
            updatedByName: displayName,
        } as ModEntry)
        modEntryId = result.insertedId.toString()
    }

    // Mark feedback as added
    await Db.operationModFeedback.updateOne({ _id: new ObjectId(feedbackId) }, {
        $set: {
            addedToDbAt: now,
            addedToDbById: me.id,
            addedToDbByName: displayName,
            modEntryId,
        },
    })

    logAction({
        action: 'mod.feedback.addedToDb',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
        details: { feedbackId, modEntryId, modName: feedback.modName },
    })

    const updated = await Db.operationModFeedback.findOne({ _id: new ObjectId(feedbackId) })
    return NextResponse.json({ feedback: { ...updated, _id: updated!._id!.toString() }, modEntryId })
}

/** DELETE /api/operations/[id]/mod-feedback/[feedbackId] — remove a feedback entry. Submitter or J4. */
export async function DELETE(_req: NextRequest, { params }: Params) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, feedbackId } = await params
    if (!ObjectId.isValid(id) || !ObjectId.isValid(feedbackId)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    const isJ2 = client.hasRoles(me, PERMISSIONS.tickets.actionJ2)

    const feedback = await Db.operationModFeedback.findOne({ _id: new ObjectId(feedbackId), operationId: id })
    if (!feedback) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!isJ4 && !isJ2 && feedback.submittedById !== me.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await Db.operationModFeedback.deleteOne({ _id: new ObjectId(feedbackId) })
    return NextResponse.json({ ok: true })
}
