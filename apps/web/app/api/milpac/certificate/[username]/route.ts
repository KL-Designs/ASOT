import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { AWARD_TO_CITATION, certificateCodeForCitation, MEDALLION_CERTIFICATE_CODES, rankAbbrFromName } from '@asot/lib'
import { renderCertificate, MilpacServiceError } from '@/lib/milpac-gen/client'
import { resolveUnitSignatory, type Signatory } from '@/lib/milpac-gen/signatory'
import { parseMilpacDate } from '@/lib/military/milpac-dates'

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

/**
 * Who signs this certificate: the officer who issued the award or promotion.
 *
 * Both halves have to be present to use the record — a name with no rank would
 * render "{signaturerRankShort} Thomas" with an empty rank, which reads worse
 * than falling back to the unit's current signing officer. `issuedByRank` is
 * stored as the full rank name, so the short form is derived rather than stored
 * twice.
 *
 * Returning null means "no officer of record" — the caller resolves the unit
 * signatory instead, which is the case for every record filed before
 * `issuedByRank` existed.
 */
function signatoryFor(record: { issuedByName?: string; issuedByRank?: string } | undefined): Signatory | null {
    if (!record?.issuedByName || !record.issuedByRank) return null
    return {
        signaturer:          record.issuedByName,
        signaturerRankShort: rankAbbrFromName(record.issuedByRank) || record.issuedByRank,
        signaturerRankFull:  record.issuedByRank,
    }
}

/** "1st", "2nd", "3rd", "4th" — the templates split the number and its suffix. */
function ordinalSuffix(day: number): string {
    if (day % 100 >= 11 && day % 100 <= 13) return 'th'
    return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'
}

/** Strips the parentheses the asset codes don't carry: `PTE(S)` → `PTES`. */
const bare = (value: string) => value.replace(/[()]/g, '')

/**
 * The member's rank abbreviation as at a given date.
 *
 * Certificates print "MAJ Thomas" rather than a bare name, and the rank that
 * belongs on a 2021 citation is the one held in 2021 — reading it off the
 * member's record today would re-title a historical document every time
 * someone opened it.
 *
 * Derived from the promotion history: the most recent promotion dated on or
 * before the award. Falls back to the current rank when the history has no
 * usable date, which covers CSV-imported records and free-text dates that
 * don't parse.
 */
function rankAbbrAt(user: User, when: string | undefined): string {
    const target = parseMilpacDate(when)
    const fallback = user.milpac?.currentRank ?? ''
    if (!target) return fallback

    const held = (user.milpac?.promotions ?? [])
        .map(p => ({ rank: p.rank, at: parseMilpacDate(p.date) }))
        .filter((p): p is { rank: string; at: Date } => p.at !== null && p.at.getTime() <= target.getTime())
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .at(-1)

    if (!held) return fallback
    return rankAbbrFromName(held.rank) || held.rank
}

/**
 * A date split into the three pieces the templates print, or null.
 *
 * Null rather than "today": these dates are printed as historical fact on a
 * document a member keeps. A certificate that reads "enlisted on the 18th of
 * August 2026" because the field was empty is worse than no certificate, so the
 * caller refuses to render instead. Free-text dates that do not parse — CSV
 * imports are full of them — are treated the same way.
 */
function splitDate(value: string | undefined) {
    const date = parseMilpacDate(value)
    if (!date) return null
    return {
        dateNumber: String(date.getDate()),
        suffix:     ordinalSuffix(date.getDate()),
        date:       date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
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
    let issuedDate: string | undefined
    let signatory: Signatory | null = null
    let memberRank: string | undefined

    if (type === 'award') {
        const held = awards.find(a => {
            const code = MEDALLION_CERTIFICATE_CODES[a.name]
                ?? (AWARD_TO_CITATION[a.name] ? certificateCodeForCitation(AWARD_TO_CITATION[a.name]!) : undefined)
            return code === cert
        })
        if (!held) return NextResponse.json({ error: 'Member does not hold that award' }, { status: 404 })
        issuedDate = held.date
        signatory  = signatoryFor(held)
        memberRank = rankAbbrAt(user as unknown as User, held.date)
    } else {
        // The promotion that awarded the rank being certified. Any rank in the
        // member's history qualifies, not just their current one: a promotion
        // certificate records an event, and being promoted again does not
        // un-issue the earlier one.
        //
        // The editor stores the rank's full name, but CSV-imported rows can hold
        // the abbreviation directly, so accept either rather than silently
        // falling back to the unit signatory. `cert` is the abbreviation with
        // parentheses stripped.
        const promotion = (user.milpac?.promotions ?? [])
            .filter(p => bare(rankAbbrFromName(p.rank)) === cert || bare(p.rank) === cert)
            .at(-1)

        // The current rank still qualifies without a matching promotion row —
        // CSV-imported members have a rank and no history behind it.
        const isCurrentRank = cert === bare(user.milpac?.currentRank ?? '')
        if (!promotion && !isCurrentRank) {
            return NextResponse.json({ error: 'Member has never held that rank' }, { status: 404 })
        }

        issuedDate = promotion?.date
        signatory  = signatoryFor(promotion)
        // A promotion certificate announces the rank it grants, so it is named
        // for the rank being awarded rather than the one held the day before.
        memberRank = promotion ? rankAbbrFromName(promotion.rank) || promotion.rank : user.milpac?.currentRank
    }

    // Only hit the ORBAT when the record named nobody.
    signatory ??= await resolveUnitSignatory()

    /**
     * Everything the printed document asserts has to be real before it is
     * printed. A certificate is a record a member keeps and shows, so a missing
     * field must stop it being issued rather than be filled with a plausible
     * default — an unsigned citation, or one dated today because the enlistment
     * date was never entered, is a small forgery.
     *
     * 422 rather than 500: the request is well-formed and the member does hold
     * the award; it is their record that is incomplete. The viewer degrades to
     * the plain award row on a failed render, and the missing fields are what
     * the milpac editor now warns about.
     */
    const issued = splitDate(issuedDate)
    // The enlistment date, not the award date — the templates print "enlisted
    // on ... and awarded on ...", and both used to be given the award's date.
    const joined = splitDate(user.milpac?.enlistedDate)

    const missing = [
        !issued && (type === 'award' ? 'the award date' : 'the promotion date'),
        !joined && 'the enlistment date',
        !signatory.signaturer && 'an issuing officer',
    ].filter(Boolean) as string[]

    if (missing.length > 0) {
        console.warn('[milpac] certificate withheld', username, cert, missing.join(', '))
        return NextResponse.json(
            { error: `This certificate is missing ${missing.join(' and ')}.` },
            { status: 422 },
        )
    }

    try {
        const png = await renderCertificate({
            type,
            cert,
            name: [memberRank, user.name || user.username].filter(Boolean).join(' '),
            date: issued!.date, dateNumber: issued!.dateNumber, suffix: issued!.suffix,
            jddate: joined!.date, jdnum: joined!.dateNumber, jdsuffix: joined!.suffix,
            ...signatory,
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
