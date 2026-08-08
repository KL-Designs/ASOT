import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getQuizById } from '@/lib/quiz-data'
import QuizClient from './quiz-client'

interface Props {
    params: Promise<{ attemptId: string }>
}

export default async function Page({ params }: Props) {
    await connection()
    const { attemptId } = await params

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')

    let oid: ObjectId
    try {
        oid = new ObjectId(attemptId)
    } catch {
        redirect('/')
    }

    const attempt = await Db.quizAttempts.findOne({ _id: oid })
    if (!attempt || attempt.userId !== me.id) redirect('/')

    const quiz = getQuizById(attempt.quizId)
    if (!quiz) redirect('/')

    // Already closed — show a static result page instead of the active quiz
    if (['passed', 'failed'].includes(attempt.status)) {
        return (
            <div style={{
                minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 32,
            }}>
                <div style={{
                    maxWidth: 480, width: '100%', textAlign: 'center',
                    border: attempt.status === 'passed' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(219,0,29,0.3)',
                    borderTop: attempt.status === 'passed' ? '2px solid rgba(34,197,94,0.8)' : '2px solid #db001d',
                    padding: '32px 28px',
                    background: 'rgba(0,0,0,0.3)',
                }}>
                    <div style={{
                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.25em',
                        textTransform: 'uppercase', fontFamily: 'monospace',
                        color: attempt.status === 'passed' ? 'rgba(34,197,94,0.6)' : 'rgba(219,0,29,0.6)',
                        marginBottom: 12,
                    }}>
                        {'// RESULT'}
                    </div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(237,237,237,0.88)', lineHeight: 1.6, margin: 0 }}>
                        {attempt.status === 'passed'
                            ? 'Congratulations, you have passed the quiz.'
                            : 'Unfortunately, you did not meet the requirements for this quiz. Your J3 trainer will be in touch with you shortly.'}
                    </p>
                </div>
            </div>
        )
    }

    if (attempt.status === 'reviewing' || attempt.status === 'submitted') {
        return (
            <div style={{
                minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 32,
            }}>
                <div style={{
                    maxWidth: 480, width: '100%', textAlign: 'center',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderTop: '2px solid rgba(245,158,11,0.8)',
                    padding: '32px 28px',
                    background: 'rgba(0,0,0,0.3)',
                }}>
                    <div style={{
                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.25em',
                        textTransform: 'uppercase', fontFamily: 'monospace',
                        color: 'rgba(245,158,11,0.6)', marginBottom: 12,
                    }}>
                        {'// UNDER REVIEW'}
                    </div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(237,237,237,0.88)', lineHeight: 1.6, margin: 0 }}>
                        Your quiz requires further review. Your result may be delayed. We appreciate your patience.
                    </p>
                </div>
            </div>
        )
    }

    const serialized: QuizAttemptSerialized = {
        ...attempt,
        _id: attempt._id!.toString(),
        startedAt: attempt.startedAt?.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString(),
        createdAt: attempt.createdAt.toISOString(),
    }

    return <QuizClient quiz={quiz} initialAttempt={serialized} />
}
