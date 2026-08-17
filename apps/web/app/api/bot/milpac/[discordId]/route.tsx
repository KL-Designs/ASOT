import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { generateMilpacForUser } from '@/lib/milpac-gen/generate-for-user'
import { MilpacServiceError } from '@/lib/milpac-gen/client'
import { buildDossierData, DOSSIER_SIZE } from '@/lib/military/dossier-data'
import { DossierCard } from '@/lib/military/dossier-card'
import { asciiJson } from '@/lib/military/ascii-header'

/**
 * Renders a member's uniform or medal box for the Discord bot.
 *
 *   POST /api/bot/milpac/{discordId}?type=uniform|medals
 *   Authorization: Bearer ${BOT_API_SECRET}
 *
 * The bot goes through web rather than calling the render service directly
 * because building the payload — awards to ribbons, qualifications to badges,
 * ORBAT section to corps badge, rank tier to rifleman badge — is web's job and
 * depends on web's schema. A second implementation in the bot is precisely the
 * drift apps/milpac/PLAN.md §3 and §4 describe: the original had two, they
 * disagreed, and every corps rank rendered with no insignia for months.
 *
 * Always re-renders rather than serving the cached PNG. The bot's contract with
 * the member is that what comes back is current as of the moment they asked.
 */

export const dynamic = 'force-dynamic'

function authorised(req: NextRequest): boolean {
    const secret = process.env.BOT_API_SECRET
    // No secret configured means the route is closed, not open.
    if (!secret) return false
    return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ discordId: string }> },
) {
    if (!authorised(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { discordId } = await params
    const type = req.nextUrl.searchParams.get('type') ?? 'uniform'
    if (type !== 'uniform' && type !== 'medals' && type !== 'dossier') {
        return NextResponse.json({ error: 'type must be "uniform", "medals" or "dossier"' }, { status: 400 })
    }

    const user = await Db.users.findOne({ id: discordId, discharged: { $exists: false } })
    if (!user) {
        return NextResponse.json({ error: 'No milpac on record for that member' }, { status: 404 })
    }

    /**
     * The dossier draws a whole card rather than returning one render, so it
     * takes its own path: it needs the roster for the canonical segment, and it
     * survives a render-service outage where the two image types cannot.
     */
    if (type === 'dossier') {
        // For the slug index only — the member above was found by Discord id.
        const allMembers = await client.fetchAllMembers()
        const data = await buildDossierData(user as unknown as User, allMembers)

        return new ImageResponse(<DossierCard data={data} />, {
            ...DOSSIER_SIZE,
            headers: {
                // The bot prefixes config.api. Paths rather than absolute URLs
                // so config.apiInternal can never reach a member-facing button.
                'X-Milpac-Links': asciiJson(data.links),
                // Member names are free text and can carry non-ASCII, which a
                // header value cannot — same trap the links hit. asciiJson of a
                // bare string yields a quoted JSON string the bot parses back.
                'X-Milpac-Member': asciiJson(data.memberTitle),
                'Cache-Control': 'no-store',
            },
        })
    }

    try {
        const images = await generateMilpacForUser(user as unknown as User)
        const png = type === 'uniform' ? images.uniform : images.medals

        return new NextResponse(new Uint8Array(png), {
            headers: {
                'Content-Type': 'image/png',
                'Content-Disposition': `inline; filename="${discordId}-${type}.png"`,
                'Cache-Control': 'no-store',
            },
        })
    } catch (err) {
        if (err instanceof MilpacServiceError) {
            console.error('[milpac] bot render failed for', discordId, err.status, err.detail)
            // 422 is the member's data naming artwork that does not exist — a
            // real answer for the bot to relay, not an outage.
            const status = err.status === 422 ? 422 : 502
            return NextResponse.json({ error: 'Render service unavailable' }, { status })
        }
        throw err
    }
}
