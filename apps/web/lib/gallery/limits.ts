/**
 * What a gallery submission is allowed to carry.
 *
 * Checked twice — in the browser before a byte moves, and on the server when
 * the bytes arrive — from this one module, so the message a member reads and
 * the rule the server applies cannot drift apart. That is the same reasoning
 * that split `lib/uploads/image-limits.ts` out of `image.ts`, and it has the
 * same hard constraint: this file must import nothing, because a client
 * component pulls it in and sharp cannot be bundled.
 *
 * Duration is deliberately checked before upload. A twelve-minute clip refused
 * up front costs a member nothing; refused after 400MB has crossed their
 * connection, it costs them the upload.
 */

export const MAX_ITEMS_PER_SUBMISSION = 20

/** The same ceiling `lib/uploads/image-limits.ts` already applies elsewhere:
 *  generous, because a photo off a phone is routinely 5-15MB and its owner has
 *  done nothing wrong. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 300

/** No SVG. It is scriptable, it is never a screenshot of an operation, and it
 *  has no business in an upload path that ends in a public page. */
export const ACCEPTED_IMAGE_MIME: ReadonlySet<string> = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
])

/** quicktime is what a Mac screen recording arrives as; x-matroska is what OBS
 *  writes by default. Both transcode to mp4 on the way in. */
export const ACCEPTED_VIDEO_MIME: ReadonlySet<string> = new Set([
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
])

/** For the file input's `accept` attribute — the picker should not offer a
 *  member files we are going to refuse. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_IMAGE_MIME, ...ACCEPTED_VIDEO_MIME].join(',')

export type LimitFailure = { code: 'count' | 'type' | 'size' | 'duration', message: string }

const MB = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`

export function kindForMime(mime: string): 'image' | 'video' | null {
    const m = mime.toLowerCase()
    if (ACCEPTED_IMAGE_MIME.has(m)) return 'image'
    if (ACCEPTED_VIDEO_MIME.has(m)) return 'video'
    return null
}

export function checkItemCount(count: number): LimitFailure | null {
    if (count > MAX_ITEMS_PER_SUBMISSION) {
        return { code: 'count', message: `A submission can carry at most ${MAX_ITEMS_PER_SUBMISSION} items. Send the rest as a second submission.` }
    }
    return null
}

export function checkFile(f: { mime: string, bytes: number, durationSec?: number }): LimitFailure | null {
    const kind = kindForMime(f.mime)
    if (!kind) return { code: 'type', message: 'That file type is not accepted. Photos can be JPEG, PNG or WebP; video can be MP4, MOV, WebM or MKV.' }

    if (f.bytes <= 0) return { code: 'size', message: 'That file is empty.' }

    const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
    if (f.bytes > max) return { code: 'size', message: `${kind === 'image' ? 'Photos' : 'Video'} must be under ${MB(max)}. That one is ${MB(f.bytes)}.` }

    // An unreadable duration is not a refusal: some containers do not expose it
    // to the browser at all, and ffprobe checks it again on arrival, before any
    // CPU is spent transcoding.
    if (kind === 'video' && f.durationSec !== undefined && f.durationSec > MAX_VIDEO_SECONDS) {
        return { code: 'duration', message: `Clips must be under ${MAX_VIDEO_SECONDS / 60} minutes. That one is ${Math.round(f.durationSec / 60)} minutes.` }
    }

    return null
}
