import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { addGuildRole, removeGuildRole, setGuildNickname, sendTaskAssignedDM, sendDM } from '@/lib/discord/bot'

// PATCH /api/admin/j1/applications/[id] — update status, notes, linked user, or assigned recruiter
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

    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { status, notes, linkedUserId, linkedUserDisplayName, assignedReviewerId, assignedReviewerName, recruiterNote, reviewHours } = body as Record<string, string>
    const validStatuses = ['pending', 'reviewing', 'accepted', 'rejected']

    if (status && !validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const app = await Db.j1Applications.findOne({ _id: objectId })
    if (!app) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    const isJ1Lead = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
    const isAssignedRecruiter = app.assignedReviewerId === me.id
    const assigningReviewer = assignedReviewerId !== undefined

    // Status changes: J1 Lead or assigned recruiter only
    if (status) {
        if (!isJ1Lead && !isAssignedRecruiter) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        // Recruiters can only approve/reject their assigned app
        if (!isJ1Lead && isAssignedRecruiter && !['accepted', 'rejected'].includes(status)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    }

    // Recruiter assignment: J1 Lead only
    if (assigningReviewer && !isJ1Lead) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    if (recruiterNote !== undefined && isJ1Lead) update.recruiterNote = recruiterNote

    if (assigningReviewer) {
        update.assignedReviewerId = assignedReviewerId || null
        update.assignedReviewerName = assignedReviewerName || null
        if (assignedReviewerId) {
            update.assignedByLeadId = me.id
            update.assignedByLeadName = displayName
            // Auto-advance to reviewing when recruiter is assigned
            if (app.status === 'pending') update.status = 'reviewing'
            // Set due date from reviewHours (default 72)
            const hours = Math.min(Math.max(Number(reviewHours) || 72, 1), 720)
            update.reviewDueAt = new Date(Date.now() + hours * 60 * 60 * 1000)
        }
    }

    const result = await Db.j1Applications.updateOne(
        { _id: objectId },
        { $set: update }
    )

    if (result.matchedCount === 0) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    const applicantName = app.inGameName?.trim() || app.discordUsername || 'Unknown Applicant'
    const effectiveStatus = (status || (assigningReviewer && app.status === 'pending' ? 'reviewing' : null)) as string | null

    // DM the applicant when status changes
    if (effectiveStatus && app.linkedUserId && effectiveStatus !== app.status) {
        const statusLabels: Record<string, string> = { reviewing: 'Under Review', accepted: 'Accepted', rejected: 'Rejected' }
        const label = statusLabels[effectiveStatus] ?? effectiveStatus
        sendDM(app.linkedUserId, {
            embeds: [{
                title: '📋 Application Status Update',
                description: `Your ASOT recruitment application status has been updated to **${label}**.`,
                color: effectiveStatus === 'accepted' ? 0x00c364 : effectiveStatus === 'rejected' ? 0xdb001d : 0x3b82f6,
                footer: { text: 'ASOT Member Portal' },
                timestamp: new Date().toISOString(),
            }],
        }, 'raw').catch(err => console.error('[j1/applications] Applicant DM failed', err))
    }

    // Notify J1 Lead when recruiter finishes review
    if (status && ['accepted', 'rejected'].includes(status) && app.assignedByLeadId && isAssignedRecruiter) {
        createNotification({
            userId: app.assignedByLeadId,
            type: 'task_assigned',
            title: `Application ${status} — ${applicantName}`,
            body: `${displayName} has ${status} the application from ${applicantName}.`,
            actionUrl: `/admin/j1?tab=1&app=${id}`,
            relatedId: id,
        }).catch(err => console.error('[j1/applications] Lead notification failed', err))
        if (app.assignedByLeadId !== me.id) {
            sendDM(app.assignedByLeadId, {
                embeds: [{
                    title: status === 'accepted' ? '✅ Application Approved' : '❌ Application Rejected',
                    description: `**${displayName}** has **${status}** the application from **${applicantName}**.`,
                    color: status === 'accepted' ? 0x00c364 : 0xdb001d,
                    footer: { text: 'ASOT Member Portal' },
                    timestamp: new Date().toISOString(),
                }],
            }, 'raw').catch(err => console.error('[j1/applications] Lead DM failed', err))
        }
    }

    // Create task + notification when recruiter is assigned to a new person
    if (assigningReviewer && assignedReviewerId && assignedReviewerId !== app.assignedReviewerId) {
        const taskTitle = `Review application — ${applicantName}`
        const dueDate = update.reviewDueAt as Date
        try {
            const insertResult = await Db.tasks.insertOne({
                title: taskTitle,
                description: `You have been assigned to review a J1 application from ${applicantName}.\n\n${recruiterNote ? `Note from ${displayName}: ${recruiterNote}` : ''}`.trim(),
                assignedTo: assignedReviewerId,
                assignedToName: assignedReviewerName ?? assignedReviewerId,
                assignedBy: me.id,
                assignedByName: displayName,
                type: 'application_review',
                actionUrl: `/admin/j1?tab=1&app=${id}`,
                relatedId: id,
                status: 'pending',
                dueDate,
                createdAt: new Date(),
            } as Task)
            const notifBody = `${displayName} assigned you to review a J1 application from ${applicantName}.`
            await createNotification({
                userId: assignedReviewerId,
                type: 'task_assigned',
                title: taskTitle,
                body: notifBody,
                actionUrl: `/admin/j1?tab=1&app=${id}`,
                relatedId: insertResult.insertedId.toString(),
            })
            sendTaskAssignedDM(assignedReviewerId, taskTitle, notifBody, '/admin/j1').catch(err =>
                console.error('[j1/applications] DM failed for', assignedReviewerId, err)
            )
        } catch (err) {
            console.error('[j1/applications] Failed to create recruiter task:', err)
        }
    }

    // On acceptance — full onboarding sequence
    if (status === 'accepted' && app.linkedUserId) {
        const memberId = app.linkedUserId
        const igName = app.inGameName?.trim() || app.linkedUserDisplayName || 'Member'

        Promise.allSettled([
            // Add ASOT Member role
            Db.roles.findOne({ name: 'ASOT Member' })
                .then(role => role?.id ? addGuildRole(memberId, role.id) : null),
            // Remove Applicant role
            Db.roles.findOne({ name: 'Applicant' })
                .then(role => role?.id ? removeGuildRole(memberId, role.id) : null),
            // Set rank to REC + promotion record
            Db.users.updateOne({ id: memberId }, {
                $set: { 'milpac.currentRank': 'REC' },
                $push: {
                    'milpac.promotions': {
                        date: new Date().toISOString().split('T')[0],
                        rank: 'Recruit',
                        role: 'REC',
                        issuedById: me.id,
                        issuedByName: displayName,
                    } as never,
                },
            }),
            // Add to ORBAT active reservists
            Db.orbatPositions.countDocuments({ category: 'activeReservist' })
                .then(count => Db.orbatPositions.insertOne({
                    category: 'activeReservist',
                    sectionTitle: '',
                    role: 'Active Reservist',
                    userId: memberId,
                    sectionOrder: 0,
                    positionOrder: count,
                } as OrbatPosition)),
            // Set Discord nickname
            setGuildNickname(memberId, `REC ${igName}`),
        ]).then(results => {
            results.forEach((r, i) => {
                if (r.status === 'rejected') console.error(`[j1/applications] Onboarding step ${i} failed:`, r.reason)
            })
        })
    }

    return NextResponse.json({ ok: true })
}

// DELETE /api/admin/j1/applications/[id] — permanently delete an application (J4 only)
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    let objectId: ObjectId
    try {
        objectId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid application ID.' }, { status: 400 })
    }

    const result = await Db.j1Applications.deleteOne({ _id: objectId })

    if (result.deletedCount === 0) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
}
