import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'
import db from '@/lib/mongo'
import { resolveStorageKey } from '@/lib/gallery/paths'

const SOTM_DIR = path.resolve('../../storage/gallery/sotm')
const SETTING_ID = 'screenshotOfMonth'

const MIME_MAP: Record<string, string> = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    // A mediaId-based pick can be any still already in the archive — the
    // library picker doesn't re-restrict by extension the way the old
    // upload form's ALLOWED_MIME did — so this also has to cover the two
    // extensions /api/gallery/media/[id] accepts that the legacy upload
    // form never did.
    '.jfif': 'image/jpeg',
    '.gif':  'image/gif',
    '.png':  'image/png',
    '.webp': 'image/webp',
}

/**
 * Serves the current SOTM's bytes — the URL Hero.tsx, GalleryBanner.tsx, the
 * join page and useGalleryData's lightbox all hit unconditionally, none of
 * them aware of whether the current pick is a legacy on-disk file or a
 * library media document.
 *
 * A record set through PUT /api/gallery/sotm (task 6) carries a `mediaId`
 * rather than a file under SOTM_DIR — its `filename` is a display name only,
 * not a path — so this resolves the bytes the same way
 * /api/gallery/media/[id] does for everything else, via resolveStorageKey.
 * The legacy branch below is byte-for-byte what this route did before that
 * existed, so a record set before this shipped keeps resolving exactly as
 * it always has.
 */
export async function GET() {
    const doc = await db.siteSettings.findOne({ _id: SETTING_ID })
    if (!doc) return NextResponse.json({ error: 'No screenshot of the month set' }, { status: 404 })

    const mediaId = typeof doc.mediaId === 'string' ? doc.mediaId : null

    let filePath: string | null = null

    if (mediaId && ObjectId.isValid(mediaId)) {
        // `status: 'live'` for the same reason /api/gallery/media/[id]
        // refuses anything that isn't public: moving an item to `hidden` is
        // the manual "take this down now" lever, and without this check the
        // bytes stay readable here — and on the homepage masthead — after
        // it has been pulled.
        const media = await db.galleryMedia.findOne({ _id: new ObjectId(mediaId), status: 'live' })
        filePath = media?.storageKey ? resolveStorageKey(media.storageKey) : null
    } else {
        const filename = typeof doc.filename === 'string' ? doc.filename : null
        if (filename) {
            const candidate = path.join(SOTM_DIR, path.basename(filename))
            filePath = candidate.startsWith(SOTM_DIR + path.sep) ? candidate : null
        }
    }

    if (!filePath || !fs.existsSync(filePath))
        return NextResponse.json({ error: 'Image not found' }, { status: 404 })

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_MAP[ext] ?? 'image/jpeg'
    const buffer = fs.readFileSync(filePath)

    return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=0, must-revalidate',
        },
    })
}
