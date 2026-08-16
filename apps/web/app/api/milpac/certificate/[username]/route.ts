import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { AWARD_TO_CITATION, certificateCodeForCitation, MEDALLION_CERTIFICATE_CODES } from '@asot/lib'
import { renderCertificate, MilpacServiceError } from '@/lib/milpac-gen/client'

/**
 * Renders a member's certificate on demand and returns it as a PNG.
 *
 * On demand rather than eagerly: a member can hold 30+ awards, and rendering
 * every certificate on every profile view would be wasteful for something
 * almost nobody opens. Nothing is persisted — unlike uniforms and medal boxes,
 * certificates have no staleness to track, so there is nothing to cache-bust.
 *
 *   GET /api/milpac/certificate/{username}?type=award&cert=protagonist
 *   GET /api/milpac/certificate/{username}?type=promotion&cert=CPL
 */

/** The signing officer shown on every certificate. */
const SIGNATORY = {
    signaturer:          process.env.MILPAC_SIGNATORY_NAME ?? '',
    signaturerRankShort: process.env.MILPAC_SIGNATORY_RANK_SHORT ?? '',
    signaturerRankFull:  process.env.MILPAC_SIGNATORY_RANK_FULL ?? '',
}

/** "1st", "2nd", "3rd", "4th" — the templates split the number and its suffix. */
function ordinalSuffix(day: number): string {
    if (day % 100 >= 11 && day % 100 <= 13) return 'th'
    return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'
}

function splitDate(value: string | undefined) {
    const date = value ? new Date(value) : new Date()
    const safe = Number.isNaN(date.getTime()) ? new Date() : date
    return {
        dateNumber: String(safe.getDate()),
        suffix:     ordinalSuffix(safe.getDate()),
        date:       safe.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ username: string }> }
) {
    const { username } = await params
    const type = req.nextUrl.searchParams.get('type')
    const cert = req.nextUrl.searchParams.get('cert')

    // Certificates name a member and carry the OC's signature, so they are for
    // logged-in members rather than the public profile's anonymous visitors.
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (type !== 'promotion' && type !== 'award') {
        return NextResponse.json({ error: 'type must be "promotion" or "award"' }, { status: 400 })
    }
    if (!cert) {
        return NextResponse.json({ error: 'cert is required' }, { status: 400 })
    }

    const user = await Db.users.findOne({ username })
    if (!user) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    // Only issue a certificate the member actually holds — otherwise this route
    // would render an award citation for anyone who guessed its code.
    const awards = user.milpac?.awards ?? []
    let awardDate: string | undefined

    if (type === 'award') {
        const held = awards.find(a => {
            const code = MEDALLION_CERTIFICATE_CODES[a.name]
                ?? (AWARD_TO_CITATION[a.name] ? certificateCodeForCitation(AWARD_TO_CITATION[a.name]!) : undefined)
            return code === cert
        })
        if (!held) return NextResponse.json({ error: 'Member does not hold that award' }, { status: 404 })
        awardDate = held.date
    } else if (cert !== (user.milpac?.currentRank ?? '').replace(/[()]/g, '')) {
        return NextResponse.json({ error: 'Not the member\'s current rank' }, { status: 404 })
    }

    const { dateNumber, suffix, date } = splitDate(awardDate)

    try {
        const png = await renderCertificate({
            type,
            cert,
            name: user.name || user.username,
            date, dateNumber, suffix,
            jddate: date, jdnum: dateNumber, jdsuffix: suffix,
            ...SIGNATORY,
        })
        return new NextResponse(new Uint8Array(png), {
            headers: {
                'Content-Type': 'image/png',
                'Content-Disposition': `inline; filename="${username}-${cert}.png"`,
                'Cache-Control': 'private, max-age=300',
            },
        })
    } catch (err) {
        if (err instanceof MilpacServiceError) {
            console.error('[milpac] certificate render failed', username, cert, err.status, err.detail)
            // 422 means the code is real but has no slide — a caller error, not ours.
            const status = err.status === 422 ? 404 : 502
            return NextResponse.json({ error: 'Certificate unavailable' }, { status })
        }
        throw err
    }
}
