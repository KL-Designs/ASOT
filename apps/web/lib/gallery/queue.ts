import { ObjectId } from 'mongodb'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import { MEDIA_DIR, STAGING_DIR, mediaKey, posterKey } from './paths'
import { processStill, processVideo } from './process'
import { relocateMedia } from './relocate'
import { galleryDeps } from './deps'

/**
 * One transcode at a time, in this process.
 *
 * Not a job server, deliberately. This is a single container, the work is
 * minutes-scale and idempotent, and it arrives in bursts of a dozen after an
 * operation rather than as a stream. An in-memory array drained on a promise
 * chain is the whole mechanism.
 *
 * Concurrency is 1 because ffmpeg will happily saturate every core it is given,
 * and this process is also serving the site.
 *
 * Two properties are load-bearing:
 *
 *  - A failed transcode still reaches the review queue, carrying its error.
 *    An item that silently never appears anywhere is far worse than one a
 *    reviewer can look at and reject.
 *  - A restart mid-transcode does not strand documents at `processing`
 *    forever. `sweepStranded` runs at startup and either re-queues the work or
 *    hands it to a reviewer.
 */

const pending: string[] = []
let draining = false

export function enqueue(mediaId: string): void {
    pending.push(mediaId)
    if (!draining) void drain()
}

async function drain(): Promise<void> {
    draining = true
    try {
        for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
            await processOne(id).catch(err => {
                // processOne handles its own failures; reaching here means the
                // failure handling itself failed, which must not stop the queue.
                console.error('[gallery/queue] unrecoverable while processing', id, err)
            })
        }
    } finally {
        draining = false
    }
}

async function processOne(id: string): Promise<void> {
    const _id = new ObjectId(id)

    // Everything below — including the initial read — is inside this try.
    // Any of it can throw on a Mongo hiccup, and an error that escaped
    // uncaught to drain()'s per-item .catch would only get logged, leaving
    // the document at `processing` with nothing in the queue pointing at it
    // until the next restart's sweepStranded(). Routing every failure through
    // fail() instead is what keeps that promise: a failed transcode always
    // reaches the review queue, not just a failed transcode after the read.
    try {
        const doc = await Db.galleryMedia.findOne({ _id })
        if (!doc || doc.status !== 'processing') return

        const staged = path.join(STAGING_DIR, id)

        if (!existsSync(staged)) {
            await fail(_id, 'The uploaded file went missing before it could be processed.')
            return
        }

        mkdirSync(MEDIA_DIR, { recursive: true })
        const destNoExt = path.join(MEDIA_DIR, id)

        try {
            if (doc.kind === 'video') {
                const out = await processVideo(staged, destNoExt)
                await Db.galleryMedia.updateOne({ _id }, {
                    $set: {
                        status: 'pending',
                        storageKey: mediaKey(id, out.ext),
                        posterKey: posterKey(id),
                        width: out.width, height: out.height,
                        durationSec: out.durationSec, bytes: out.bytes,
                    },
                    $unset: { processingError: '' },
                })
            } else {
                const out = await processStill(staged, destNoExt)
                await Db.galleryMedia.updateOne({ _id }, {
                    $set: {
                        status: 'pending',
                        storageKey: mediaKey(id, out.ext),
                        width: out.width, height: out.height, bytes: out.bytes,
                    },
                    $unset: { processingError: '' },
                })
            }
        } finally {
            // The staged original has served its purpose either way. Leaving it
            // would grow the staging directory without bound.
            try { unlinkSync(staged) } catch { /* already gone */ }
        }

        // A J5 direct upload skips review. Outside the transcode's try on
        // purpose: by here the item is a good, reviewable `pending` document,
        // and a failure to file it must leave it exactly that rather than be
        // reported as a failed transcode.
        if (doc.publishOnProcess) {
            try {
                await publishProcessed(_id, doc.publishOnProcess)
            } catch (err) {
                console.error('[gallery/queue] processed but could not publish direct upload', id, err)
                await Db.galleryMedia.updateOne({ _id }, {
                    $set: { processingError: 'Uploaded directly by J5 but could not be filed into the archive. Publish it from the review queue.' },
                    $unset: { publishOnProcess: '' },
                }).catch(() => { })
            }
        }
    } catch (err) {
        await fail(_id, err instanceof Error ? err.message : 'Processing failed.')
    }
}

/**
 * Process one item now, in the caller's request, rather than behind the queue.
 *
 * For a single still the caller needs live before it can answer — the SOTM
 * upload has to point the homepage at it in the same request. Never for video:
 * the queue's concurrency of 1 exists to keep ffmpeg off every core at once,
 * and a request-path encode is exactly what the queue was built to avoid.
 * sharp on one still is sub-second and safe to run alongside the queue.
 */
export async function processNow(mediaId: string): Promise<void> {
    await processOne(mediaId)
}

/**
 * pending -> live for a processed upload, without a reviewer: file the bytes
 * into the content tree, then flip the status. Same order and reasoning as the
 * review route's accept (submissions/[id]/route.ts): relocate first, so a
 * throw publishes nothing.
 */
export async function publishProcessed(_id: ObjectId, publishedBy: string): Promise<void> {
    await relocateMedia(galleryDeps(), _id)
    await Db.galleryMedia.updateOne({ _id, status: 'pending' }, {
        $set: { status: 'live', publishedAt: new Date(), publishedBy },
        $unset: { processingError: '', publishOnProcess: '' },
    })
}

/**
 * A failure still lands in the review queue, with its reason attached.
 *
 * This write is itself guarded: if Mongo is unavailable for both the read (or
 * transcode) that got us here AND this write, the document is left stranded
 * at `processing` between restarts. That double-fault is not handled
 * in-process — no retry loop, no timer, just a log — because sweepStranded()
 * at startup already exists to recover exactly this, and duplicating that
 * machinery here for a rare double-fault would be new moving parts for a
 * problem the startup sweep already covers.
 *
 * Known gap, not fixed here: if `processVideo` throws after ffmpeg has
 * already written the encoded `.mp4`/`_poster.jpg` into MEDIA_DIR — e.g. the
 * post-transcode dimension probe failing in a way severe enough to still
 * throw — those bytes are never referenced by `storageKey` (this document
 * still has none) and are never cleaned up by this function. They sit
 * orphaned on disk. Recovering them belongs with a broader orphan sweep, not
 * a special case bolted onto a failure handler that otherwise has nothing to
 * delete.
 */
async function fail(_id: ObjectId, message: string): Promise<void> {
    try {
        // publishOnProcess goes too: a failed direct upload is a reviewer's
        // call now, the same as any other failure.
        await Db.galleryMedia.updateOne({ _id }, { $set: { status: 'pending', processingError: message }, $unset: { publishOnProcess: '' } })
    } catch (err) {
        console.error('[gallery/queue] failed to record a processing failure for', _id.toString(), err)
    }
}

/**
 * Called once at startup.
 *
 * Anything left at `processing` was interrupted by a restart. If its staged
 * original survived, the work can simply be redone; if it did not, there is
 * nothing to redo and a reviewer should see it rather than it sitting invisible
 * forever.
 */
export async function sweepStranded(): Promise<number> {
    const stranded = await Db.galleryMedia.find({ status: 'processing' }, { projection: { _id: 1 } }).toArray()

    for (const { _id } of stranded) {
        const id = _id.toString()
        if (existsSync(path.join(STAGING_DIR, id))) enqueue(id)
        else await fail(_id, 'Processing was interrupted and the upload could not be recovered. Ask the submitter to send it again.')
    }

    if (stranded.length) console.log(`[gallery/queue] swept ${stranded.length} interrupted item(s)`)
    return stranded.length
}
