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
        heardAbout, heardAboutOther, age, experience, opsPerMonth,
        ownsArma, priorMilsim, dualClan, previousUnits, currentUnit,
        additionalRoles, departmentInterest, ageExemptionNote,
    } = body as Record<string, string | string[] | boolean>

    if (!discordUsername?.toString().trim()) return NextResponse.json({ error: 'Discord username is required.' }, { status: 400 })
    if (!discordId?.toString().trim()) return NextResponse.json({ error: 'Discord ID is required.' }, { status: 400 })
    if (!joiningName?.toString().trim()) return NextResponse.json({ error: 'Joining name is required.' }, { status: 400 })
    if (joiningName.toString().trim().length > 12) return NextResponse.json({ error: 'Joining name must be 12 characters or fewer.' }, { status: 400 })
    if (!steamId64?.toString().trim()) return NextResponse.json({ error: 'Steam account is required.' }, { status: 400 })

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    const regionStr = region?.toString().trim() ?? ''
    const regionCustomStr = regionCustom?.toString().trim() ?? ''
    const effectiveRegion = regionStr === 'Other' && regionCustomStr ? regionCustomStr : regionStr

    await Db.j1Applications.insertOne({
        discordUsername: discordUsername.toString().trim(),
        discordId: discordId.toString().trim(),
        inGameName: joiningName.toString().trim(),
        age: age ? Number(age) : 0,
        experience: experience?.toString().trim() || '',
        status: 'pending',
        submittedAt: new Date(),
        isDirectRecruit: true,
        recruiter: recruiter?.toString().trim() || displayName,
        notes: notes?.toString().trim() || '',
        assignedReviewerId: me._id,
        assignedReviewerName: displayName,
        assignedByLeadId: me._id,
        assignedByLeadName: displayName,
        steamId64: steamId64.toString().trim(),
        region: effectiveRegion || undefined,
        armaHours: armaHours?.toString().trim() || undefined,
        primaryRole: primaryRole?.toString().trim() || undefined,
        availableNights: availableNights?.toString().trim() || undefined,
        opsPerMonth: opsPerMonth?.toString().trim() || undefined,
        heardAbout: heardAbout?.toString().trim() || undefined,
        heardAboutOther: heardAboutOther?.toString().trim() || undefined,
        ownsArma: ownsArma === true || ownsArma === 'true',
        priorMilsim: priorMilsim === true || priorMilsim === 'true',
        dualClan: dualClan === true || dualClan === 'true',
        previousUnits: previousUnits?.toString().trim() || undefined,
        currentUnit: currentUnit?.toString().trim() || undefined,
        additionalRoles: Array.isArray(additionalRoles) ? additionalRoles : undefined,
        departmentInterest: Array.isArray(departmentInterest) ? departmentInterest : undefined,
        ageExemptionNote: ageExemptionNote?.toString().trim() || undefined,
    })

    // Notify J1 leads to sign off on the new recruit
    await createNotificationForRole('J1-Staff', {
        type: 'task_assigned',
        title: 'New recruit requires sign-off',
        body: `${displayName} logged ${joiningName.toString().trim()} as a new recruit`,
        actionUrl: '/admin/j1',
    })

    return NextResponse.json({ ok: true })
}
