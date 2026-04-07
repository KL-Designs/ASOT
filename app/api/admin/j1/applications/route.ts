import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'

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
        discordUsername, discordId, joiningName, recruiter, notes,
        steamId64, region, regionCustom, armaHours, primaryRole, availableNights,
        heardAbout, heardAboutOther,
    } = body

    if (!discordUsername?.trim()) return NextResponse.json({ error: 'Discord username is required.' }, { status: 400 })
    if (!discordId?.trim()) return NextResponse.json({ error: 'Discord ID is required.' }, { status: 400 })
    if (!joiningName?.trim()) return NextResponse.json({ error: 'Joining name is required.' }, { status: 400 })
    if (joiningName.trim().length > 12) return NextResponse.json({ error: 'Joining name must be 12 characters or fewer.' }, { status: 400 })
    if (!steamId64?.trim()) return NextResponse.json({ error: 'Steam ID64 is required.' }, { status: 400 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const effectiveRegion = region === 'Other' && regionCustom?.trim() ? regionCustom.trim() : region?.trim()

    await Db.j1Applications.insertOne({
        discordUsername: discordUsername.trim(),
        discordId: discordId.trim(),
        inGameName: joiningName.trim(),
        age: 0,
        experience: '',
        status: 'accepted',
        submittedAt: new Date(),
        isDirectRecruit: true,
        recruiter: recruiter?.trim() || displayName,
        notes: notes?.trim() || '',
        reviewedBy: displayName,
        reviewedAt: new Date(),
        steamId64: steamId64.trim(),
        region: effectiveRegion || undefined,
        armaHours: armaHours?.trim() || undefined,
        primaryRole: primaryRole?.trim() || undefined,
        availableNights: availableNights?.trim() || undefined,
        heardAbout: heardAbout?.trim() || undefined,
        heardAboutOther: heardAboutOther?.trim() || undefined,
    })

    // Notify J1 leads to sign off on the new recruit
    await createNotificationForRole('J1-Staff', {
        type: 'task_assigned',
        title: 'New recruit requires sign-off',
        body: `${displayName} logged ${joiningName.trim()} as a new recruit`,
        actionUrl: '/admin/j1',
    })

    return NextResponse.json({ ok: true })
}
