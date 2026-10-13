import Db from '@/lib/mongo'
import { ensureVisible } from '@/lib/discord/color'
import { normaliseHex } from '@/lib/military/accent'

/**
 * The colour of the callsign each member is posted to.
 *
 * Section colour first, then the platoon's, taken from the same
 * `orbatSectionMeta` records the roster and the ORBAT page read. A member with
 * no position, or whose section and platoon have no colour set, is simply
 * absent from the map — the caller decides what "no colour" looks like rather
 * than everybody without one being painted the same invented shade.
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

    return colours
}
