import { resolveMemberAccent } from '@/lib/military/accent'
import type { OrbatEntry } from '@/lib/orbat'
import { rankNameFromAbbr } from '@/lib/military/ranks'

export function resolveMilpacProfile(member: User, orbatEntry: OrbatEntry | null) {
    const accent = resolveMemberAccent(member)

    const strippedNickname = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const displayName = strippedNickname || member.globalName || member.username

    const parts = (strippedNickname || displayName).split(' ')
    const parsedName = parts.length > 1 ? parts.slice(1).join(' ') : displayName
    const name = member.name || parsedName
    const rankAbbr = parts.length > 1 ? parts[0] : null

    const promotions = member.milpac?.promotions
    const fullRank = (member.milpac?.currentRank ? rankNameFromAbbr(member.milpac.currentRank) : null)
        || (promotions && promotions.length > 0 ? promotions[promotions.length - 1].rank : null)
        || rankAbbr

    const rankAbbrResolved = member.milpac?.currentRank || rankAbbr

    const callsign = orbatEntry?.section || null

    return { accent, displayName, name, rankAbbr: rankAbbrResolved, fullRank, callsign, orbatEntry }
}
