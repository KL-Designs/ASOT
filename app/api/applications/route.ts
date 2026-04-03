import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'

// POST /api/applications — public, unauthenticated form submission
export async function POST(request: NextRequest) {
    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { discordUsername, inGameName, age, experience, website } = body as Record<string, string>

    // Honeypot — silently accept but discard
    if (website) {
        return NextResponse.json({ ok: true })
    }

    // Basic validation
    if (!discordUsername?.trim()) return NextResponse.json({ error: 'Discord username is required.' }, { status: 400 })
    if (!inGameName?.trim()) return NextResponse.json({ error: 'In-game name is required.' }, { status: 400 })
    const ageNum = parseInt(String(age), 10)
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 100) return NextResponse.json({ error: 'Please enter a valid age (13–100).' }, { status: 400 })
    if (!experience?.trim()) return NextResponse.json({ error: 'Experience field is required.' }, { status: 400 })
    if (discordUsername.length > 100) return NextResponse.json({ error: 'Discord username is too long.' }, { status: 400 })
    if (inGameName.length > 100) return NextResponse.json({ error: 'In-game name is too long.' }, { status: 400 })
    if (experience.length > 2000) return NextResponse.json({ error: 'Experience field is too long (max 2000 characters).' }, { status: 400 })

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
        discordUsername: discordUsername.trim(),
        inGameName: inGameName.trim(),
        age: ageNum,
        experience: experience.trim(),
        status: 'pending',
        submittedAt: new Date(),
        submittedIp: ip,
    })

    return NextResponse.json({ ok: true })
}
