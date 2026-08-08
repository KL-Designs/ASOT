import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'

// GET /api/recruit-session/[id] — fetch public session state (for applicant page)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })

    const session = await Db.recruitSessions.findOne(
        { sessionId: id },
        { projection: { step: 1, raisedHand: 1, applicantName: 1, recruiterName: 1, expiresAt: 1 } }
    )

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    if (session.expiresAt && new Date() > session.expiresAt) {
        return NextResponse.json({ error: 'Session expired' }, { status: 410 })
    }

    return NextResponse.json({
        step: session.step,
        raisedHand: session.raisedHand,
        recruiterName: session.recruiterName,
        applicantName: session.applicantName,
    })
}
