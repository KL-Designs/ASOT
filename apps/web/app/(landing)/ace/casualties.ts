import 'server-only'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { defaultAvatarURL } from '@/lib/discord/avatar'
import type { Casualty } from './model'

/* ============================================================================
   Casualties, drawn from the ORBAT.

   The mockup shipped with one hard-coded name. Pulling the roster instead means
   the casualty on the table is somebody you actually serve with, and a
   different one each time you open the menu.
   ========================================================================== */

/** More than enough to feel random, few enough to be cheap to ship. */
const LIMIT = 40

/**
 * A sample of filled ORBAT positions, as casualties.
 *
 * Deliberately not `fetchORBAT()`: that loads every position *and* every user
 * document to build the whole structure, which is a lot of work for an easter
 * egg that wants forty names. This reads the positions it needs and projects
 * three fields off the users behind them.
 *
 * Reservists are excluded — their slots carry no section or billet, so they
 * would arrive as a bare name with nothing to print beside it.
 */
export async function sampleCasualties(): Promise<Casualty[]> {
    const positions = await Db.orbatPositions
        .find(
            {
                userId: { $ne: null },
                category: { $nin: [...RESERVIST_CATEGORY_IDS] },
                sectionTitle: { $ne: '' },
            },
            { projection: { userId: 1, sectionTitle: 1, role: 1 } },
        )
        .limit(200)
        .toArray()

    if (positions.length === 0) return []

    const users = await Db.users
        .find(
            { _id: { $in: positions.map(p => p.userId!) } },
            {
                projection: {
                    name: 1, globalName: 1, username: 1, 'guild.nickname': 1,
                    'milpac.currentRank': 1, 'milpac.callsign': 1, avatarURL: 1,
                },
            },
        )
        .toArray()

    const byId = new Map<string, { name: string, rank?: string, callsign?: string, avatar?: string }>()
    for (const u of users) {
        // Same derivation the ORBAT itself uses: strip the [TAGS], then drop
        // the rank prefix off the front of the nickname.
        const stripped = u.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
        const parts = (stripped || '').split(' ')
        const parsed = parts.length > 1 ? parts.slice(1).join(' ') : stripped
        const name = u.name || parsed || u.globalName || u.username
        if (!name) continue
        byId.set(u._id, {
            name,
            // Fall back to the rank prefix on the nickname for members with no
            // milpac of their own — it is where the ORBAT reads it from too.
            rank: u.milpac?.currentRank || (parts.length > 1 ? parts[0] : undefined) || undefined,
            callsign: u.milpac?.callsign || undefined,
            // Discord's own default avatar is derived from the id, so a member
            // who never set one still gets a face rather than a blank head.
            avatar: u.avatarURL || defaultAvatarURL(u._id),
        })
    }

    const casualties: Casualty[] = []
    const seen = new Set<string>()
    for (const p of positions) {
        const who = byId.get(p.userId!)
        // One casualty per person: somebody holding two billets should not be
        // twice as likely to end up on the table.
        if (!who || !p.sectionTitle || seen.has(who.name)) continue
        seen.add(who.name)
        casualties.push({
            name: who.name,
            rank: who.rank,
            callsign: who.callsign?.toUpperCase(),
            avatar: who.avatar,
            unit: p.sectionTitle.toUpperCase(),
            role: (p.role || 'Rifleman').toUpperCase(),
        })
    }

    return casualties.slice(0, LIMIT)
}
