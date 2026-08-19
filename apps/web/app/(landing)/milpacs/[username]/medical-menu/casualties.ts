import 'server-only'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
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
            { projection: { name: 1, globalName: 1, username: 1, 'guild.nickname': 1 } },
        )
        .toArray()

    const nameById = new Map<string, string>()
    for (const u of users) {
        // Same derivation the ORBAT itself uses: strip the [TAGS], then drop
        // the rank prefix off the front of the nickname.
        const stripped = u.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
        const parts = (stripped || '').split(' ')
        const parsed = parts.length > 1 ? parts.slice(1).join(' ') : stripped
        const name = u.name || parsed || u.globalName || u.username
        if (name) nameById.set(u._id, name)
    }

    const casualties: Casualty[] = []
    const seen = new Set<string>()
    for (const p of positions) {
        const name = nameById.get(p.userId!)
        // One casualty per person: somebody holding two billets should not be
        // twice as likely to end up on the table.
        if (!name || !p.sectionTitle || seen.has(name)) continue
        seen.add(name)
        casualties.push({
            name,
            unit: p.sectionTitle.toUpperCase(),
            role: (p.role || 'Rifleman').toUpperCase(),
        })
    }

    return casualties.slice(0, LIMIT)
}
