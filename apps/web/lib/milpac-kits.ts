import Db from '@/lib/mongo'
import { parseLoadout } from '@/lib/loadout/parse'
import { summariseLoadout } from '@/lib/loadout/summary'
import { resolveItemName } from '@/lib/loadout/names'

/**
 * Each member's default *public* kit, reduced to the one line a roster card has
 * room for.
 *
 * Lives here rather than in `lib/loadout/` because everything in that folder is
 * pure and React-free by design — the shelf and the parser are unit-tested on
 * that basis — and this is a Mongo read. `lib/landing.ts` is the precedent: a
 * server-side data helper for one page, sitting flat in `lib/`.
 *
 * `shared` is the privacy boundary for the whole collection: an unshared kit is
 * only ever sent to its owner's own browser. A roster is the least private
 * surface in the app, so the filter is not optional here — it is the reason
 * this query is safe to run for 163 people at once.
 */

export type MilpacKitLine = {
    /** Resolved display name of the primary weapon; null when the kit has none. */
    primary: string | null
    itemCount: number
}

/**
 * One query for the whole page rather than one per card.
 *
 * `raw` is the verbatim arsenal export and is parsed at render — see
 * `lib/loadout/parse.ts` — so a member whose paste has since gone malformed
 * must not take the roster down with it. Each kit is parsed inside its own
 * try/catch and simply omitted when it throws; the card falls back to its
 * "no public kit" state, which it has to render anyway.
 */
export async function fetchDefaultKitLines(userIds: string[]): Promise<Map<string, MilpacKitLine>> {
    const out = new Map<string, MilpacKitLine>()
    if (userIds.length === 0) return out

    const kits = await Db.loadouts
        .find(
            { userId: { $in: userIds }, isDefault: true, shared: true },
            { projection: { userId: 1, raw: 1 } },
        )
        .toArray()
        .catch(() => [])

    for (const kit of kits) {
        // A member with two documents both flagged default is a data fault, not
        // a render-time decision — take the first and move on.
        if (out.has(kit.userId)) continue
        try {
            const summary = summariseLoadout(parseLoadout(kit.raw))
            out.set(kit.userId, {
                primary: summary.primary ? resolveItemName(summary.primary.className) : null,
                itemCount: summary.itemCount,
            })
        } catch {
            continue
        }
    }

    return out
}
