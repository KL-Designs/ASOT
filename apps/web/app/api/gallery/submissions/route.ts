import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { STAGING_DIR } from '@/lib/gallery/paths'
import { enqueue } from '@/lib/gallery/queue'
import { checkFile, checkItemCount, kindForMime } from '@/lib/gallery/limits'
import { parseEmbedUrl } from '@/lib/gallery/embeds'
import { splitOperation } from '@/lib/gallery/naming'

/**
 * One submitted item per request.
 *
 * Not one submission per request, deliberately: progress is reported per file,
 * and a single 500MB body carrying twenty of them has no meaningful progress
 * bar and no way to retry just the one that failed. The client generates a
 * `batchId` and sends each item against it, which is what groups them for the
 * reviewer.
 *
 * The response returns as soon as the bytes are on disk. Transcoding happens
 * afterwards on the queue — a five-minute 1080p encode would hold this request
 * open past every proxy timeout, and it would make the upload bar sit at 100%
 * for minutes, which is worse than no bar at all.
 */

// A 500MB body needs longer than the platform default to arrive.
export const maxDuration = 300

/** The subset of GalleryMedia an operation choice fills in. Declared explicitly
 *  — rather than left for TypeScript to infer from the two return statements
 *  below — so `takenAt` has one real type (`Date | null | undefined`) that the
 *  caller can read directly. Without this, the inferred return type is a union
 *  of `{}` and the full shape, and reading `.takenAt` off that union needs an
 *  unchecked cast that would silently stop catching a typo'd field name. */
type OperationFields = {
    operationId?: ObjectId
    operation?: string
    opLabel?: string
    year?: string
    takenAt?: Date | null
}

/** Resolves the operation the submitter chose into the four fields that have to
 *  agree with each other. `'unknown'` leaves every one of them absent, which is
 *  what makes an undated item sort into its own group rather than lying about
 *  a date. */
async function resolveOperation(operationId: string | null): Promise<OperationFields> {
    if (!operationId || operationId === 'unknown') return {}

    if (!ObjectId.isValid(operationId)) return {}
    const op = await Db.operations.findOne(
        { _id: new ObjectId(operationId) },
        { projection: { title: 1, date: 1 } },
    )
    if (!op) return {}

    const { label } = splitOperation(op.title ?? '')
    return {
        operationId: op._id,
        operation: op.title ?? undefined,
        opLabel: label,
        year: op.date ? String(new Date(op.date).getFullYear()) : undefined,
        takenAt: op.date ? new Date(op.date) : null,
    }
}

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await hasPermission(me, 'gallery.submit')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = request.headers.get('content-type') ?? ''
    const isEmbed = contentType.includes('application/json')

    const form = isEmbed ? null : await request.formData()
    const body = isEmbed ? await request.json().catch(() => ({})) : null

    const field = (name: string): string | null =>
        isEmbed ? (body?.[name] ?? null) : ((form!.get(name) as string) ?? null)

    const batchId = field('batchId')
    if (!batchId || !/^[a-z0-9-]{8,64}$/.test(batchId)) {
        return NextResponse.json({ error: 'A batch id is required' }, { status: 400 })
    }

    // The submit page already refuses past MAX_ITEMS_PER_SUBMISSION before a
    // byte moves, but that is a browser-side courtesy, not enforcement — a
    // hand-crafted request can skip the page entirely. Scoped to the caller's
    // own items so nobody can push someone else's batch over the limit by
    // posting under the same batchId.
    const existingInBatch = await Db.galleryMedia.countDocuments({ batchId, authorId: me.id })
    const countFailure = checkItemCount(existingInBatch + 1)
    if (countFailure) return NextResponse.json({ error: countFailure.message }, { status: 400 })

    const caption = (field('caption') ?? '').trim().slice(0, 500) || undefined

    let tags: string[] = []
    try {
        const raw = isEmbed ? body?.tags : JSON.parse(field('tags') ?? '[]')
        if (Array.isArray(raw)) tags = raw.filter((t): t is string => typeof t === 'string').slice(0, 10)
    } catch { /* an unparseable tag list is no tags, not an error */ }

    // Only slugs that actually exist, so a hand-crafted request cannot invent
    // a tag that then shows up in the facet rail.
    if (tags.length) {
        const known = await Db.galleryTags.find({ slug: { $in: tags } }, { projection: { slug: 1 } }).toArray()
        tags = known.map(t => t.slug)
    }

    const operation = await resolveOperation(field('operationId'))

    const common = {
        ...operation,
        // Explicit rather than left to the spread: an unknown/invalid/missing
        // operation resolves to `{}`, which carries no `takenAt` key at all,
        // and GalleryMedia.takenAt is `Date | null` — never undefined.
        takenAt: operation.takenAt ?? null,
        authorId: me.id,
        authorName: me.guild?.displayName || me.globalName || me.username,
        caption,
        tags,
        batchId,
        up: 0,
        down: 0,
        createdAt: new Date(),
    }

    // ── An embed: nothing to upload, nothing to transcode ────────────────────
    if (isEmbed) {
        const parsed = parseEmbedUrl(String(body?.embedUrl ?? ''))
        if (!parsed) {
            return NextResponse.json({ error: 'That link is not a YouTube or Twitch video.' }, { status: 400 })
        }

        const doc = {
            ...common,
            kind: 'video' as const,
            source: parsed.provider,
            embedId: parsed.id,
            embedKind: parsed.kind,
            embedUrl: parsed.canonicalUrl,
            status: 'pending' as const,
        }
        const { insertedId } = await Db.galleryMedia.insertOne(doc as GalleryMedia)
        return NextResponse.json({ id: insertedId.toString(), status: 'pending' })
    }

    // ── A file ───────────────────────────────────────────────────────────────
    const file = form!.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const kind = kindForMime(file.type)
    // Duration is not checked here: the browser already refused an over-length
    // clip before uploading, and ffprobe checks it again before spending any
    // CPU on the encode. Re-deriving it from bytes would be a guess.
    const failure = checkFile({ mime: file.type, bytes: file.size })
    if (!kind || failure) {
        return NextResponse.json({ error: failure?.message ?? 'That file type is not accepted.' }, { status: 400 })
    }

    const doc = { ...common, kind, source: 'upload' as const, status: 'processing' as const }
    const { insertedId } = await Db.galleryMedia.insertOne(doc as GalleryMedia)
    const id = insertedId.toString()

    /* Staged under the document's own id and with no extension. The name is
       therefore never anything a member chose, which takes the whole class of
       filename problems off the table. */
    mkdirSync(STAGING_DIR, { recursive: true })
    writeFileSync(path.join(STAGING_DIR, id), Buffer.from(await file.arrayBuffer()))

    enqueue(id)

    return NextResponse.json({ id, status: 'processing' })
}
