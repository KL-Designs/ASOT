import Db from '@/lib/mongo'
import { ensureVisible } from '@/lib/discord/color'
import { DEFAULT_ACCENT, normaliseHex, resolveMemberAccent } from '@/lib/military/accent'

/**
 * The colour of the callsign each member is posted to.
 *
 * Section colour first, then the platoon's, taken from the same
 * `orbatSectionMeta` records the roster and the ORBAT page read. Where neither
 * has a colour set, the member's own accent — the one their MILPAC is painted
 * in — so a unit that hasn't coloured its ORBAT still tells people apart.
 * A member with none of the three is simply absent from the map — the caller
 * decides what "no colour" looks like rather than everybody without one being
 * painted the same invented shade (which the unit-red fallback would be).
 *
 * Used to tell people apart in a comment thread: the same member is always the
 * same colour, and people who work together share one.
 */
export async function unitColoursFor(userIds: readonly string[]): Promise<Map<string, string>> {
    const colours = new Map<string, string>()
    const ids = [...new Set(userIds.filter(Boolean))]
    if (ids.length === 0) return colours

    const [positions, meta] = await Promise.all([
        Db.orbatPositions
            .find({ userId: { $in: ids } }, { projection: { userId: 1, category: 1, sectionTitle: 1 } })
            .toArray(),
        Db.orbatSectionMeta.find({ color: { $exists: true } }, { projection: { category: 1, sectionTitle: 1, color: 1 } }).toArray(),
    ])

    const byKey = new Map(meta.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m.color]))

    for (const p of positions) {
        if (!p.userId || colours.has(p.userId)) continue
        const hex = normaliseHex(byKey.get(`${p.category}:${p.sectionTitle}`) ?? byKey.get(`${p.category}:`))
        if (hex) colours.set(p.userId, ensureVisible(hex))
    }

    const rest = ids.filter(id => !colours.has(id))
    if (rest.length) {
        const users = await Db.users
            .find({ id: { $in: rest } }, { projection: { id: 1, profileAccent: 1, hexAccentColor: 1 } })
            .toArray()
        for (const u of users) {
            const accent = resolveMemberAccent(u)
            if (accent !== DEFAULT_ACCENT) colours.set(u.id, accent)
        }
    }

    return colours
}
