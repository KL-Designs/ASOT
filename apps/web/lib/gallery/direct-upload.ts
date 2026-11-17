import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import { STAGING_DIR } from './paths'
import { checkFile, kindForMime } from './limits'
import { galleryDeps } from './deps'
import { operationFacets } from './operation-facets'

/**
 * A J5 upload straight into the archive, skipping the review queue.
 *
 * Two callers: the Media tab's Upload (POST /api/gallery/admin/upload) and the
 * SOTM tab's "Upload new" (POST /api/gallery/sotm). Both write the same
 * document the member submit route does — same limits, same staging scheme,
 * same operation facets — with one difference: `publishOnProcess` carries the
 * uploader's id, and the queue publishes the item itself once processing
 * succeeds (lib/gallery/queue.ts). So a direct upload is filed into the
 * content tree by relocateMedia exactly like an accepted submission, and a
 * failed transcode still lands in the review queue with its reason.
 *
 * This only stages. The caller decides whether to enqueue() or processNow().
 */

export type DirectUploadInput = {
    file: File
    uploader: { id: string, name: string }
    operationId?: string | null
    caption?: string | null
    tags?: string[]
    batchId?: string | null
    /** SOTM: a video would be a broken <img> on three public mastheads. */
    imagesOnly?: boolean
}

export type DirectUploadResult =
    | { ok: true, id: string, kind: 'image' | 'video' }
    | { ok: false, status: number, error: string }

export async function stageDirectUpload(input: DirectUploadInput): Promise<DirectUploadResult> {
    const { file, uploader } = input

    const kind = kindForMime(file.type)
    const failure = checkFile({ mime: file.type, bytes: file.size })
    if (!kind || failure) return { ok: false, status: 400, error: failure?.message ?? 'That file type is not accepted.' }
    if (input.imagesOnly && kind !== 'image') return { ok: false, status: 400, error: 'Only still images can be the screenshot of the month.' }

    let tags: string[] = []
    if (input.tags?.length) {
        const known = await Db.galleryTags.find({ slug: { $in: input.tags.slice(0, 10) } }, { projection: { slug: 1 } }).toArray()
        tags = known.map(t => t.slug)
    }

    // Same resolver as a member submission. A stale or malformed id files the
    // item under Unknown rather than refusing bytes the uploader just sent;
    // J5 can reassign it from the Media tab afterwards.
    const facets = input.operationId ? await operationFacets(galleryDeps(), input.operationId) : null

    const batchId = input.batchId && /^[a-z0-9-]{8,64}$/.test(input.batchId) ? input.batchId : undefined
    const caption = (input.caption ?? '').trim().slice(0, 500) || undefined

    const doc = {
        ...(facets?.$set ?? {}),
        takenAt: facets?.$set.takenAt ?? null,
        authorId: uploader.id,
        authorName: uploader.name,
        caption,
        tags,
        ...(batchId ? { batchId } : {}),
        up: 0,
        down: 0,
        createdAt: new Date(),
        kind,
        source: 'upload' as const,
        status: 'processing' as const,
        publishOnProcess: uploader.id,
    }
    const { insertedId } = await Db.galleryMedia.insertOne(doc as GalleryMedia)
    const id = insertedId.toString()

    // Staged under the document's own id, no extension — see submissions/route.ts.
    mkdirSync(STAGING_DIR, { recursive: true })
    writeFileSync(path.join(STAGING_DIR, id), Buffer.from(await file.arrayBuffer()))

    return { ok: true, id, kind }
}
