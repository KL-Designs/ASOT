import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { toBoardUser } from '@/lib/attendance/board-user'
import { canDo, cleanLink, holdsNight, type NcoAction } from '@/lib/training/nco-assessment'
import { ncoActor, staffOfSection, toNcoView } from '@/lib/training/nco-actor'

const ACTION_URL = '/dashboard/unit/training-docs?tab=assessments'
const OUTCOMES = ['pass', 'not_yet', 'reassess'] as const

/**
 * `PATCH /api/nco-assessments/{id}` — one step of an assessment.
 *
 * `{ action, ... }`, where the action is one of the steps in
 * `lib/training/nco-assessment.ts`. Whether the caller may take it is `canDo`
 * and nothing else: the same function the list used to decide which buttons to
 * show, so a button that is offered is a request that is accepted.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const _id = new ObjectId(id)

    const assessment = await Db.ncoAssessments.findOne({ _id })
    if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const action = body.action as NcoAction
    const actor = await ncoActor(me)
    if (typeof action !== 'string' || !canDo(action, actor, assessment)) {
        return NextResponse.json({ error: 'You cannot do that on this assessment.' }, { status: 403 })
    }

    const now = new Date()
    const myName = toBoardUser(me, me.id).displayName
    const set: Partial<NcoAssessment> = { updatedAt: now }
    const notify: { userId: string; title: string; body: string }[] = []
    const night = assessment.operationTitle

    switch (action) {
        case 'assign': {
            const assessorId = typeof body.assessorId === 'string' ? body.assessorId : ''
            if (!assessorId) return NextResponse.json({ error: 'Pick an assessor.' }, { status: 400 })
            if (assessorId === assessment.candidateId) {
                return NextResponse.json({ error: 'A candidate cannot assess themselves.' }, { status: 400 })
            }
            const assessor = await Db.users.findOne({ id: assessorId, discharged: { $exists: false } })
            if (!assessor) return NextResponse.json({ error: 'No such member.' }, { status: 400 })

            // Assigning is what takes the night, so it is checked here, not
            // only when the request was made: two requests can both be waiting.
            const other = await Db.ncoAssessments.findOne({ operationId: assessment.operationId, _id: { $ne: _id } })
            if (other && holdsNight(other.status)) {
                return NextResponse.json({ error: 'That night already has an assessment booked.' }, { status: 409 })
            }

            const assessorName = toBoardUser(assessor, assessorId).displayName
            Object.assign(set, {
                assessorId, assessorName, assignedById: me.id, assignedByName: myName, assignedAt: now,
                // A new assessor has not said yes, and did not ask to shadow.
                status: 'assigned', shadow: null,
            })
            notify.push({
                userId: assessorId,
                title: 'You have been asked to assess an NCO candidate',
                body: `${myName} has put you down to assess ${assessment.candidateName} on ${night}. Mark yourself as assigned to confirm.`,
            })
            notify.push({
                userId: assessment.candidateId,
                title: 'An assessor has been named for your NCO assessment',
                body: `${assessorName} has been asked to assess you on ${night}.`,
            })
            break
        }

        case 'confirm':
            Object.assign(set, { status: 'confirmed', confirmedAt: now })
            notify.push({
                userId: assessment.candidateId,
                title: 'Your NCO assessment is confirmed',
                body: `${myName} has confirmed they will assess you on ${night}.`,
            })
            if (assessment.assignedById) {
                notify.push({
                    userId: assessment.assignedById,
                    title: 'NCO assessor confirmed',
                    body: `${myName} has confirmed the assessment of ${assessment.candidateName} on ${night}.`,
                })
            }
            break

        case 'requestShadow': {
            if (!assessment.candidateSection) {
                return NextResponse.json({ error: 'The candidate has no section to shadow.' }, { status: 400 })
            }
            set.shadow = { status: 'requested', requestedAt: now }
            for (const userId of await staffOfSection(assessment.candidateSection)) {
                if (userId === me.id || userId === assessment.candidateId) continue
                notify.push({
                    userId,
                    title: `Shadow request for ${assessment.candidateSection}`,
                    body: `${myName} is assessing ${assessment.candidateName} on ${night} and has asked to shadow ${assessment.candidateSection}. It needs your approval.`,
                })
            }
            break
        }

        case 'decideShadow': {
            const approved = body.approve === true
            set.shadow = {
                status: approved ? 'approved' : 'declined',
                requestedAt: assessment.shadow?.requestedAt ?? now,
                decidedById: me.id, decidedByName: myName, decidedAt: now,
            }
            const word = approved ? 'approved' : 'declined'
            const text = `${myName} has ${word} the shadow of ${assessment.candidateSection} for ${assessment.candidateName}'s assessment on ${night}.`
            // The assessor and whoever assigned them both need to see it (the
            // brief: "shows approved to the J3 lead and the assigned assessor").
            for (const userId of new Set([assessment.assessorId, assessment.assignedById])) {
                if (userId) notify.push({ userId, title: `Shadow ${word}`, body: text })
            }
            break
        }

        case 'sheet': {
            if (body.sheetUrl !== undefined) {
                const link = cleanLink(body.sheetUrl)
                if (body.sheetUrl && !link) return NextResponse.json({ error: 'The sheet link has to be a web address.' }, { status: 400 })
                set.sheetUrl = link
            }
            if (typeof body.assessorNotes === 'string') set.assessorNotes = body.assessorNotes.trim().slice(0, 6000)
            if (body.outcome !== undefined) {
                if (body.outcome !== null && !OUTCOMES.includes(body.outcome)) {
                    return NextResponse.json({ error: 'Unknown outcome.' }, { status: 400 })
                }
                set.outcome = body.outcome
            }
            break
        }

        case 'recording': {
            const link = cleanLink(body.recordingUrl)
            if (body.recordingUrl && !link) return NextResponse.json({ error: 'The recording link has to be a web address.' }, { status: 400 })
            set.recordingUrl = link
            break
        }

        case 'complete':
            Object.assign(set, { status: 'completed', completedAt: now })
            notify.push({
                userId: assessment.candidateId,
                title: 'Your NCO assessment has been written up',
                body: `The assessment from ${night} is complete. Your assessor will go through it with you.`,
            })
            break

        case 'cancel':
            Object.assign(set, { status: 'cancelled', cancelledAt: now, cancelledByName: myName })
            for (const userId of new Set([assessment.candidateId, assessment.assessorId])) {
                if (userId && userId !== me.id) {
                    notify.push({
                        userId,
                        title: 'NCO assessment cancelled',
                        body: `${myName} cancelled ${assessment.candidateName}'s assessment on ${night}.`,
                    })
                }
            }
            break
    }

    await Db.ncoAssessments.updateOne({ _id }, { $set: set })

    await Promise.all(notify.map(n => createNotification({
        userId: n.userId, type: 'nco_assessment', title: n.title, body: n.body, actionUrl: ACTION_URL, relatedId: id,
    }).catch(() => { })))

    logAction({
        action: `training.nco.${action}`, category: 'training', department: 'j3',
        performedBy: me.id, performedByName: myName,
        entityType: 'nco_assessment', entityId: id, target: `${assessment.candidateName} · ${night}`,
    }).catch(console.error)

    const fresh = await Db.ncoAssessments.findOne({ _id })
    return NextResponse.json(fresh ? toNcoView(fresh, actor) : { ok: true })
}
