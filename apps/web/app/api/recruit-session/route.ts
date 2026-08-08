import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { randomUUID } from 'crypto'

// POST /api/recruit-session — create a new live recruitment session
export async function POST() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sessionId = randomUUID()
    const recruiterToken = randomUUID()
    const recruiterName = me.guild?.displayName || me.globalName || me.username || 'Recruiter'
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000) // 8 hours

    const session: RecruitSession = {
        sessionId,
        recruiterId: me._id,
        recruiterName,
        recruiterToken,
        step: 1,
        raisedHand: false,
        applicantName: null,
        formSnapshot: {},
        createdAt: now,
        lastActivity: now,
        expiresAt,
    }

    await Db.recruitSessions.insertOne(session)

    const baseUrl = process.env.NEXT_PUBLIC_BASEURL ?? ''
    const applicantUrl = `${baseUrl}/recruit-session/${sessionId}`

    return NextResponse.json({ sessionId, recruiterToken, applicantUrl })
}
