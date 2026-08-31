import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { reconcile, type ReconcileDeps } from './reconcile'

const OP_ID = new ObjectId('6a8000000000000000000001')
const A = new ObjectId('6a9380f11c4e5d2a77b31099')
const B = new ObjectId('6a937cc528231f89cb64d678')

/**
 * A stand-in document: a real `_id` plus whatever else a test wants to put on
 * it. The index signature is what lets a test both hand arbitrary fields in
 * and read arbitrary fields back out after an update, without an `as` on
 * either side — ReconcileMediaDoc's fields are `unknown` for exactly this.
 */
type Doc = Record<string, unknown> & { _id: ObjectId }

let root: string
let contentDir: string

function write(relative: string, body = 'BYTES') {
    const full = join(contentDir, ...relative.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
}

/** A minimal stand-in for the two collections reconcile reads. `find` returns
 *  a cursor because that is the shape the real driver has. */
function deps(docs: Doc[], ops: Doc[] = []): ReconcileDeps {
    return {
        contentDir,
        media: {
            find() {
                // A detached snapshot, exactly as the driver hands back — and
                // load-bearing, not tidiness. The documents rule 4 examines
                // are the ones read BEFORE the relocation writes, so they
                // still carry the OLD storageKey. Returning the live objects
                // instead would let updateOne's in-place mutation put the new
                // key on them, which is already in seenKeys by then, and the
                // seenIds guard — the only thing keeping a hand-reorganised
                // backup from being reported as entirely missing — would never
                // be reached by any test.
                return { async toArray() { return docs.map(d => ({ ...d })) } }
            },
            async updateOne(filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>, $unset?: Record<string, ''> }) {
                const doc = docs.find(d => d._id.equals(filter._id))
                if (!doc) return {}
                Object.assign(doc, update.$set ?? {})
                for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
                return {}
            },
        },
        operations: {
            find() {
                return { async toArray() { return ops } }
            },
        },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-reconcile-'))
    contentDir = join(root, 'content')
    mkdirSync(contentDir, { recursive: true })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('reconcile', () => {
    test('matches a file by the id in its name and leaves an unmoved item alone', async () => {
        const name = `Koda — Danger close [${A}].jpg`
        write(`2026/23. Op New Winter/${name}`)

        const docs: Doc[] = [{ _id: A, storageKey: `content:2026/23. Op New Winter/${name}`, caption: 'Danger close', tags: ['funny'], up: 3, down: 0 }]
        const report = await reconcile(deps(docs))

        expect(report.matchedById).toBe(1)
        expect(report.relocated).toEqual([])
        expect(report.notIndexed).toEqual([])
        expect(report.missingFiles).toEqual([])
    })

    // THE test. Everything about reorganising a backup by hand rests on this.
    test('a file moved into a different operation folder keeps its metadata and takes the new operation', async () => {
        const name = `Koda — Danger close [${A}].jpg`
        write(`2021/4. Op Silent Ridge/${name}`)

        const docs: Doc[] = [{
            _id: A,
            storageKey: `content:2026/23. Op New Winter/${name}`,   // stale — the file moved
            caption: 'Danger close', tags: ['funny', 'armour'], authorName: 'Koda', up: 3, down: 1,
            year: '2026', operation: '23. Op New Winter',
        }]
        const ops: Doc[] = [{ _id: OP_ID, title: 'OPERATION Silent Ridge — Sat', date: new Date('2021-08-14T09:00:00Z') }]

        const report = await reconcile(deps(docs, ops))

        expect(report.matchedById).toBe(1)
        expect(report.relocated).toHaveLength(1)
        expect(report.relocated[0]).toMatchObject({
            id: A.toString(),
            from: `content:2026/23. Op New Winter/${name}`,
            to: `content:2021/4. Op Silent Ridge/${name}`,
        })

        // Facets follow the folder…
        expect(docs[0].storageKey).toBe(`content:2021/4. Op Silent Ridge/${name}`)
        expect(docs[0].year).toBe('2021')
        expect(docs[0].operation).toBe('4. Op Silent Ridge')
        expect(docs[0].operationId).toEqual(OP_ID)
        expect(docs[0].takenAt).toEqual(new Date('2021-08-14T09:00:00Z'))

        // …and nothing a member or reviewer wrote is touched.
        expect(docs[0].caption).toBe('Danger close')
        expect(docs[0].tags).toEqual(['funny', 'armour'])
        expect(docs[0].authorName).toBe('Koda')
        expect(docs[0].up).toBe(3)
        expect(docs[0].down).toBe(1)

        // The move must not also be reported as a missing file. This is the
        // assertion that pins the seenIds guard: the snapshot rule 4 reads
        // still holds `content:2026/…`, which no file on disk answers to, so
        // deleting that guard turns this line red.
        expect(report.missingFiles).toEqual([])
    })

    /* The campaign grammar is one directory deeper than anything the walk had
       to reach before. A depth cap left where it was would not report these
       files as unreadable or not-indexed — it would never descend into the day
       folder at all, so every campaign item would come back under
       missingFiles, in front of a human holding a delete button. */
    test('a file four folders deep is scanned, matched, and gets the campaign facet from its path', async () => {
        const name = `Koda — Trinity [${A}].jpg`
        write(`2026/1. Op Trinity/Operation Trinity I/Saturday/${name}`)

        const docs: Doc[] = [{
            _id: A,
            storageKey: `content:2026/23. Op New Winter/${name}`,   // stale — the file moved
            caption: 'Trinity', tags: [], up: 0, down: 0,
            year: '2026', operation: '23. Op New Winter',
        }]
        const ops: Doc[] = [{ _id: OP_ID, title: 'OPERATION Trinity I — Sat', date: new Date('2026-05-16T09:00:00Z') }]

        const report = await reconcile(deps(docs, ops))

        expect(report.matchedById).toBe(1)
        expect(report.missingFiles).toEqual([])
        expect(docs[0].storageKey).toBe(`content:2026/1. Op Trinity/Operation Trinity I/Saturday/${name}`)
        expect(docs[0].campaign).toBe('1. Op Trinity')
        expect(docs[0].operation).toBe('Operation Trinity I')
        expect(docs[0].mission).toBe('Saturday')
        // operationFor() matches on the level above the day folder, which for
        // a campaign item is the campaign MISSION — and "Operation Trinity I"
        // normalises to the same key as the operation titled
        // "OPERATION Trinity I — Sat".
        expect(docs[0].operationId).toEqual(OP_ID)
    })

    /* The campaign-with-no-mission grammar. Three directories, so the walk and
       parseContentPath both already handle it — this pins that nothing has to
       change for it, and that reconcile does NOT invent a `campaign` for the
       campaign-named folder it finds there. relocateMedia wrote this document
       with no campaign either, so the two agree. */
    test('a file under a campaign folder with no mission level keeps no campaign facet', async () => {
        const name = `Koda — Trinity [${A}].jpg`
        write(`2026/16. Op Trinity/Saturday/${name}`)

        const docs: Doc[] = [{
            _id: A,
            storageKey: `content:2026/23. Op New Winter/${name}`,   // stale — the file moved
            year: '2026', operation: '23. Op New Winter', operationId: OP_ID,
        }]
        const ops: Doc[] = [{ _id: OP_ID, title: 'OPERATION Trinity I — Sat', date: new Date('2026-05-16T09:00:00Z') }]

        const report = await reconcile(deps(docs, ops))

        expect(report.matchedById).toBe(1)
        expect(report.missingFiles).toEqual([])
        expect(docs[0].storageKey).toBe(`content:2026/16. Op Trinity/Saturday/${name}`)
        expect('campaign' in docs[0]).toBe(false)
        expect(docs[0].operation).toBe('16. Op Trinity')
        expect(docs[0].mission).toBe('Saturday')

        /* The documented, move-only cost of this grammar, pinned rather than
           hidden: the folder is named after the CAMPAIGN and no operation is
           titled "Operation Trinity", so operationFor() cannot resolve one and
           the link is dropped. It takes a human MOVING the file to reach here
           — an unmoved file is never re-derived at all — and resolving it
           would mean querying the campaign list from a pass that currently
           only walks a tree. */
        expect('operationId' in docs[0]).toBe(false)
    })

    /* Out of a campaign folder and into a plain operation folder. The disk is
       the source of truth on this side, so the document must stop claiming the
       campaign — the same rule `operation` and `mission` have always followed,
       and the reason each of them is written-or-unset rather than only
       written. */
    test('a file dragged out of a campaign folder loses the campaign facet', async () => {
        const name = `Koda — Trinity [${A}].jpg`
        write(`2026/9. Op Elsewhere/${name}`)

        const docs: Doc[] = [{
            _id: A,
            storageKey: `content:2026/1. Op Trinity/Operation Trinity I/Saturday/${name}`,
            year: '2026', campaign: '1. Op Trinity', operation: 'Operation Trinity I', mission: 'Saturday',
        }]

        await reconcile(deps(docs, []))

        expect(docs[0].storageKey).toBe(`content:2026/9. Op Elsewhere/${name}`)
        expect('campaign' in docs[0]).toBe(false)
        expect(docs[0].operation).toBe('9. Op Elsewhere')
        expect('mission' in docs[0]).toBe(false)
    })

    // Everything scripts/index-gallery.mjs has written so far is keyed
    // `legacy:`. Matching only `content:` would report every record in the
    // archive missing and every file not-indexed on the same pass.
    test('a legacy:-keyed document matches the file at its path', async () => {
        write('2021/4. Op Silent Ridge/I/arma3_02.png')
        const docs: Doc[] = [{ _id: B, storageKey: 'legacy:2021/4. Op Silent Ridge/I/arma3_02.png' }]

        const report = await reconcile(deps(docs))

        expect(report.matchedByPath).toBe(1)
        expect(report.notIndexed).toEqual([])
        expect(report.missingFiles).toEqual([])
        // Rule 2 matches and moves on — it rewrites nothing.
        expect(docs[0].storageKey).toBe('legacy:2021/4. Op Silent Ridge/I/arma3_02.png')
    })

    // Copying rather than moving is a normal mistake when a human reorganises
    // a downloaded backup, and it leaves two files carrying the same [id].
    test('a file copied rather than moved relocates its document once, and the copy is reported', async () => {
        const name = `Koda — Danger close [${A}].jpg`
        write(`2021/4. Op Silent Ridge/${name}`)
        write(`2022/9. Op Copper Ridge/${name}`)

        const docs: Doc[] = [{ _id: A, storageKey: `content:2026/23. Op New Winter/${name}`, caption: 'Danger close' }]
        const report = await reconcile(deps(docs))

        // One document has one file. The second copy cannot also be it.
        expect(report.matchedById).toBe(1)
        expect(report.relocated).toHaveLength(1)
        expect(report.notIndexed).toHaveLength(1)
        expect(report.missingFiles).toEqual([])

        // Which copy won is readdir order and not this test's business; that
        // the document followed exactly one of them, and the other was
        // reported rather than silently written over it, is.
        expect(docs[0].storageKey).toBe(report.relocated[0].to)
        expect(`content:${report.notIndexed[0].path}`).not.toBe(report.relocated[0].to)
    })

    // An operation with no date still names the folder correctly. Writing its
    // absent date through would destroy a date a reviewer typed in by hand.
    test('a match against a dateless operation keeps a takenAt set by hand', async () => {
        const name = `Koda — Danger close [${A}].jpg`
        write(`2021/4. Op Silent Ridge/${name}`)

        const hand = new Date('2021-08-14T09:00:00Z')
        const docs: Doc[] = [{ _id: A, storageKey: `content:Unknown/${name}`, takenAt: hand }]
        const ops: Doc[] = [{ _id: OP_ID, title: 'OPERATION Silent Ridge — Sat' }]

        const report = await reconcile(deps(docs, ops))

        expect(report.relocated).toHaveLength(1)
        expect(docs[0].operationId).toEqual(OP_ID)
        expect(docs[0].takenAt).toEqual(hand)
    })

    test('a legacy file with no id in its name matches by path', async () => {
        write('2021/4. Op Silent Ridge/I/arma3_01.png')
        const docs: Doc[] = [{ _id: B, storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_01.png', caption: null }]

        const report = await reconcile(deps(docs))
        expect(report.matchedByPath).toBe(1)
        expect(report.notIndexed).toEqual([])
    })

    test('a file matching nothing is reported, never inserted', async () => {
        write('2026/23. Op New Winter/III/dropped-in-by-hand.png')
        const report = await reconcile(deps([]))

        expect(report.notIndexed).toHaveLength(1)
        expect(report.notIndexed[0]).toMatchObject({
            path: '2026/23. Op New Winter/III/dropped-in-by-hand.png',
            proposedOperation: '23. Op New Winter',
        })
        expect(report.matchedById + report.matchedByPath).toBe(0)
    })

    test('a record whose file is gone is reported, never deleted', async () => {
        const docs: Doc[] = [{ _id: A, storageKey: 'content:Unknown/gone.jpg', caption: 'WOOOOO' }]
        const report = await reconcile(deps(docs))

        expect(report.missingFiles).toEqual([{ id: A.toString(), storageKey: 'content:Unknown/gone.jpg', caption: 'WOOOOO' }])
        // The record survives.
        expect(docs).toHaveLength(1)
        expect(docs[0].storageKey).toBe('content:Unknown/gone.jpg')
    })

    test('a pending item in the flat media tree is not reported missing', async () => {
        const docs: Doc[] = [{ _id: A, storageKey: `media:${A}.jpg`, status: 'pending' }]
        const report = await reconcile(deps(docs))
        // media/ is not the content tree and is not walked; a flat key is out
        // of scope rather than broken.
        expect(report.missingFiles).toEqual([])
    })

    test('a failed transcode is surfaced', async () => {
        const docs: Doc[] = [{ _id: B, status: 'pending', processingError: 'ffmpeg exited 1: unsupported codec' }]
        const report = await reconcile(deps(docs))
        expect(report.failedProcessing).toEqual([{ id: B.toString(), error: 'ffmpeg exited 1: unsupported codec' }])
    })

    test('an id in a filename that matches no record falls through to not-indexed', async () => {
        write(`Unknown/orphan [${A}].jpg`)
        const report = await reconcile(deps([]))
        expect(report.notIndexed).toHaveLength(1)
        expect(report.matchedById).toBe(0)
    })

    test('counts everything it walked', async () => {
        write('2021/4. Op Silent Ridge/I/a.png')
        write('2021/4. Op Silent Ridge/I/b.png')
        write('Unknown/c.png')
        const report = await reconcile(deps([]))
        expect(report.scanned).toBe(3)
        expect(report.at).toBeInstanceOf(Date)
    })

    // A five-year archive must not die on one folder, and a restored backup
    // must not be able to spin the walk forever.
    test('an unreadable directory is counted and the walk continues', async () => {
        write('2021/4. Op Silent Ridge/I/a.png')
        mkdirSync(join(contentDir, '2021', '5. Op Deep'), { recursive: true })

        // Nothing portable makes a directory unreadable on both Windows and
        // Linux, so the same failure is provoked by handing reconcile a
        // contentDir that does not exist at all: readdirSync throws, and the
        // report has to come back rather than the error.
        const gone = await reconcile({ ...deps([]), contentDir: join(root, 'no-such-tree') })
        expect(gone.unreadable).toBe(1)
        expect(gone.scanned).toBe(0)

        const ok = await reconcile(deps([]))
        expect(ok.unreadable).toBe(0)
        expect(ok.scanned).toBe(1)
    })

    // The tree is at most year/operation/mission deep. Anything below that is
    // not addressable by a storageKey, so it is skipped rather than indexed.
    /* Final review, minor: a media file loose at the ROOT of content/ is a
       one-segment path, which parseContentPath refuses — and the walk used to
       `continue` on that BEFORE counting it, so the file was not scanned, not
       notIndexed and not unreadable. Invisible. For a feature whose premise is
       "reorganise this by hand", a misplaced file the report never mentions is
       the one thing it must not do. */
    test('a media file loose at the root of content/ is reported, not silently skipped', async () => {
        writeFileSync(join(contentDir, 'dropped-in-the-wrong-place.png'), 'BYTES')
        const report = await reconcile(deps([]))

        expect(report.scanned).toBe(1)
        expect(report.unreadable).toBe(0)
        expect(report.notIndexed).toEqual([
            { path: 'dropped-in-the-wrong-place.png', bytes: 5, proposedOperation: null },
        ])
    })

    test('does not descend past the mission level', async () => {
        write('2021/4. Op Silent Ridge/I/deeper/x.png')
        const report = await reconcile(deps([]))
        expect(report.scanned).toBe(0)
        expect(report.notIndexed).toEqual([])
    })

    /* Final review, important 5. scripts/index-gallery.mjs matches a folder to
       an operation on a full key and then a parenthetical-stripped one;
       reconcile knew only the full key. So the migration linked
       "9. Op Copper Ridge (Lanze Verde)" — a real folder — to "OPERATION
       Copper Ridge" through the stripped key, and then a file dragged by hand
       into that same folder found no candidate here and reconcile UNSET the
       operationId the migration had just established. */
    test('a folder carrying a parenthetical the operation title lacks still resolves', async () => {
        const name = `Koda — Danger close [${A}].jpg`
        write(`2021/9. Op Copper Ridge (Lanze Verde)/${name}`)

        const docs: Doc[] = [{ _id: A, storageKey: `content:Unknown/${name}` }]
        const ops: Doc[] = [{ _id: OP_ID, title: 'OPERATION Copper Ridge — Sat', date: new Date('2021-05-15T09:00:00Z') }]

        const report = await reconcile(deps(docs, ops))

        expect(report.relocated).toHaveLength(1)
        expect(docs[0].operationId).toEqual(OP_ID)
        expect(docs[0].takenAt).toEqual(new Date('2021-05-15T09:00:00Z'))
    })

    test('the MW Training (CAG) folder resolves to an operation titled MW Training', async () => {
        const name = `Koda — Range day [${A}].jpg`
        write(`2021/12. MW Training (CAG)/${name}`)

        const docs: Doc[] = [{ _id: A, storageKey: `content:Unknown/${name}` }]
        const ops: Doc[] = [{ _id: OP_ID, title: 'MW Training', date: new Date('2021-06-19T09:00:00Z') }]

        await reconcile(deps(docs, ops))
        expect(docs[0].operationId).toEqual(OP_ID)
    })

    /* And the reason the fallback is a second TIER rather than an
       unconditional strip: both folders are real and unrelated, so each must
       keep its own operation. Stripping in normalizeKey, or trying the loose
       key first, collapses them onto whichever sorted earliest. */
    test('a parenthetical folder and its plain namesake keep separate operations', async () => {
        const parenthetical = `Koda — Night [${A}].jpg`
        const plain = `Koda — Day [${B}].jpg`
        write(`2021/9. Op Copper Ridge (Lanze Verde)/${parenthetical}`)
        write(`2021/10. Op Copper Ridge/${plain}`)

        const LANZE = new ObjectId('6a8000000000000000000002')
        const docs: Doc[] = [
            { _id: A, storageKey: `content:Unknown/${parenthetical}` },
            { _id: B, storageKey: `content:Unknown/${plain}` },
        ]
        const ops: Doc[] = [
            { _id: LANZE, title: 'OPERATION Copper Ridge (Lanze Verde) — Sat', date: new Date('2021-05-15T09:00:00Z') },
            { _id: OP_ID, title: 'OPERATION Copper Ridge — Sat', date: new Date('2021-09-04T09:00:00Z') },
        ]

        await reconcile(deps(docs, ops))

        expect(docs[0].operationId).toEqual(LANZE)
        expect(docs[1].operationId).toEqual(OP_ID)
    })
})
