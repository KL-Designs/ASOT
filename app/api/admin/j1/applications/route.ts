import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/j1/applications — fetch all applications
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const applications = await Db.j1Applications
        .find({})
        .sort({ submittedAt: -1 })
        .toArray()

    return NextResponse.json({ applications })
}

// POST /api/admin/j1/applications — create a direct recruit record (bypasses rate limit)
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: Record<string, string>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const {
        discordUsername, inGameName, recruiter, notes,
        steamUrl, region, armaHours, primaryRole, availableNights,
    } = body

    if (!discordUsername?.trim()) return NextResponse.json({ error: 'Discord username is required.' }, { status: 400 })
    if (!inGameName?.trim()) return NextResponse.json({ error: 'In-game name is required.' }, { status: 400 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'

    await Db.j1Applications.insertOne({
        discordUsername: discordUsername.trim(),
        inGameName: inGameName.trim(),
        age: 0,
        experience: '',
        status: 'accepted',
        submittedAt: new Date(),
        isDirectRecruit: true,
        recruiter: recruiter?.trim() || displayName,
        notes: notes?.trim() || '',
        reviewedBy: displayName,
        reviewedAt: new Date(),
        steamUrl: steamUrl?.trim() || undefined,
        region: region?.trim() || undefined,
        armaHours: armaHours?.trim() || undefined,
        primaryRole: primaryRole?.trim() || undefined,
        availableNights: availableNights?.trim() || undefined,
    })

    return NextResponse.json({ ok: true })
}
