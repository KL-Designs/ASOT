import { ObjectId } from 'mongodb'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import path from 'path'

import Db from '@/lib/mongo'
import { MEDIA_DIR, STAGING_DIR, mediaKey, posterKey } from './paths'
import { processStill, processVideo } from './process'

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
    } catch (err) {
        await fail(_id, err instanceof Error ? err.message : 'Processing failed.')
    }
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
 */
async function fail(_id: ObjectId, message: string): Promise<void> {
    try {
        await Db.galleryMedia.updateOne({ _id }, { $set: { status: 'pending', processingError: message } })
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
