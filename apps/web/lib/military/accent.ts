import { ensureVisible } from '@/lib/discord/color'

/**
 * A member's accent colour, resolved once for the whole site.
 *
 * Three sources in priority order:
 *
 *   1. `profileAccent` — what the member picked on their own milpac. Their
 *      choice wins, because it is the only one of the three they can change.
 *   2. `hexAccentColor` — their Discord accent, refreshed on website login.
 *   3. The unit red.
 *
 * The reason this is a function and not four inlined ternaries is that it used
 * to be: the roster card, the milpac file, the navbar chip and the token route
 * each resolved the accent themselves, and they did not agree — the first two
 * ran `ensureVisible`, the third did not, and the fallbacks were a mix of
 * `#db001d` and `var(--red)`. One member could be three colours on one page.
 */

/** The unit red, for a member with no accent from any source. */
export const DEFAULT_ACCENT = '#db001d'

/**
 * Discord's "no accent set" is not absence — the login callback stores it as
 * `#000000`, because `accent_color` comes back null and `0` formats to six
 * zeroes. Treating that as a real colour is how a member with no Discord accent
 * ended up grey: `ensureVisible` maps near-black to `#888888` rather than
 * letting it fall through to the unit red.
 */
const DISCORD_UNSET = '#000000'

/** `#rrggbb` lower-cased, or null for anything that isn't a six-digit hex. */
export function normaliseHex(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
    return match ? `#${match[1].toLowerCase()}` : null
}

/**
 * The colour to paint this member in.
 *
 * A member's own pick still goes through `ensureVisible`: every surface that
 * uses this paints on near-black, and a chosen colour that cannot be seen there
 * is worse for them than one nudged up to the legibility floor.
 */
export function resolveMemberAccent(
    member: Pick<User, 'profileAccent' | 'hexAccentColor'> | null | undefined,
): string {
    const chosen = normaliseHex(member?.profileAccent)
    if (chosen) return ensureVisible(chosen)

    const discord = normaliseHex(member?.hexAccentColor)
    if (discord && discord !== DISCORD_UNSET) return ensureVisible(discord)

    return DEFAULT_ACCENT
}
