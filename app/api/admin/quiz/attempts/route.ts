import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/quiz/attempts
// Returns all quiz attempts for the Training Records view.
// Query params:
//   ?status=all|pending_review|passed|failed  (default: all)
//   ?quizId=bct-quiz                          (default: all quizzes)
//   ?assignedBy=<userId>                      (filter by assigning trainer)
export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.quiz.assign)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const statusFilter = sp.get('status') ?? 'all'
    const quizIdFilter = sp.get('quizId') ?? null
    const assignedByFilter = sp.get('assignedBy') ?? null

    const filter: Record<string, unknown> = {}

    if (quizIdFilter) filter.quizId = quizIdFilter

    if (assignedByFilter) filter.assignedBy = assignedByFilter

    if (statusFilter === 'pending_review') {
        filter.status = 'submitted'
    } else if (statusFilter === 'passed') {
        filter.status = 'passed'
    } else if (statusFilter === 'failed') {
        filter.status = 'failed'
    }
    // 'all' → no status filter

    const raw = await Db.quizAttempts
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray()

    const attempts: QuizAttemptSerialized[] = raw.map(a => ({
        ...a,
        _id: a._id!.toString(),
        startedAt: a.startedAt?.toISOString(),
        submittedAt: a.submittedAt?.toISOString(),
        createdAt: a.createdAt.toISOString(),
    }))

    return NextResponse.json({ attempts })
}
