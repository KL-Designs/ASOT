/**
 * Turning a pasted link into something that can actually be embedded.
 *
 * A submission stores the provider, the kind and the id — never the raw URL a
 * member pasted. Three things need the resolved id and none of them can work
 * from a share link: the poster fetch, the iframe src, and the "watch on"
 * link back to the provider.
 *
 * Parsing is done with the URL constructor rather than a regex over the whole
 * string, so a link carrying a timestamp, a playlist or a tracking parameter
 * resolves to the same id as the clean one — which is what members will
 * actually paste, because it is what the share button gives them.
 */

export type EmbedProvider = 'youtube' | 'twitch'

/** Twitch VODs and Twitch clips embed through different players, so the id
 *  alone is not enough to render one. YouTube is always 'video'. */
export type EmbedKind = 'video' | 'clip'

export type ParsedEmbed = {
    provider: EmbedProvider
    kind: EmbedKind
    id: string
    canonicalUrl: string
}

/** YouTube ids are exactly 11 characters from a fixed alphabet. Checking the
 *  shape rejects a truncated paste here rather than at the poster fetch. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const TWITCH_VOD_ID = /^\d+$/
const TWITCH_CLIP_SLUG = /^[A-Za-z0-9-]{4,100}$/

function youtube(id: string | null | undefined): ParsedEmbed | null {
    if (!id || !YOUTUBE_ID.test(id)) return null
    return { provider: 'youtube', kind: 'video', id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` }
}

function twitchClip(slug: string | undefined): ParsedEmbed | null {
    if (!slug || !TWITCH_CLIP_SLUG.test(slug)) return null
    return { provider: 'twitch', kind: 'clip', id: slug, canonicalUrl: `https://clips.twitch.tv/${slug}` }
}

export function parseEmbedUrl(input: string): ParsedEmbed | null {
    const trimmed = input.trim()
    if (!trimmed) return null

    let url: URL
    try { url = new URL(trimmed) } catch { return null }

    // Anything but http(s) is refused outright — javascript: and data: reach
    // this function from a paste field, and neither is a video.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
    // Leading empty segment from the leading slash, dropped.
    const parts = url.pathname.split('/').filter(Boolean)

    if (host === 'youtu.be') return youtube(parts[0])

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        if (parts[0] === 'watch') return youtube(url.searchParams.get('v'))
        if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') return youtube(parts[1])
        return null
    }

    if (host === 'clips.twitch.tv') return twitchClip(parts[0])

    if (host === 'twitch.tv') {
        if (parts[0] === 'videos' && TWITCH_VOD_ID.test(parts[1] ?? '')) {
            return { provider: 'twitch', kind: 'video', id: parts[1], canonicalUrl: `https://www.twitch.tv/videos/${parts[1]}` }
        }
        // twitch.tv/<channel>/clip/<slug>
        if (parts[1] === 'clip') return twitchClip(parts[2])
        return null
    }

    return null
}

/**
 * The src for the iframe that plays this embed.
 *
 * `parentHost` is required because a Twitch player refuses to load unless it
 * matches the hostname of the page framing it. It is passed in rather than read
 * off `window` so this module stays pure — the caller reads
 * `window.location.hostname`, which is correct on localhost in development and
 * on the live domain in production with no configuration either side.
 */
export function embedIframeSrc(
    e: { provider: EmbedProvider, kind: EmbedKind, id: string },
    parentHost: string,
): string {
    if (e.provider === 'youtube') return `https://www.youtube.com/embed/${e.id}`
    if (e.kind === 'clip') return `https://clips.twitch.tv/embed?clip=${e.id}&parent=${parentHost}&autoplay=false`
    return `https://player.twitch.tv/?video=${e.id}&parent=${parentHost}&autoplay=false`
}
