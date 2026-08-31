import type { Filter, UpdateFilter } from 'mongodb'

import { contentKey } from './paths'

/**
 * Keeping gallery_media pointed at a file the Operations tab just renamed.
 *
 * A module rather than a helper inside app/api/gallery/admin/reorder/route.ts,
 * because a Next.js route file may only export route handlers and the small
 * set of config names `typedRoutes` allows — exporting anything else fails
 * `next build` with "Property 'followRename' is incompatible with index
 * signature", which `tsc --noEmit`, lint and vitest all pass straight over.
 * The test needs to import it, so it lives here.
 */

/** Method syntax, so a test's narrower stand-in and the real driver's full
 *  `Filter`/`UpdateFilter` signature both satisfy it — the same bivariance
 *  trick RelocateDeps and ReconcileDeps use, and for the same reason. */
export type ReorderMedia = {
    updateOne(filter: Filter<GalleryMedia>, update: UpdateFilter<GalleryMedia>): Promise<unknown>
}

/**
 * Point each renamed file's document at its new path.
 *
 * `legacy:` as well as `content:`: they name the same directory, and a
 * developer database indexed before the rename still holds the old spelling —
 * missing it would leave exactly the legacy records this exists to protect
 * still orphaned. The new key is always written as `content:`, the spelling
 * everything writes now.
 *
 * A file with no document (never indexed) simply matches nothing. Serialised
 * rather than bulkWritten so each key move is its own atomic step against the
 * unique index, with no window in which two documents claim one key.
 *
 * The collection is a parameter rather than read from `@/lib/mongo` here, so
 * reorder.test.ts can pin the key rewriting against a real mongod: the route's
 * CONTENT_BASE is resolved at module load from the process's working
 * directory, so exercising POST itself would mean renaming files in the
 * developer's actual archive.
 */
export async function followRename(
    year: string,
    operation: string,
    stage: string,
    moves: { from: string, to: string }[],
    media: ReorderMedia,
): Promise<void> {
    const keyFor = (name: string) => `${year}/${operation}/${stage}/${name}`
    for (const { from, to } of moves) {
        await media.updateOne(
            { storageKey: { $in: [contentKey(keyFor(from)), `legacy:${keyFor(from)}`] } },
            { $set: { storageKey: contentKey(keyFor(to)) } },
        )
    }
}
