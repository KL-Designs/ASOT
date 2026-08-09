import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { getQuizById } from '@/lib/quiz-data'
import QuizReviewClient from './quiz-review-client'

interface Props {
    params: Promise<{ attemptId: string }>
}

export default async function Page({ params }: Props) {
    await connection()
    const { attemptId } = await params

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.quiz.review)) redirect('/dashboard')

    let oid: ObjectId
    try {
        oid = new ObjectId(attemptId)
    } catch {
        redirect('/dashboard/j3')
    }

    const attempt = await Db.quizAttempts.findOne({ _id: oid })
    if (!attempt) redirect('/dashboard/j3')

    const quiz = getQuizById(attempt.quizId)
    if (!quiz) redirect('/dashboard/j3')

    const canEscalate = client.hasRoles(me, PERMISSIONS.quiz.reviewEscalated)
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)

    const serialized: QuizAttemptSerialized = {
        ...attempt,
        _id: attempt._id!.toString(),
        startedAt: attempt.startedAt?.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString(),
        createdAt: attempt.createdAt.toISOString(),
    }

    return (
        <QuizReviewClient
            quiz={quiz}
            attempt={serialized}
            canEscalate={canEscalate}
            isJ4={isJ4}
        />
    )
}
