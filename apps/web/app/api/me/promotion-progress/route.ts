import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { rankNameFromAbbr } from '@/lib/military/ranks'
import { getPromotionProgress, loadConfirmedOps, resolvePromotionPoints } from '@/lib/military/milpac-stats'

/**
 * The signed-in member's progress toward their next rank, for the navbar's
 * account menu.
 *
 * Deliberately the same three calls the milpac file makes
 * (`loadConfirmedOps` → `resolvePromotionPoints` → `getPromotionProgress`) so
 * the bar in the navbar and the bar on the milpac can never disagree — the
 * whole reason `milpac-stats` exists as a shared module.
 *
 * The navbar is a client component, so unlike the milpac (a server component
 * that calls those helpers directly) it needs an endpoint. Fetched lazily when
 * the account menu is first opened, not on page load.
 */

export const dynamic = 'force-dynamic'

export type PromotionProgress = {
    /** Full name of the member's current rank, e.g. "Private (Silver)". */
    currentRank: string | null
    /** Null when the member has no rank, or their rank is on no known track. */
    progress:
    | { atMax: true }
    | { atMax: false, nextRank: string, billetOnly: true }
    | { atMax: false, nextRank: string, required: number, current: number, pct: number, billetOnly: false }
    | null
}

export async function GET() {
    try {
        const me = await client.fetchMe()

        const rankAbbr = me.milpac?.currentRank
        const confirmedOps = await loadConfirmedOps(me.id)
        const points = resolvePromotionPoints(me, confirmedOps)

        const body: PromotionProgress = {
            currentRank: rankAbbr ? rankNameFromAbbr(rankAbbr) : null,
            progress: getPromotionProgress(rankAbbr, points),
        }
        return NextResponse.json(body, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
