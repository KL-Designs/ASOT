import { ensureVisible } from '@/lib/discord/color'
import type { OrbatEntry } from '@/lib/orbat'

export function resolveMilpacProfile(member: User, orbatEntry: OrbatEntry | null) {
    const accent = ensureVisible(member.hexAccentColor || '#db001d')

    const strippedNickname = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const displayName = strippedNickname || member.globalName || member.username

    const parts = (strippedNickname || displayName).split(' ')
    const name = parts.length > 1 ? parts.slice(1).join(' ') : displayName
    const rankAbbr = parts.length > 1 ? parts[0] : null

    const promotions = member.milpac?.promotions
    const fullRank = member.bio?.rank
        || (promotions && promotions.length > 0 ? promotions[promotions.length - 1].rank : null)
        || rankAbbr

    const callsign = member.bio?.callsign || null

    return { accent, displayName, name, fullRank, callsign, orbatEntry }
}
