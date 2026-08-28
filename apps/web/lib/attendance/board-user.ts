/**
 * How the attendance board names and pictures a member.
 *
 * Shared because two endpoints have to agree on it: the board's GET builds the
 * whole member list, and the roster route sends back the one member a write
 * changed so the client can apply it without a refetch. Two copies of this
 * would drift into one endpoint showing "LCPL(S) McDongle" and the other
 * showing "mcdongle", visibly, on the same row.
 *
 * The rank comes first when there is one, which is how the unit refers to
 * people; everything after it is a fallback chain for accounts that have no
 * milpac yet — a recruit, or a skeleton account imported from CSV.
 */
export interface BoardUser {
    id: string
    displayName: string
    avatarURL: string
    isSkeletonAccount?: boolean
    csvName?: string
}

/**
 * `fallbackId` exists for the GET, which keys records by `record.userId` — that
 * may be a Mongo `_id` rather than the Discord id, and the last-resort label
 * should be the id the caller looked the user up by.
 */
export function toBoardUser(u: User, fallbackId?: string): BoardUser {
    const rankAbbr = u.milpac?.currentRank
    const memberName = u.name
    const displayName = rankAbbr && memberName
        ? `${rankAbbr} ${memberName}`
        : u.guild?.displayName || u.globalName || u.username || fallbackId || u.id

    return {
        id: u.id,
        displayName,
        avatarURL: u.guild?.avatarURL || u.avatarURL || '',
        isSkeletonAccount: u.isSkeletonAccount,
        csvName: u.csvName,
    }
}
