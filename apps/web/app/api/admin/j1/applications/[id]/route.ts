import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { addGuildRole, removeGuildRole, setGuildNickname, sendTaskAssignedDM, sendDM, sendChannelMessage } from '@/lib/discord/bot'
import { buildNickname } from '@/lib/buildNickname'
import { calculatePromotionPoints } from '@/lib/military/points'
import { hasPermission } from '@/lib/orbat/hasPermission'

// ── Returning-member check ────────────────────────────────────────────────────

type ReturningStatus = 'CLEAR' | 'HD' | 'GD' | 'DD'

async function runReturningMemberCheck(
    discordId: string,
): Promise<{ status: ReturningStatus; details: string }> {
    const PRIORITY: Record<ReturningStatus, number> = { CLEAR: 0, HD: 1, GD: 2, DD: 3 }
    let worst: ReturningStatus = 'CLEAR'
    const reasons: string[] = []

    function elevate(s: ReturningStatus) {
        if (PRIORITY[s] > PRIORITY[worst]) worst = s
    }

    // Previous rejected application → treat as GD-equivalent
    const prevRejection = await Db.j1Applications.findOne({ discordId, status: 'rejected' })
    if (prevRejection) {
        const when = prevRejection.submittedAt
            ? new Date(prevRejection.submittedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'unknown date'
        reasons.push(`Previously rejected application (${when})`)
        elevate('GD')
    }

    // Previously discharged member — read discharge type
    const dischargedUser = await Db.users.findOne({ id: discordId, discharged: { $exists: true } })
    if (dischargedUser) {
        const discharge = dischargedUser.discharged as any
        const reason = discharge?.reason ?? 'no reason on record'
        const type = (discharge?.type as string ?? '').trim().toUpperCase()
        if (type === 'DD') {
            reasons.push(`Dishonourably discharged — ${reason}`)
            elevate('DD')
        } else if (type === 'HD') {
            reasons.push(`Honourably discharged — ${reason}`)
            elevate('HD')
        } else {
            reasons.push(`Previously discharged (GD) — ${reason}`)
            elevate('GD')
        }
    }

    // J4 Master Sheet — Leaving History
    const leavingRecord = discordId ? await Db.leavingHistory.findOne({ discordId }) : null
    if (leavingRecord) {
        const ret  = leavingRecord.return?.trim().toUpperCase()
        const type = (leavingRecord.type ?? '').trim().toUpperCase()
        const reason  = leavingRecord.reason ?? ''
        const dateStr = leavingRecord.leavingDate ?? 'unknown date'
        if (ret === 'NO') {
            reasons.push(`Master Sheet: DO NOT RETURN — ${reason}`)
            elevate('DD')
        } else if (type === 'DD') {
            reasons.push(`Master Sheet: DD discharge (${dateStr}) — ${reason}`)
            elevate('DD')
        } else if (type === 'HD') {
            reasons.push(`Master Sheet: HD discharge (${dateStr}) — ${reason}`)
            elevate('HD')
        } else if (type === 'GD' || ret === 'REVIEW' || ret === 'INDEFINITE') {
            reasons.push(`Master Sheet: GD discharge (${dateStr}) — ${reason}`)
            elevate('GD')
        }
    }

    // J4 Master Sheet — Denied Applications HQ → GD-equivalent
    if (discordId) {
        const deniedRecord = await Db.deniedApplicationsHQ.findOne({ discordId })
        if (deniedRecord) {
            reasons.push(`Master Sheet: previously denied application (${deniedRecord.date}) — ${deniedRecord.reason}`)
            elevate('GD')
        }
    }

    return {
        status: worst,
        details: worst === 'CLEAR' ? 'No prior record found' : reasons.join('; '),
    }
}

// ── Award billet points to recruiter ─────────────────────────────────────────

async function awardInterviewPoint(recruiterId: string) {
    const recruiterDoc = await Db.users.findOne({ id: recruiterId })
    if (!recruiterDoc) return

    const existing = (recruiterDoc.milpac?.billetCounts ?? {}) as Record<string, number>
    const updatedCounts = {
        primaryNightOps:    existing.primaryNightOps    ?? 0,
        secondaryNightOps:  existing.secondaryNightOps  ?? 0,
        primaryNightFTX:    existing.primaryNightFTX    ?? 0,
        secondaryNightFTX:  existing.secondaryNightFTX  ?? 0,
        platoonTraining:    existing.platoonTraining     ?? 0,
        sectionTraining:    existing.sectionTraining     ?? 0,
        meetings:           existing.meetings            ?? 0,
        campaignMedals:     existing.campaignMedals      ?? 0,
        j1Interviews:       (existing.j1Interviews       ?? 0) + 1,
        j1InterviewBonus:   existing.j1InterviewBonus    ?? 0,
        j2MissionsRun:      existing.j2MissionsRun       ?? 0,
        j3Bct12:            existing.j3Bct12             ?? 0,
        j3OtherTrainings:   existing.j3OtherTrainings    ?? 0,
        j5ContentCreated:   existing.j5ContentCreated    ?? 0,
        j5MilpacsGenerated: existing.j5MilpacsGenerated  ?? 0,
        j5OfficialPR:       existing.j5OfficialPR        ?? 0,
    }
    const awards         = (recruiterDoc.milpac?.awards         ?? []) as { name: string }[]
    const qualifications = (recruiterDoc.milpac?.qualifications ?? []) as { qualification: string }[]
    const j4Points       = (recruiterDoc.milpac?.j4Points       ?? 0) as number
    const disciplineDeductions = (recruiterDoc.milpac?.disciplineDeductions ?? 0) as number

    const newPoints = calculatePromotionPoints({
        ...updatedCounts,
        awards,
        qualifications,
        j4Points,
        disciplineDeductions,
    })

    await Db.users.updateOne(
        { id: recruiterId },
        {
            $set: {
                'milpac.billetCounts': updatedCounts,
                'milpac.promotionPoints': newPoints,
            },
        },
    )
}

// PATCH /api/admin/j1/applications/[id]
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

    const app = await Db.j1Applications.findOne({ _id: objectId })
    if (!app) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    const isJ1Lead = await hasPermission(me, 'departmentLeads.j1')
    const isJ4              = client.hasRoles(me, PERMISSIONS.departments.j4)
    const isAssignedRecruiter = app.assignedReviewerId === me.id

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const applicantName = app.inGameName?.trim() || app.discordUsername || 'Unknown Applicant'

    // ── J4 review decision ────────────────────────────────────────────────────
    if (body.j4ReviewDecision !== undefined) {
        if (!isJ4) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const decision = body.j4ReviewDecision as string
        if (!['approved', 'rejected'].includes(decision)) {
            return NextResponse.json({ error: 'Invalid j4ReviewDecision' }, { status: 400 })
        }

        const noteText = (body.j4ReviewNote as string | undefined)?.trim() ?? ''

        await Db.j1Applications.updateOne(
            { _id: objectId },
            {
                $set: {
                    j4ReviewStatus:    decision as 'approved' | 'rejected',
                    j4ReviewedById:    me.id,
                    j4ReviewedByName:  displayName,
                    j4ReviewNote:      noteText || undefined,
                },
            },
        )

        // Mark J4 task complete
        await Db.tasks.updateOne(
            { type: 'j4_returning_review' as TaskType, relatedId: id },
            { $set: { status: 'completed' } },
        ).catch(() => null)

        // Notify recruiter of J4 decision
        if (app.assignedReviewerId) {
            const msg = decision === 'approved'
                ? `J4 has approved the returning-member check for ${applicantName}. You may now submit your recommendation.`
                : `J4 has rejected the returning-member check for ${applicantName}. The application cannot proceed.`
            createNotification({
                userId: app.assignedReviewerId,
                type: 'task_assigned',
                title: `J4 review ${decision} — ${applicantName}`,
                body: msg,
                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                relatedId: id,
            }).catch(() => null)
            sendDM(app.assignedReviewerId, {
                embeds: [{
                    title: decision === 'approved' ? '✅ J4 Review Approved' : '❌ J4 Review Rejected',
                    description: msg,
                    color: decision === 'approved' ? 0x00c364 : 0xdb001d,
                    footer: { text: 'ASOT Dashboard' },
                    timestamp: new Date().toISOString(),
                }],
            }, 'raw').catch(() => null)
        }

        // Notify J1 Lead of J4 rejection so they can close the application
        if (decision === 'rejected' && app.assignedByLeadId) {
            const noteDisplay = noteText ? `\n\n**J4 note:** ${noteText}` : ''
            createNotification({
                userId: app.assignedByLeadId,
                type: 'task_assigned',
                title: `J4 rejected returning-member check — ${applicantName}`,
                body: `${displayName} (J4) has rejected the returning-member check for ${applicantName}.${noteDisplay ? ` Note: ${noteText}` : ''}`,
                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                relatedId: id,
            }).catch(() => null)
        }

        return NextResponse.json({ ok: true })
    }

    // ── Recruiter recommendation ──────────────────────────────────────────────
    if (body.recruiterRecommendation !== undefined) {
        if (!isAssignedRecruiter && !isJ1Lead) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const rec = body.recruiterRecommendation as string
        if (!['approve', 'deny', 'pend'].includes(rec)) {
            return NextResponse.json({ error: 'Invalid recruiterRecommendation' }, { status: 400 })
        }

        // Recruiter is locked while J4 review is pending (DD only; HD/GD do not lock)
        if (!isJ1Lead && app.j4ReviewStatus === 'pending') {
            const returningStatus = (app.returningMemberCheck as any)?.status
            if (returningStatus === 'DD' || returningStatus === 'REVIEW' || !returningStatus) {
                return NextResponse.json({ error: 'Awaiting J4 review — cannot submit recommendation yet.' }, { status: 403 })
            }
        }

        await Db.j1Applications.updateOne(
            { _id: objectId },
            {
                $set: {
                    recruiterRecommendation: rec as 'approve' | 'deny' | 'pend',
                    recruiterRecommendationAt: new Date().toISOString(),
                },
            },
        )

        // Notify J1 Lead for final decision
        if (app.assignedByLeadId) {
            const recLabel = rec === 'approve' ? 'APPROVE' : rec === 'deny' ? 'DENY' : 'PEND'
            createNotification({
                userId: app.assignedByLeadId,
                type: 'task_assigned',
                title: `Recruiter recommends ${recLabel} — ${applicantName}`,
                body: `${displayName} recommends to ${recLabel} the application from ${applicantName}. Your final decision is required.`,
                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                relatedId: id,
            }).catch(() => null)
            sendDM(app.assignedByLeadId, {
                embeds: [{
                    title: `📋 Recruiter Recommendation — ${recLabel}`,
                    description: `**${displayName}** recommends to **${recLabel}** the application from **${applicantName}**.\n\nPlease review and make your final decision.`,
                    color: rec === 'approve' ? 0x00c364 : rec === 'deny' ? 0xdb001d : 0xf59e0b,
                    footer: { text: 'ASOT Dashboard' },
                    timestamp: new Date().toISOString(),
                }],
            }, 'raw').catch(() => null)
        }

        return NextResponse.json({ ok: true })
    }

    // ── Optional J4 notification for GD returning members ────────────────────
    if (body.notifyJ4GD === true) {
        if (!isAssignedRecruiter && !isJ1Lead) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const returningStatus = (app.returningMemberCheck as any)?.status
        if (returningStatus !== 'GD') {
            return NextResponse.json({ error: 'Only applicable for GD returning members.' }, { status: 400 })
        }
        if (app.j4GDNotified) {
            return NextResponse.json({ error: 'J4 has already been notified.' }, { status: 400 })
        }
        const checkDetails = (app.returningMemberCheck as any)?.details ?? 'No details on record'

        const j4Members = await Db.users
            .find({ 'guild.roles': { $in: PERMISSIONS.departments.j4 }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
            .project<{ _id: string; id: string; guild?: { nickname?: string } }>({ _id: 1, id: 1, guild: 1 })
            .toArray()

        for (const j4User of j4Members) {
            const j4Name = (j4User as any).guild?.nickname ?? (j4User as any).globalName ?? j4User.id
            try {
                await Db.tasks.insertOne({
                    title: `GD returning-member advisory — ${applicantName}`,
                    description: `A recruiter has flagged ${applicantName} as a General Discharge returning member for your awareness. No action is required unless you wish to intervene.\n\n**Details:** ${checkDetails}`,
                    assignedTo: j4User.id as string,
                    assignedToName: j4Name,
                    assignedBy: me.id,
                    assignedByName: displayName,
                    type: 'j4_returning_review',
                    actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                    relatedId: id,
                    status: 'pending',
                    createdAt: new Date(),
                } as unknown as Task)
            } catch { /* ignore */ }
            await createNotification({
                userId: j4User.id as string,
                type: 'task_assigned',
                title: `GD returning-member advisory — ${applicantName}`,
                body: `${applicantName} is a returning member with a General Discharge. The recruiter has flagged this for your awareness. Details: ${checkDetails}`,
                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                relatedId: id,
            }).catch(() => null)
        }

        await Db.j1Applications.updateOne({ _id: objectId }, { $set: { j4GDNotified: true } })
        return NextResponse.json({ ok: true })
    }

    // ── Standard PATCH (status / notes / linked user / recruiter assignment) ──

    const { status, notes, linkedUserId, linkedUserDisplayName, assignedReviewerId, assignedReviewerName, recruiterNote, reviewHours, reviewCustomDate } = body as Record<string, string>
    const validStatuses = ['pending', 'reviewing', 'accepted', 'rejected', 'returned']

    if (status && !validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const assigningReviewer = assignedReviewerId !== undefined

    // Status changes: J1 Lead, J4, or assigned recruiter (limited)
    if (status) {
        const canAct = isJ1Lead || isJ4 || isAssignedRecruiter
        if (!canAct) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        // Recruiters (non-lead, non-J4) can only resubmit a returned application
        if (!isJ1Lead && !isJ4 && isAssignedRecruiter) {
            const recruiterAllowed = status === 'pending' && app.status === 'returned'
            if (!recruiterAllowed) {
                return NextResponse.json({ error: 'Forbidden — submit a recommendation instead.' }, { status: 403 })
            }
        }
        // J4 override (no recruiter assigned) allows accept/reject
        if (!isJ1Lead && isJ4 && !app.assignedReviewerId) {
            // allowed
        }
    }

    // Recruiter assignment: J1 Lead only
    if (assigningReviewer && !isJ1Lead) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Sending back requires a recruiter note and an assigned recruiter
    if (status === 'returned') {
        if (!recruiterNote?.toString().trim()) {
            return NextResponse.json({ error: 'A note for the recruiter is required when sending back for review.' }, { status: 400 })
        }
        if (!app.assignedReviewerId) {
            return NextResponse.json({ error: 'No recruiter is assigned to this application.' }, { status: 400 })
        }
    }

    const update: Record<string, unknown> = {}

    if (status === 'accepted' || status === 'rejected') {
        update.reviewedBy = displayName
        update.reviewedAt = new Date()
    }

    if (status) update.status = status
    if (notes !== undefined) update.notes = notes.trim()
    if (linkedUserId !== undefined) update.linkedUserId = linkedUserId || null
    if (linkedUserDisplayName !== undefined) update.linkedUserDisplayName = linkedUserDisplayName || null
    if (recruiterNote !== undefined && isJ1Lead) update.recruiterNote = recruiterNote

    if (assigningReviewer) {
        update.assignedReviewerId   = assignedReviewerId   || null
        update.assignedReviewerName = assignedReviewerName || null
        if (assignedReviewerId) {
            update.assignedByLeadId   = me.id
            update.assignedByLeadName = displayName
            if (app.status === 'pending') update.status = 'reviewing'
            if (reviewCustomDate) {
                const customDate = new Date(reviewCustomDate)
                if (!isNaN(customDate.getTime()) && customDate > new Date()) {
                    update.reviewDueAt = customDate
                } else {
                    return NextResponse.json({ error: 'Custom deadline must be a valid future date.' }, { status: 400 })
                }
            } else {
                const hours = Math.min(Math.max(Number(reviewHours) || 72, 1), 720)
                update.reviewDueAt = new Date(Date.now() + hours * 60 * 60 * 1000)
            }
        }
    }

    const result = await Db.j1Applications.updateOne({ _id: objectId }, { $set: update })
    if (result.matchedCount === 0) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    const effectiveStatus = (status || (assigningReviewer && app.status === 'pending' ? 'reviewing' : null)) as string | null

    // DM the applicant when status changes
    if (effectiveStatus && app.linkedUserId && effectiveStatus !== app.status && !['returned', 'pending'].includes(effectiveStatus)) {
        const statusLabels: Record<string, string> = { reviewing: 'Under Review', accepted: 'Accepted', rejected: 'Rejected' }
        const label = statusLabels[effectiveStatus] ?? effectiveStatus
        sendDM(app.linkedUserId, {
            embeds: [{
                title: '📋 Application Status Update',
                description: `Your ASOT recruitment application status has been updated to **${label}**.`,
                color: effectiveStatus === 'accepted' ? 0x00c364 : effectiveStatus === 'rejected' ? 0xdb001d : 0x3b82f6,
                footer: { text: 'ASOT Dashboard' },
                timestamp: new Date().toISOString(),
            }],
        }, 'raw').catch(err => console.error('[j1/applications] Applicant DM failed', err))
    }

    // Notify assigned recruiter when application is sent back for review
    if (status === 'returned' && app.assignedReviewerId) {
        const noteText = recruiterNote?.toString().trim() ?? ''
        createNotification({
            userId: app.assignedReviewerId,
            type: 'task_assigned',
            title: `Application returned — ${applicantName}`,
            body: `${displayName} has sent the application for ${applicantName} back for your review. Check the notes for details.`,
            actionUrl: `/dashboard/j1?tab=1&app=${id}`,
            relatedId: id,
        }).catch(err => console.error('[j1/applications] Recruiter return notification failed', err))
        sendDM(app.assignedReviewerId, {
            embeds: [{
                title: '↩ Application Returned for Review',
                description: `**${displayName}** has sent the application for **${applicantName}** back to you for review.\n\n**Note from lead:**\n${noteText}`,
                color: 0xf59e0b,
                footer: { text: 'ASOT Dashboard' },
                timestamp: new Date().toISOString(),
            }],
        }, 'raw').catch(err => console.error('[j1/applications] Recruiter return DM failed', err))
    }

    // Notify J1 Lead when recruiter resubmits a returned application
    if (status === 'pending' && isAssignedRecruiter && app.status === 'returned' && app.assignedByLeadId) {
        createNotification({
            userId: app.assignedByLeadId,
            type: 'task_assigned',
            title: `Application resubmitted — ${applicantName}`,
            body: `${displayName} has reviewed and resubmitted the application for ${applicantName}.`,
            actionUrl: `/dashboard/j1?tab=1&app=${id}`,
            relatedId: id,
        }).catch(err => console.error('[j1/applications] Lead resubmit notification failed', err))
        if (app.assignedByLeadId !== me.id) {
            sendDM(app.assignedByLeadId, {
                embeds: [{
                    title: '📋 Application Resubmitted',
                    description: `**${displayName}** has reviewed and resubmitted the application for **${applicantName}**.`,
                    color: 0x3b82f6,
                    footer: { text: 'ASOT Dashboard' },
                    timestamp: new Date().toISOString(),
                }],
            }, 'raw').catch(err => console.error('[j1/applications] Lead resubmit DM failed', err))
        }
    }

    // Create task + run returning-member check when recruiter is newly assigned
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
                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
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
                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                relatedId: insertResult.insertedId.toString(),
            })
            sendTaskAssignedDM(assignedReviewerId, taskTitle, notifBody, '/dashboard/j1').catch(err =>
                console.error('[j1/applications] DM failed for', assignedReviewerId, err)
            )
        } catch (err) {
            console.error('[j1/applications] Failed to create recruiter task:', err)
        }

        // Run returning-member check if the applicant has a known Discord ID
        if (app.discordId) {
            runReturningMemberCheck(app.discordId).then(async check => {
                const checkData = {
                    status: check.status,
                    checkedAt: new Date().toISOString(),
                    details: check.details,
                }
                await Db.j1Applications.updateOne({ _id: objectId }, { $set: { returningMemberCheck: checkData } })

                if (check.status === 'HD') {
                    // HD: inform recruiter, no lock, no J4 task
                    createNotification({
                        userId: assignedReviewerId,
                        type: 'task_assigned',
                        title: `Returning member (HD) — ${applicantName}`,
                        body: `${applicantName} is a returning member with an Honourable Discharge. You may continue with the application normally. Details: ${check.details}`,
                        actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                        relatedId: id,
                    }).catch(() => null)
                } else if (check.status === 'GD') {
                    // GD: warn recruiter with reason, no lock, no J4 task — optional J4 notify available in UI
                    createNotification({
                        userId: assignedReviewerId,
                        type: 'task_assigned',
                        title: `Returning member (GD) — ${applicantName}`,
                        body: `${applicantName} is a returning member with a General Discharge. Review their prior history before proceeding. Details: ${check.details}`,
                        actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                        relatedId: id,
                    }).catch(() => null)
                } else if (check.status === 'DD') {
                    // DD: create J4 task + lock recruiter until J4 clears
                    const j4Members = await Db.users
                        .find({ 'guild.roles': { $in: PERMISSIONS.departments.j4 }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
                        .project<{ _id: string; id: string; guild?: { nickname?: string } }>({ _id: 1, id: 1, guild: 1 })
                        .toArray()

                    let j4TaskId: string | undefined
                    for (const j4User of j4Members) {
                        const j4Name = (j4User as any).guild?.nickname ?? (j4User as any).globalName ?? j4User.id
                        try {
                            const t = await Db.tasks.insertOne({
                                title: `DD returning-member review — ${applicantName}`,
                                description: `A recruiter has been assigned to ${applicantName}'s application. This applicant has a Dishonourable Discharge on record and requires J4 clearance before the recruiter can proceed.\n\n**Details:** ${check.details}`,
                                assignedTo: j4User.id as string,
                                assignedToName: j4Name,
                                assignedBy: me.id,
                                assignedByName: displayName,
                                type: 'j4_returning_review',
                                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                                relatedId: id,
                                status: 'pending',
                                dueDate: dueDate,
                                createdAt: new Date(),
                            } as unknown as Task)
                            j4TaskId = t.insertedId.toString()
                        } catch { /* ignore */ }
                        await createNotification({
                            userId: j4User.id as string,
                            type: 'task_assigned',
                            title: `DD returning-member review required — ${applicantName}`,
                            body: `${applicantName} has submitted a recruitment application and has a Dishonourable Discharge on record. J4 clearance is required before the recruiter can proceed.\n\nDetails: ${check.details}`,
                            actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                            relatedId: id,
                        }).catch(() => null)
                    }

                    // Lock recruiter and mark pending J4 review
                    const j4Update: Record<string, unknown> = { j4ReviewStatus: 'pending' }
                    if (j4TaskId) j4Update.j4ReviewTaskId = j4TaskId
                    await Db.j1Applications.updateOne({ _id: objectId }, { $set: j4Update })

                    // Notify recruiter of lock
                    createNotification({
                        userId: assignedReviewerId,
                        type: 'task_assigned',
                        title: `J4 review required — ${applicantName}`,
                        body: `${applicantName} has a Dishonourable Discharge on record. J4 must review and approve before you can submit your recommendation. Details: ${check.details}`,
                        actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                        relatedId: id,
                    }).catch(() => null)

                    // Ping J1-Recruitment Discord channel
                    const j1Channel = process.env.DISCORD_J1_RECRUITMENT_CHANNEL_ID
                    const j4RoleId = process.env.DISCORD_J4_ROLE_ID
                    if (j1Channel) {
                        const j4Mention = j4RoleId ? `<@&${j4RoleId}>` : '@J4'
                        sendChannelMessage(j1Channel, {
                            content: `*${applicantName}* is requesting to rejoin. <@${me.id}> requests ${j4Mention} confirmation that the applicant is eligible to rejoin.`,
                        }, 'j1_returning_member').catch(err =>
                            console.error('[j1/applications] J1-Recruitment channel ping failed:', err)
                        )
                    }
                }
            }).catch(err => console.error('[j1/applications] Returning-member check failed:', err))
        }
    }

    // J1 Lead makes final accept/reject — award billet point + run onboarding
    const isFinalDecision = (status === 'accepted' || status === 'rejected') && (isJ1Lead || isJ4)

    if (isFinalDecision && status === 'accepted' && app.assignedReviewerId) {
        awardInterviewPoint(app.assignedReviewerId).catch(err =>
            console.error('[j1/applications] Billet point award failed:', err)
        )
    }

    if (isFinalDecision) {
        // Notify assigned recruiter that lead has made final decision
        if (app.assignedReviewerId && app.assignedReviewerId !== me.id) {
            createNotification({
                userId: app.assignedReviewerId,
                type: 'task_assigned',
                title: `Application ${status} — ${applicantName}`,
                body: `${displayName} has made the final decision: ${status} for ${applicantName}.`,
                actionUrl: `/dashboard/j1?tab=1&app=${id}`,
                relatedId: id,
            }).catch(() => null)
            sendDM(app.assignedReviewerId, {
                embeds: [{
                    title: status === 'accepted' ? '✅ Application Accepted' : '❌ Application Rejected',
                    description: `**${displayName}** has made the final decision: **${status}** for **${applicantName}**.`,
                    color: status === 'accepted' ? 0x00c364 : 0xdb001d,
                    footer: { text: 'ASOT Dashboard' },
                    timestamp: new Date().toISOString(),
                }],
            }, 'raw').catch(() => null)
        }
    }

    // On acceptance — full onboarding sequence
    if (status === 'accepted' && app.linkedUserId) {
        const memberId = app.linkedUserId
        const igName = app.inGameName?.trim() || app.linkedUserDisplayName || 'Member'

        Promise.allSettled([
            Db.roles.findOne({ name: 'ASOT Member' })
                .then(role => role?.id ? addGuildRole(memberId, role.id) : null),
            Db.roles.findOne({ name: 'Reservist' })
                .then(role => role?.id ? addGuildRole(memberId, role.id) : null),
            Db.roles.findOne({ name: 'Applicant' })
                .then(role => role?.id ? removeGuildRole(memberId, role.id) : null),
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
            Db.orbatPositions.countDocuments({ category: 'activeReservist' })
                .then(count => Db.orbatPositions.insertOne({
                    category: 'activeReservist',
                    sectionTitle: '',
                    role: 'Active Reservist',
                    userId: memberId,
                    sectionOrder: 0,
                    positionOrder: count,
                } as OrbatPosition)),
            setGuildNickname(memberId, buildNickname('REC', igName)),
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
