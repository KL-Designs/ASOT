import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import { MEDIA_DIR, posterKey } from './paths'

/**
 * An embed's thumbnail, cached locally.
 *
 * Fetched once at approval and written beside the rest of the media so the grid
 * is uniform and the page does not hotlink a third party — which also means no
 * `remotePatterns` entry in next.config.ts and no broken tiles the day a
 * provider changes its CDN.
 *
 * YouTube gives its thumbnail away at a predictable URL. Twitch does not: its
 * public oEmbed is gone and real clip thumbnails need Helix credentials. So
 * Twitch degrades — with TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET set it gets
 * a real thumbnail, and without them a generated placeholder. Everything else
 * about a Twitch item works either way, which is why this is a graceful
 * degradation and not a configuration requirement.
 */

async function firstOk(urls: string[]): Promise<Buffer | null> {
    for (const url of urls) {
        try {
            const res = await fetch(url)
            // YouTube answers 404 for maxresdefault on videos that never had
            // one, so a failure here is expected and means "try the next size".
            if (!res.ok) continue
            const buf = Buffer.from(await res.arrayBuffer())
            if (buf.byteLength > 1024) return buf
        } catch { /* try the next */ }
    }
    return null
}

async function twitchHelixThumbnail(media: GalleryMedia): Promise<Buffer | null> {
    const id = process.env.TWITCH_CLIENT_ID
    const secret = process.env.TWITCH_CLIENT_SECRET
    if (!id || !secret || !media.embedId) return null

    try {
        /* Credentials in the body, never the query string. A URL is logged by the
           service receiving it, by any proxy in between and by APM tooling, and TLS
           does not change that — which is why OAuth2 puts client credentials in the
           body or an Authorization header. */
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: id,
                client_secret: secret,
                grant_type: 'client_credentials',
            }),
        })
        if (!tokenRes.ok) {
            console.warn(`[gallery/poster] Twitch token request failed: ${tokenRes.status}`)
            return null
        }
        const { access_token } = await tokenRes.json()

        const endpoint = media.embedKind === 'clip'
            ? `https://api.twitch.tv/helix/clips?id=${media.embedId}`
            : `https://api.twitch.tv/helix/videos?id=${media.embedId}`

        const res = await fetch(endpoint, { headers: { 'Client-Id': id, Authorization: `Bearer ${access_token}` } })
        if (!res.ok) {
            console.warn(`[gallery/poster] Twitch Helix request failed: ${res.status}`)
            return null
        }

        const url: string | undefined = (await res.json()).data?.[0]?.thumbnail_url
        if (!url) return null

        // Helix returns a template with %{width} placeholders on videos.
        return await firstOk([url.replace('%{width}', '1280').replace('%{height}', '720')])
    } catch (err) {
        console.warn('[gallery/poster] Twitch thumbnail fetch threw:', err)
        return null
    }
}

/** A last resort so an embed tile is never blank. @napi-rs/canvas is already a
 *  dependency — it is what renders milpac images. */
async function placeholder(media: GalleryMedia): Promise<Buffer> {
    const { createCanvas } = await import('@napi-rs/canvas')
    const canvas = createCanvas(1280, 720)
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, 1280, 720)
    ctx.fillStyle = media.source === 'twitch' ? '#9146ff' : '#ff0000'
    ctx.fillRect(0, 660, 1280, 60)

    ctx.fillStyle = '#ededed'
    ctx.font = 'bold 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(media.source === 'twitch' ? 'Twitch clip' : 'YouTube video', 640, 340)

    if (media.caption) {
        ctx.font = '28px sans-serif'
        ctx.fillStyle = 'rgba(237,237,237,0.65)'
        ctx.fillText(media.caption.slice(0, 60), 640, 400)
    }

    return canvas.toBuffer('image/jpeg')
}

/** Writes the poster and sets `posterKey`. Returns whether a real provider
 *  thumbnail was obtained, as opposed to a placeholder. */
export async function fetchEmbedPoster(media: GalleryMedia): Promise<boolean> {
    let buf: Buffer | null = null
    let real = false

    if (media.source === 'youtube' && media.embedId) {
        buf = await firstOk([
            `https://i.ytimg.com/vi/${media.embedId}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${media.embedId}/hqdefault.jpg`,
        ])
        real = !!buf
    } else if (media.source === 'twitch') {
        buf = await twitchHelixThumbnail(media)
        real = !!buf
    }

    if (!buf) buf = await placeholder(media)

    const id = media._id.toString()
    mkdirSync(MEDIA_DIR, { recursive: true })
    writeFileSync(path.join(MEDIA_DIR, `${id}_poster.jpg`), buf)
    await Db.galleryMedia.updateOne({ _id: new ObjectId(id) }, { $set: { posterKey: posterKey(id) } })

    return real
}
