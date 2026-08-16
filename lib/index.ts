/**
 * Shared unit domain model — ranks, corps badges, awards and qualifications.
 *
 * Imported as `@asot/lib` from every app via a tsconfig path alias.
 * See ./README.md for the convention and how to add a consumer.
 */

export type {
    RankEntry,
    RankGroup,
    RankAbbr,
    RankGroupName,
} from './ranks'

export {
    RANK_GROUPS,
    RANKS_FLAT,
    isRankAbbr,
    rankNameFromAbbr,
    rankAbbrFromName,
} from './ranks'

export type {
    Badge,
    Citation,
    TrainingBadge,
    Medallion,
} from './types'

export { BADGES } from './types'

export {
    AWARD_TO_CITATION,
    QUAL_TO_BADGE,
    SECTION_TO_BADGE,
    DEFAULT_BADGE,
} from './maps'
