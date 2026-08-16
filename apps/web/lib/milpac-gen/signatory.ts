import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { rankAbbrFromName } from '@asot/lib'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'

/**
 * Who signs a rendered certificate.
 *
 * The unit signatory is whoever currently holds a nominated ORBAT position —
 * in practice the Officer Commanding in India Company HQ — resolved live, so a
 * change of command is reflected without anyone editing a config file. J4 picks
 * the position in Website Settings → Certificates.
 *
 * This is the *fallback*. An award or promotion that records its own issuing
 * officer (`issuedByName` + `issuedByRank`) is signed by them instead, because
 * a certificate should carry the officer who actually authorised it rather than
 * whoever holds the billet today. See apps/milpac/PLAN.md decision 6.
 */

export const SIGNATORY_SETTING_ID = 'certificateSignatory'

/** The ORBAT category the signing officer is chosen from. */
export const SIGNATORY_CATEGORY = 'companyHQ'

/**
 * Matches the OC's position by name, for when nobody has made a choice yet.
 * Both orderings appear in the data — `lib/orbat/index.ts` seeds the CHQ senior
 * slot as "Commanding Officer" while the certificate templates print "Officer
 * Commanding".
 */
const OC_ROLE = /officer\s+commanding|commanding\s+officer/i

export interface Signatory {
    signaturer: string
    signaturerRankShort: string
    signaturerRankFull: string
}

/** Renders as a blank signature line — no name is better than a wrong one. */
export const EMPTY_SIGNATORY: Signatory = {
    signaturer: '',
    signaturerRankShort: '',
    signaturerRankFull: '',
}

/**
 * The ORBAT position designated as signatory, or the best guess at it.
 *
 * The guess deliberately does not use `isSenior`: that flag is only set during
 * mass-import and is not maintained by the ORBAT editor (see
 * `getSectionLeaders` in `lib/orbat`), so it goes stale silently. Falling back
 * to the first *occupied* CHQ slot matches the convention used everywhere else.
 */
export async function getSignatoryPosition(): Promise<OrbatPosition | null> {
    const setting = await Db.siteSettings.findOne({ _id: SIGNATORY_SETTING_ID }).catch(() => null)
    const positionId = (setting as { positionId?: string } | null)?.positionId

    if (positionId && ObjectId.isValid(positionId)) {
        const chosen = await Db.orbatPositions.findOne({ _id: new ObjectId(positionId) })
        // A position that has since been deleted falls through to the guess
        // rather than leaving certificates unsigned.
        if (chosen) return chosen
    }

    const hqPositions = await Db.orbatPositions
        .find({ category: SIGNATORY_CATEGORY })
        .sort({ sectionOrder: 1, positionOrder: 1 })
        .toArray()

    return hqPositions.find(p => p.userId && OC_ROLE.test(p.role))
        ?? hqPositions.find(p => p.userId)
        ?? null
}

/** Resolves a position's current holder into a signature block. */
export async function resolveSignatoryFor(position: OrbatPosition | null): Promise<Signatory> {
    if (!position?.userId) return EMPTY_SIGNATORY

    // ORBAT positions key on the user's Discord id, which is also their _id on
    // these documents; check both rather than depend on that staying true.
    const user = await Db.users.findOne({ id: position.userId })
        ?? await Db.users.findOne({ _id: position.userId })
    if (!user) return EMPTY_SIGNATORY

    const { name, fullRank, rankAbbr } = resolveMilpacProfile(user as unknown as User, null)
    if (!name) return EMPTY_SIGNATORY

    return {
        signaturer:          name,
        signaturerRankShort: rankAbbr || rankAbbrFromName(fullRank ?? '') || '',
        signaturerRankFull:  fullRank || '',
    }
}

/** The unit's current signing officer. */
export async function resolveUnitSignatory(): Promise<Signatory> {
    return resolveSignatoryFor(await getSignatoryPosition())
}
