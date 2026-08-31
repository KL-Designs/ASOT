import Db from '@/lib/mongo'

import type { RelocateDeps } from './relocate'

/**
 * The collections `relocateMedia` and `operationFacets` read.
 *
 * One place names them, because there are seven call sites and the set has now
 * grown twice. When the campaign level was added, every caller that kept
 * building the object inline would have gone on compiling against an older
 * shape had the two new collections been optional — and the failure is silent
 * in the worst way: each mission of a campaign resolves as a standalone
 * operation and mints its own numbered top-level folder, which is exactly the
 * three-sibling-folders report the campaign level exists to fix. Required
 * fields plus one constructor makes that a compile error instead.
 *
 * Deliberately the only module in lib/gallery that imports `@/lib/mongo`.
 * relocate.ts and operation-facets.ts take their collections as a parameter so
 * a test can exercise them against a throwaway directory without connecting to
 * anything; this is the seam that keeps that true while giving routes one call.
 */
export function galleryDeps(): RelocateDeps {
    return {
        media: Db.galleryMedia,
        operations: Db.operations,
        campaigns: Db.operationCampaigns,
        campaignMissions: Db.campaignMissions,
    }
}
