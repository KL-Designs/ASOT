/**
 * Moved to the repo-root lib/ — see lib/README.md for why.
 *
 * This file stays as a redirect so the ~20 existing `@/lib/military/ranks`
 * imports keep working. It re-exports; it does not redefine. New code should
 * import from '@asot/lib' directly.
 */

export type { RankEntry, RankGroup, RankAbbr, RankGroupName } from '@asot/lib'

export {
    RANK_GROUPS,
    RANKS_FLAT,
    isRankAbbr,
    rankNameFromAbbr,
    rankAbbrFromName,
} from '@asot/lib'
