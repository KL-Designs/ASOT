import { rankNameFromAbbr } from '@/lib/military/ranks'

/**
 * How a member is addressed in the navbar.
 *
 * The one thing worth knowing here: a member's Discord nickname already leads
 * with their rank ("PTE(S) Koda"), so pairing it with `milpac.currentRank`
 * prints the rank twice. `name` is the nickname with that leading token
 * removed, which is what every caller should render next to a rank.
 *
 * `User.name` is the stored, authoritative name and wins outright when set;
 * dropping the first word is only the fallback for members who don't have one.
 */
export type MemberLabel = {
    /** Bare name, safe to put after a rank. */
    name: string
    /** Full nickname as Discord has it, rank prefix and all. */
    fullName: string
    /** e.g. `PTE(S)`, or null if the member has no milpac rank. */
    rankAbbr: string | null
    /** e.g. `Senior Private`, or null. */
    rankName: string | null
    callsign: string | null
}

export function memberLabel(user: User): MemberLabel {
    // Discord nicknames carry a trailing bracketed tag on some members.
    const nickname = user.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const fullName = nickname || user.globalName || user.username

    const parts = fullName.split(' ')
    const name = user.name || (parts.length > 1 ? parts.slice(1).join(' ') : fullName)

    const rankAbbr = user.milpac?.currentRank || null

    return {
        name,
        fullName,
        rankAbbr,
        rankName: rankAbbr ? rankNameFromAbbr(rankAbbr) : null,
        callsign: user.milpac?.callsign || null,
    }
}
