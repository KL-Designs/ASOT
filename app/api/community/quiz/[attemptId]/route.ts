import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getQuizById } from '@/lib/quiz-data'

// GET /api/community/quiz/[attemptId]
// Returns quiz definition + attempt data for the authenticated recruit.
// Validates that the attempt belongs to the caller.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
    const { attemptId } = await params

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let oid: ObjectId
    try {
        oid = new ObjectId(attemptId)
    } catch {
        return NextResponse.json({ error: 'Invalid attempt ID' }, { status: 400 })
    }

    const attempt = await Db.quizAttempts.findOne({ _id: oid })
    if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (attempt.userId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

// PATCH /api/community/quiz/[attemptId]
// Actions: 'start' | 'save' | 'submit'
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
    const { attemptId } = await params

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let oid: ObjectId
    try {
        oid = new ObjectId(attemptId)
    } catch {
        return NextResponse.json({ error: 'Invalid attempt ID' }, { status: 400 })
    }

    const attempt = await Db.quizAttempts.findOne({ _id: oid })
    if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (attempt.userId !== me.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const action: 'start' | 'save' | 'submit' = body.action

    if (action === 'start') {
        if (attempt.status !== 'assigned') {
            return NextResponse.json({ error: 'Quiz already started or closed' }, { status: 409 })
        }
        await Db.quizAttempts.updateOne({ _id: oid }, {
            $set: { status: 'in_progress', startedAt: new Date() },
        })
        return NextResponse.json({ ok: true })
    }

    if (action === 'save') {
        if (attempt.status !== 'in_progress') {
            return NextResponse.json({ error: 'Quiz is not in progress' }, { status: 409 })
        }
        const answers: QuizAnswer[] = body.answers ?? []
        await Db.quizAttempts.updateOne({ _id: oid }, { $set: { answers } })
        return NextResponse.json({ ok: true })
    }

    if (action === 'submit') {
        if (!['in_progress'].includes(attempt.status)) {
            return NextResponse.json({ error: 'Quiz cannot be submitted in its current state' }, { status: 409 })
        }
        const answers: QuizAnswer[] = body.answers ?? attempt.answers
        const now = new Date()
        const timeTakenSeconds = attempt.startedAt
            ? Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000)
            : undefined

        await Db.quizAttempts.updateOne({ _id: oid }, {
            $set: {
                status: 'submitted',
                answers,
                submittedAt: now,
                ...(timeTakenSeconds !== undefined ? { timeTakenSeconds } : {}),
                // Trainer who assigned the quiz becomes initial reviewer
                currentReviewerId: attempt.assignedBy,
                currentReviewerName: attempt.assignedByName,
            },
        })

        // Notify the assigning trainer that the quiz has been submitted
        try {
            await Db.notifications.insertOne({
                userId: attempt.assignedBy,
                type: 'quiz_submitted',
                title: 'Quiz submitted for review',
                body: `${attempt.userName} has submitted the BCT Confirmation Quiz.`,
                actionUrl: `/admin/quiz/review/${attemptId}`,
                relatedId: attemptId,
                createdAt: new Date(),
            } as Notification)
        } catch {
            // notification failure must not break submission
        }

        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
