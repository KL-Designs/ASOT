/**
 * Bounds on what a member may store per kit.
 *
 * Shared by both loadout API routes and the import form, so the field that
 * stops typing and the field the server truncates agree. They were previously
 * two copies of `MAX_NAME` in two route files, which is exactly the kind of pair
 * that drifts.
 *
 * These are bounds against abuse and layout damage, not editorial preferences.
 */

/** A kit name is a label, not a sentence — it has to fit on a chip. */
export const MAX_NAME = 40

/** "Brief" is the ask: one line on the card, not a paragraph. */
export const MAX_DESCRIPTION = 160

/** An ACE export of a full kit is a few KB; 64KB is generous headroom. */
export const MAX_RAW_BYTES = 65536

/** Enough for a kit per role and then some. */
export const MAX_PER_MEMBER = 12
