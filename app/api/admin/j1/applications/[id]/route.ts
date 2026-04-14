import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendTaskAssignedDM } from '@/lib/discord/bot'

// PATCH /api/admin/j1/applications/[id] — update status, notes, linked user, or assigned reviewer
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    let objectId: ObjectId
    try {
        objectId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid application ID.' }, { status: 400 })
    }

    let body: Record<string, string>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { status, notes, linkedUserId, linkedUserDisplayName, assignedReviewerId, assignedReviewerName } = body
    const validStatuses = ['pending', 'reviewing', 'accepted', 'rejected']

    if (status && !validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'

    const update: Record<string, unknown> = {
        reviewedBy: displayName,
        reviewedAt: new Date(),
    }
    if (status) update.status = status
    if (notes !== undefined) update.notes = notes.trim()
    if (linkedUserId !== undefined) update.linkedUserId = linkedUserId || null
    if (linkedUserDisplayName !== undefined) update.linkedUserDisplayName = linkedUserDisplayName || null

    // Handle reviewer assignment
    const assigningReviewer = assignedReviewerId !== undefined
    if (assigningReviewer) {
        update.assignedReviewerId = assignedReviewerId || null
        update.assignedReviewerName = assignedReviewerName || null
    }

    const app = await Db.j1Applications.findOne({ _id: objectId })
    if (!app) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    const result = await Db.j1Applications.updateOne(
        { _id: objectId },
        { $set: update }
    )

    if (result.matchedCount === 0) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    // Create a task + notification if reviewer changed to a new person
    if (assigningReviewer && assignedReviewerId && assignedReviewerId !== app.assignedReviewerId) {
        const applicantName = app.inGameName?.trim() || app.discordUsername || 'Unknown Applicant'
        const taskTitle = `Review application — ${applicantName}`
        try {
            const insertResult = await Db.tasks.insertOne({
                title: taskTitle,
                description: `You have been assigned to review a J1 application from ${applicantName}.`,
                assignedTo: assignedReviewerId,
                assignedToName: assignedReviewerName ?? assignedReviewerId,
                assignedBy: me.id,
                assignedByName: displayName,
                type: 'application_review',
                actionUrl: '/admin/j1',
                relatedId: id,
                status: 'pending',
                createdAt: new Date(),
            } as Task)
            const notifBody = `${displayName} assigned you to review a J1 application from ${applicantName}.`
            await createNotification({
                userId: assignedReviewerId,
                type: 'task_assigned',
                title: taskTitle,
                body: notifBody,
                actionUrl: '/admin/j1',
                relatedId: insertResult.insertedId.toString(),
            })
            sendTaskAssignedDM(assignedReviewerId, taskTitle, notifBody, '/admin/j1').catch(err =>
                console.error('[j1/applications] DM failed for', assignedReviewerId, err)
            )
        } catch (err) {
            console.error('[j1/applications] Failed to create reviewer task:', err)
        }
    }

    return NextResponse.json({ ok: true })
}
