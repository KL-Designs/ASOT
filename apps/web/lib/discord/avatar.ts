// Discord's own formula (mirrors discord.js's calculateUserDefaultAvatarIndex) for which of
// the 6 default avatar colours (embed/avatars/0.png .. 5.png) a user without a custom avatar
// gets, keyed off their user ID. The legacy discriminator%5 formula only applies to accounts
// still on the old username system, which is effectively none at this point.
export function defaultAvatarURL(userId: string): string {
    const index = Number(BigInt(userId) >> BigInt(22)) % 6
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

export function avatarURL(userId: string, avatarHash?: string | null, size?: number): string {
    if (!avatarHash) return defaultAvatarURL(userId)
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}${size ? `?size=${size}` : ''}`
}

/**
 * Animated avatars, and how to ask Discord for a still of one.
 *
 * Discord encodes "this avatar is animated" in the hash (`a_` prefix), and
 * serves the *same* hash under either extension: `.gif` animates, `.png` is the
 * first frame. That is how Discord's own client shows a still avatar in a
 * member list and animates it on hover, and it is why none of this needs a
 * second stored field — the still and the animation are two spellings of one
 * URL we already have.
 *
 * Why it matters here: `next/image` does not optimise animated images, it
 * passes them through byte-for-byte. A roster of 163 members was therefore
 * shipping full-size GIFs — one measured at 1.76 MB — and repainting every one
 * of them forever behind a 54px circle. The `.png` of that same avatar is 14 KB.
 *
 * The pattern is deliberately strict rather than a `.endsWith('.gif')`: these
 * URLs are interpolated into a CSS `url()` by the roster card, so anything that
 * is not recognisably a Discord avatar must fall out here rather than reach a
 * stylesheet.
 */
const ANIMATED_AVATAR = /^https:\/\/cdn\.discordapp\.com\/avatars\/\d{5,25}\/a_[0-9a-fA-F]{8,64}\.gif(?:\?[\w=&-]*)?$/

export function isAnimatedAvatarURL(url?: string | null): boolean {
    return typeof url === 'string' && ANIMATED_AVATAR.test(url)
}

/**
 * The non-animating form of an avatar URL — the first frame, at a sane size.
 *
 * Anything that is not an animated Discord avatar is returned untouched, so
 * this is safe to wrap around every avatar rather than only the animated ones.
 */
export function stillAvatarURL(url?: string | null, size = 128): string | null | undefined {
    if (!isAnimatedAvatarURL(url)) return url
    return url!.replace(/\.gif(?:\?.*)?$/, `.png?size=${size}`)
}

/**
 * The animating form, bounded to `size`, or null when there is nothing to
 * animate. The size cap is not cosmetic: it is the difference between the
 * 1.76 MB original and something a hover can afford to fetch.
 */
export function animatedAvatarURL(url?: string | null, size = 128): string | null {
    if (!isAnimatedAvatarURL(url)) return null
    return url!.replace(/\.gif(?:\?.*)?$/, `.gif?size=${size}`)
}
