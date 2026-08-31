/**
 * Take the order prefix off every operation folder that still carries one.
 *
 *   npm --prefix apps/web run strip:folder-numbers -- --apply   # writes
 *   npm --prefix apps/web run strip:folder-numbers              # dry run
 *
 * Normally run from the repo root's `npm start` menu (Migrations -> Strip:
 * gallery folder numbers), which does the dry-run-then-confirm flow for you.
 *
 * relocate.ts stopped minting `{n}. {label}` folders and the ordering moved
 * into the database (`takenAt`); a backup export puts the numbers back inside
 * the zip. Existing folders were left numbered at the time, because
 * `findByOperationKey` matches on `splitOperation(folder).label` and so still
 * finds them — which means the numbers simply survived. This finishes it.
 *
 * A TypeScript script under apps/web rather than a sibling .mjs in the repo
 * root's scripts/, for the reason reconcile-gallery.ts gives: this migration
 * has to agree with `splitOperation` about what a prefix IS, exactly, and a
 * fourth hand-copied ORDER_PREFIX that disagreed by one character would either
 * rename a folder the application still considers numbered or mangle one it
 * does not. It imports the real module instead.
 *
 * Nothing here deletes a document or a file. Every write is a rename or a
 * `$set`, and the plan is printed in full before any of them happen.
 *
 * ORDER, and why. For each folder: rename the DIRECTORY first, then update its
 * documents. relocate.ts's move/update pair reasons this out for the
 * single-file case and the same reasoning holds here — there is no transaction
 * spanning a filesystem and a database, so one of the two goes first and the
 * window between them is real. The directory goes first because it is the half
 * that is all-or-nothing: `renameSync` either happens or does not, while the
 * document update is N writes that can stop in the middle. That leaves exactly
 * one possible partial state — the folder renamed, some documents behind — and
 * planFolderStrip takes its candidates from the storage KEYS as well as from
 * the disk, so simply running this again finishes the job. The reverse order
 * has no such recovery: documents rewritten to a folder that was never created
 * look, to the next reconcile, like a folder full of missing files.
 *
 * A partial failure is reported loudly and sets a non-zero exit code, so the
 * start menu shows the run as failed rather than offering the next step.
 */
import { existsSync, readdirSync, renameSync } from 'fs'
import type { Dirent } from 'fs'
import path from 'path'
import { MongoClient } from 'mongodb'
import type { AnyBulkWriteOperation, Collection, WithId } from 'mongodb'

import { CONTENT_DIR } from '@/lib/gallery/paths'
import { planFolderStrip } from '@/lib/gallery/strip-folder-numbers'
import type { ContainerListing, FolderRename } from '@/lib/gallery/strip-folder-numbers'

const APPLY = process.argv.slice(2).includes('--apply')

const { MONGO_URI, MONGO_DB } = process.env
if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

/* CONTENT_DIR is resolved relative to the working directory (paths.ts), which
   for `npm --prefix apps/web run` is apps/web — the same assumption
   reconcile-gallery.ts makes. A missing tree is a hard failure rather than an
   empty, reassuring run that renamed nothing because it was looking in the
   wrong place. */
if (!existsSync(CONTENT_DIR)) {
    console.error(`No gallery content at ${CONTENT_DIR}. Run this through apps/web.`)
    process.exit(1)
}

/** Year folders that could not be listed. Not the same as empty ones: an
 *  unlistable folder looks exactly like an empty one to planFolderStrip, and
 *  the difference is what decides whether a rename would be a merge. */
const unreadable: string[] = []

/** The year folders (and `Unknown`) with their own subdirectories: the two
 *  levels this migration can see, and no deeper. Campaign, mission and day
 *  folders never carried a prefix and are never read here at all. */
function readContainers(): ContainerListing[] {
    const containers: ContainerListing[] = []

    let entries: Dirent[]
    try {
        entries = readdirSync(CONTENT_DIR, { withFileTypes: true })
    } catch (err) {
        console.error(`Could not read ${CONTENT_DIR}: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        let folders: string[] = []
        try {
            folders = readdirSync(path.join(CONTENT_DIR, entry.name), { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => e.name)
        } catch {
            // Reported and skipped rather than fatal: a five-year archive must
            // not be blocked by one folder it cannot list.
            unreadable.push(entry.name)
            continue
        }
        containers.push({ name: entry.name, folders })
    }

    return containers
}

type MediaDoc = WithId<Pick<GalleryMedia, 'storageKey' | 'operation' | 'campaign'>>

function describe(rename: FolderRename): string {
    const where = `${rename.container}/${rename.from}`
    const action = rename.renameOnDisk
        ? `-> ${rename.to}`
        : `-> ${rename.to} (already renamed on disk; documents only)`
    return `  ${where} ${action}   ${rename.keys.length} document(s)`
}

async function main(): Promise<void> {
    const client = new MongoClient(MONGO_URI!)
    await client.connect()
    try {
        const db = client.db(MONGO_DB!)
        const media: Collection<GalleryMedia> = db.collection('gallery_media')

        const docs: MediaDoc[] = await media
            .find(
                { storageKey: { $regex: '^(content|legacy):' } },
                { projection: { storageKey: 1, operation: 1, campaign: 1 } },
            )
            .toArray()

        /* Keyed by storageKey, which a unique index already guarantees is
           unique. Documents with no key were excluded by the query; the guard
           is here because the projection type still allows one. */
        const byKey = new Map<string, MediaDoc>()
        for (const doc of docs) {
            if (typeof doc.storageKey === 'string') byKey.set(doc.storageKey, doc)
        }

        const containers = readContainers()
        const plan = planFolderStrip(containers, [...byKey.keys()])

        if (unreadable.length) {
            console.warn(`\ncould not read ${unreadable.length} year folder(s) — anything inside them is invisible to this plan:`)
            for (const name of unreadable) console.warn(`  ${name}`)
        }

        console.log(`\n${plan.renames.length} folder(s) to strip, ${plan.skips.length} skipped:`)
        for (const rename of plan.renames) console.log(describe(rename))

        /* Printed as its own list rather than a footnote. These folders lose
           their number from the DISK here and can never get it back in a
           backup zip either, because export-numbering.ts refuses to number a
           folder holding a document that can only be found by its path. That
           is the whole legacy archive, and it is the one consequence of this
           migration a reader should see before typing --apply. */
        const legacy = plan.renames.filter(r => !r.idNamed)
        if (legacy.length) {
            console.warn(`\n${legacy.length} of those hold path-matched (legacy) documents. A backup export cannot number them again:`)
            for (const rename of legacy) console.warn(`  ${rename.container}/${rename.from}`)
        }

        if (plan.skips.length) {
            console.log('\nskipped:')
            for (const skip of plan.skips) {
                console.log(`  ${skip.container}/${skip.folder} — ${skip.reason} (${skip.documents} document(s))`)
            }
        }

        if (!APPLY) {
            const documents = plan.renames.reduce((n, r) => n + r.keys.length, 0)
            console.log(`\nDry run — nothing written. Would rename ${plan.renames.length} folder(s) and rewrite ${documents} document(s).`)
            console.log('Read the plan above, then re-run with --apply to write.')
            return
        }

        let renamed = 0
        let updated = 0
        const failures: string[] = []

        for (const rename of plan.renames) {
            const source = path.join(CONTENT_DIR, rename.container, rename.from)
            const destination = path.join(CONTENT_DIR, rename.container, rename.to)

            if (rename.renameOnDisk) {
                /* Re-checked immediately before the rename, not only in the
                   plan. The listing is a snapshot, and on POSIX renaming a
                   directory onto an EMPTY one succeeds silently — which is
                   precisely the merge of two operations' photographs this
                   migration must never perform. */
                if (existsSync(destination)) {
                    failures.push(`${rename.container}/${rename.from}: "${rename.to}" appeared before the rename — skipped, nothing written`)
                    continue
                }
                try {
                    renameSync(source, destination)
                    renamed++
                } catch (err) {
                    // The documents are deliberately left alone: they still
                    // name the folder that is still there, so this folder is
                    // exactly as it was and the next run will try again.
                    failures.push(`${rename.container}/${rename.from}: rename failed (${err instanceof Error ? err.message : String(err)}) — documents left untouched`)
                    continue
                }
            }

            const operations: AnyBulkWriteOperation<GalleryMedia>[] = []
            for (const rewrite of rename.keys) {
                const doc = byKey.get(rewrite.from)
                if (!doc) continue

                const set: Partial<Pick<GalleryMedia, 'storageKey' | 'operation' | 'opLabel' | 'campaign'>> = {
                    storageKey: rewrite.to,
                }

                /* The facet that NAMES this folder moves with it, or the rail
                   splits: the J5 and public facet rails group on the raw
                   `operation`/`campaign` value, so a document still claiming
                   "5. Op Northern Wall" would sit in a row of its own beside
                   the "Op Northern Wall" row every newly filed item joins —
                   two rows, one folder. It also breaks the backup export,
                   which looks the folder up by the facet the database holds
                   and would miss the renamed directory entirely.
                   `opLabel` is already the stripped form on every document
                   (every producer writes splitOperation(...).label), so
                   writing it is a no-op for a healthy record and a repair for
                   one written before opLabel existed. */
                if (rewrite.facet === 'campaign') {
                    if (doc.campaign === rename.from) set.campaign = rename.to
                } else if (doc.operation === rename.from) {
                    set.operation = rename.to
                    set.opLabel = rename.to
                }

                operations.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } })
            }

            if (!operations.length) continue

            try {
                const result = await media.bulkWrite(operations, { ordered: false })
                updated += result.modifiedCount
                if (result.modifiedCount < operations.length) {
                    failures.push(`${rename.container}/${rename.from}: renamed, but only ${result.modifiedCount} of ${operations.length} document(s) were updated — RE-RUN to finish`)
                }
            } catch (err) {
                /* The folder is renamed and its documents are not. Loud, and
                   with the recovery named: planFolderStrip finds this folder
                   again from the KEYS on the next run, sees the directory is
                   already at its stripped name, and updates the documents
                   without touching the disk. */
                failures.push(`${rename.container}/${rename.from}: renamed, but the document update FAILED (${err instanceof Error ? err.message : String(err)}) — RE-RUN to finish`)
            }
        }

        console.log(`\nrenamed ${renamed} folder(s) on disk, rewrote ${updated} document(s).`)

        if (failures.length) {
            console.error(`\n${failures.length} folder(s) did not complete:`)
            for (const failure of failures) console.error(`  ${failure}`)
            console.error('\nRe-run this migration with --apply. It is idempotent, and it finishes a half-applied folder.')
            process.exitCode = 1
        }
    } finally {
        await client.close()
    }
}

// Matching the sibling scripts here: a rejected promise must exit non-zero, or
// the start menu's dry run would report success and offer to --apply a pass
// that never completed.
main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
})
