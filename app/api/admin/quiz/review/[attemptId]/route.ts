import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { getQuizById } from '@/lib/quiz-data'
import { createNotification, createNotificationForRole } from '@/lib/notifications'

// GET /api/admin/quiz/review/[attemptId]
// Returns quiz definition + attempt for the review page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
    const { attemptId } = await params

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.quiz.review)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let oid: ObjectId
    try {
        oid = new ObjectId(attemptId)
    } catch {
        return NextResponse.json({ error: 'Invalid attempt ID' }, { status: 400 })
    }

    const attempt = await Db.quizAttempts.findOne({ _id: oid })
    if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const quiz = getQuizById(attempt.quizId)
    if (!quiz) return NextResponse.json({ error: 'Quiz definition not found' }, { status: 404 })

    const serialized: QuizAttemptSerialized = {
        ...attempt,
        _id: attempt._id!.toString(),
        startedAt: attempt.startedAt?.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString(),
        createdAt: attempt.createdAt.toISOString(),
    }

    return NextResponse.json({ quiz, attempt: serialized })
}

// POST /api/admin/quiz/review/[attemptId]
// Body: { action: 'pass' | 'fail' | 'send_for_review', notes: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
    const { attemptId } = await params

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.quiz.review)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let oid: ObjectId
    try {
        oid = new ObjectId(attemptId)
    } catch {
        return NextResponse.json({ error: 'Invalid attempt ID' }, { status: 400 })
    }

    const attempt = await Db.quizAttempts.findOne({ _id: oid })
    if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!['submitted', 'reviewing'].includes(attempt.status)) {
        return NextResponse.json({ error: 'Attempt is not awaiting review' }, { status: 409 })
    }

    const body = await req.json()
    const action: 'pass' | 'fail' | 'send_for_review' = body.action
    const notes: string = (body.notes ?? '').trim()

    if (action === 'send_for_review' && !notes) {
        return NextResponse.json({ error: 'Notes are required when sending for review' }, { status: 400 })
    }

    const reviewerName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const historyEntry: QuizReviewHistoryEntry = {
        reviewerId: me.id,
        reviewerName,
        action: action === 'pass' ? 'passed' : action === 'fail' ? 'failed' : 'sent_for_review',
        notes,
        timestamp: new Date().toISOString(),
    }

    if (action === 'pass') {
        await Db.quizAttempts.updateOne({ _id: oid }, {
            $set: {
                status: 'passed',
                result: 'pass',
                currentReviewerId: me.id,
                currentReviewerName: reviewerName,
            },
            $push: { reviewHistory: historyEntry },
        })

        // Notify recruit — pass
        await createNotification({
            userId: attempt.userId,
            type: 'quiz_result',
            title: 'BCT Quiz Result',
            body: 'Congratulations, you have passed the BCT Confirmation Quiz. Your J3 trainer will be in touch with you shortly.',
            actionUrl: `/community/quiz/${attemptId}`,
            relatedId: attemptId,
        })

        // Mark the original task completed
        if (attempt.assignmentTaskId) {
            try {
                await Db.tasks.updateOne(
                    { _id: new ObjectId(attempt.assignmentTaskId) },
                    { $set: { status: 'completed', completedAt: new Date(), notes: 'Quiz passed.' } }
                )
            } catch { /* task may not exist */ }
        }

        return NextResponse.json({ ok: true })
    }

    if (action === 'fail') {
        await Db.quizAttempts.updateOne({ _id: oid }, {
            $set: {
                status: 'failed',
                result: 'fail',
                currentReviewerId: me.id,
                currentReviewerName: reviewerName,
            },
            $push: { reviewHistory: historyEntry },
        })

        // Notify recruit — fail
        await createNotification({
            userId: attempt.userId,
            type: 'quiz_result',
            title: 'BCT Quiz Result',
            body: 'Unfortunately, you did not meet the requirements for this quiz. Your J3 trainer will be in touch with you shortly.',
            actionUrl: `/community/quiz/${attemptId}`,
            relatedId: attemptId,
        })

        // Mark the original task completed (failed outcome)
        if (attempt.assignmentTaskId) {
            try {
                await Db.tasks.updateOne(
                    { _id: new ObjectId(attempt.assignmentTaskId) },
                    { $set: { status: 'completed', completedAt: new Date(), notes: 'Quiz failed.' } }
                )
            } catch { /* task may not exist */ }
        }

        return NextResponse.json({ ok: true })
    }

    if (action === 'send_for_review') {
        // Determine next reviewer in the escalation chain:
        //   1st review (trainer) → J3 Team Lead
        //   J3 Team Lead         → J4 Administration
        //   J4 Administration    → no further escalation

        const isJ3Lead = client.hasRoles(me, PERMISSIONS.departmentLeads.j3)
        const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

        let nextRoleName: string
        if (isJ4) {
            return NextResponse.json({ error: 'J4 cannot escalate further. Please Pass or Fail.' }, { status: 400 })
        } else if (isJ3Lead) {
            nextRoleName = 'J4-Administration'
        } else {
            nextRoleName = 'J3-Team Lead'
        }

        await Db.quizAttempts.updateOne({ _id: oid }, {
            $set: {
                status: 'reviewing',
                currentReviewerName: nextRoleName,
            },
            $unset: { currentReviewerId: '' },
            $push: { reviewHistory: historyEntry },
        })

        // Notify recruit — under review
        await createNotification({
            userId: attempt.userId,
            type: 'quiz_result',
            title: 'Quiz under review',
            body: 'Your quiz requires further review. Your result may be delayed. We appreciate your patience.',
            actionUrl: `/community/quiz/${attemptId}`,
            relatedId: attemptId,
        })

        // Notify next reviewer role
        await createNotificationForRole(nextRoleName, {
            type: 'quiz_review_requested',
            title: 'Quiz sent for review',
            body: `${reviewerName} has sent ${attempt.userName}'s BCT quiz for your review. Notes: ${notes}`,
            actionUrl: `/admin/quiz/review/${attemptId}`,
            relatedId: attemptId,
        })

        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
