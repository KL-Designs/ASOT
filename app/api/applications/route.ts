import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'

// Country is now a free-form string (full country list in the form)
const VALID_REGIONS = null // kept for reference, no longer a fixed enum
const VALID_NIGHTS  = ['Saturday', 'Sunday', 'Both', 'Flexible']
const VALID_OPS     = ['1+', '2+', '3+', '4+']
const VALID_ROLES   = [
    'Infantry', 'Section Medic', 'Advanced Medic', 'Rotary Aviation',
    'Fixed Wing Aviation', 'Armored Crew', 'Machine Gunner', 'Medium Anti-Tank',
    'Engineer', 'Logistics', 'Indirect Fire', 'Heavy Weapons',
]

// POST /api/applications — public, unauthenticated form submission
export async function POST(request: NextRequest) {
    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const {
        discordUsername, inGameName, age, experience, website,
        steamUrl, steamId64, region, armaHours, priorMilsim, dualClan,
        previousUnits, currentUnit, availableNights, opsPerMonth, primaryRole,
        additionalRoles, departmentInterest, ownsArma,
    } = body as Record<string, unknown>

    // Honeypot — silently accept but discard
    if (website) return NextResponse.json({ ok: true })

    // Required field validation
    if (!String(discordUsername ?? '').trim()) return NextResponse.json({ error: 'Discord username is required.' }, { status: 400 })
    if (!String(inGameName ?? '').trim()) return NextResponse.json({ error: 'In-game name is required.' }, { status: 400 })
    const ageNum = parseInt(String(age), 10)
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) return NextResponse.json({ error: 'Please enter a valid age (13–100).' }, { status: 400 })
    if (!String(experience ?? '').trim()) return NextResponse.json({ error: 'Experience field is required.' }, { status: 400 })
    if (!region || !String(region).trim()) return NextResponse.json({ error: 'Please select a country.' }, { status: 400 })
    if (!availableNights || !VALID_NIGHTS.includes(String(availableNights))) return NextResponse.json({ error: 'Please select your available nights.' }, { status: 400 })
    if (!primaryRole || !VALID_ROLES.includes(String(primaryRole))) return NextResponse.json({ error: 'Please select a primary role.' }, { status: 400 })

    // Length limits
    if (String(discordUsername).length > 100) return NextResponse.json({ error: 'Discord username is too long.' }, { status: 400 })
    if (String(inGameName).length > 16) return NextResponse.json({ error: 'In-game name must be 16 characters or fewer.' }, { status: 400 })
    if (String(experience).length > 2000) return NextResponse.json({ error: 'Experience field is too long (max 2000 characters).' }, { status: 400 })
    if (steamUrl && String(steamUrl).length > 200) return NextResponse.json({ error: 'Steam URL is too long.' }, { status: 400 })
    if (previousUnits && String(previousUnits).length > 500) return NextResponse.json({ error: 'Previous units field is too long.' }, { status: 400 })

    // IP rate limiting — max 2 submissions per IP per 24 hours
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown'

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentCount = await Db.j1Applications.countDocuments({
        submittedIp: ip,
        submittedAt: { $gte: since },
    })

    if (recentCount >= 2) {
        return NextResponse.json({ error: 'You have already submitted an application recently. Please wait 24 hours before applying again.' }, { status: 429 })
    }

    await Db.j1Applications.insertOne({
        discordUsername: String(discordUsername).trim(),
        inGameName: String(inGameName).trim(),
        age: ageNum,
        experience: String(experience).trim(),
        status: 'pending',
        submittedAt: new Date(),
        submittedIp: ip,
        steamUrl:   steamUrl   ? String(steamUrl).trim()   : undefined,
        steamId64:  steamId64  ? String(steamId64).trim()  : undefined,
        region: String(region),
        armaHours: armaHours ? String(armaHours).trim() : undefined,
        priorMilsim: priorMilsim === true || priorMilsim === 'true',
        dualClan: dualClan === true || dualClan === 'true',
        previousUnits: previousUnits ? String(previousUnits).trim() : undefined,
        currentUnit:   currentUnit   ? String(currentUnit).trim()   : undefined,
        availableNights: String(availableNights),
        opsPerMonth: opsPerMonth && VALID_OPS.includes(String(opsPerMonth)) ? String(opsPerMonth) : undefined,
        primaryRole: String(primaryRole),
        additionalRoles: Array.isArray(additionalRoles) ? additionalRoles.filter((r): r is string => typeof r === 'string') : undefined,
        departmentInterest: Array.isArray(departmentInterest) ? departmentInterest.filter((d): d is string => typeof d === 'string') : undefined,
        ownsArma: ownsArma === true || ownsArma === 'true',
    })

    // Notify all J1 members of the new application
    const applicantName = String(inGameName).trim()
    await Promise.all([
        createNotificationForRole('J1-Recruiting', {
            type: 'task_assigned',
            title: 'New member application',
            body: `${applicantName} has submitted a recruitment application`,
            actionUrl: '/admin/j1',
        }),
        createNotificationForRole('J1-Staff', {
            type: 'task_assigned',
            title: 'New member application',
            body: `${applicantName} has submitted a recruitment application`,
            actionUrl: '/admin/j1',
        }),
    ])

    return NextResponse.json({ ok: true })
}
