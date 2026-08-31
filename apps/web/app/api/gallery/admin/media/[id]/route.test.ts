import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { RelocateDeps } from '@/lib/gallery/relocate'
import { MAX_FEATURED } from '@/lib/gallery/featured'

/**
 * Reassigning an operation on an item with no bytes — and the narrower sibling
 * of the same defect, an item whose bytes are gone.
 *
 * This route guards its relocateMedia call on `source === 'upload' &&
 * storageKey`, correctly, because relocateMedia has no file to move otherwise
 * — but nothing then derived the facets that hang off the operation, so an
 * embed came out of the PATCH with `operationId` naming the new operation and
 * `year`/`operation`/`opLabel`/`takenAt` still naming the old one. The public
 * facet rail groups on `operation`, so the item never moved as far as anyone
 * looking at the gallery was concerned, and reconcile could not report it:
 * rule 4 only inspects documents whose storageKey starts with
 * `content:`/`legacy:`, and an embed has no storageKey at all.
 *
 * A `storageKey` being present is not proof its bytes exist — an upload the
 * Health view lists under missingFiles has one and no file, and this suite's
 * UPLOAD_ID fixture (deliberately, see below) creates none either. The same
 * fix covers both: relocateMedia returning null means "nothing to move," not
 * "nothing to write," and the route falls back to operationFacets() for the
 * four fields exactly as the embed branch does.
 *
 * The operation fixture is UNDATED on purpose: operationFacets resolves an
 * undated operation without listing any directory, so this suite never reads
 * the developer's real storage/gallery tree, which the route gives no way to
 * point elsewhere.
 */

type Doc = Record<string, unknown>

/** `vi.hoisted`, because vi.mock's factory is hoisted above every other
 *  statement in the file and may only reach state hoisted with it. */
const state = vi.hoisted((): { docs: Record<string, Doc>, operations: Doc[], users: Doc[] } => ({ docs: {}, operations: [], users: [] }))

/* Hoisted with the state for the same reason: the mongo mock's factory calls
   these, and a plain function declaration below would not exist yet when it
   runs. `typeof === 'number'` rather than a cast — a Doc's fields are unknown,
   and "is this document in the featured rail" is exactly the question the
   route's own `featuredOrder !== undefined` asks. */
const { featuredDocs, orderOf } = vi.hoisted(() => ({
    featuredDocs: () => Object.values(state.docs).filter(d => typeof d.featuredOrder === 'number'),
    orderOf: (d: Doc) => typeof d.featuredOrder === 'number' ? d.featuredOrder : -1,
}))

vi.mock('@/lib/mongo', () => ({
    default: {
        galleryMedia: {
            /* Two shapes of read, because the route makes two. The first is
               the document being edited, by _id. The second is the featured
               rail's current highest `featuredOrder`, which arrives as
               `{ featuredOrder: { $exists: true } }` with a descending sort —
               a mock that only understood _id would answer that with null and
               every append would silently land on 0, on top of whatever is
               already there. */
            async findOne(
                filter: { _id?: ObjectId, featuredOrder?: { $exists: boolean } },
                options?: { sort?: { featuredOrder?: number } },
            ) {
                if (filter._id) return state.docs[filter._id.toString()] ?? null

                const direction = options?.sort?.featuredOrder === -1 ? -1 : 1
                const ordered = featuredDocs().sort((a, b) => direction * (orderOf(a) - orderOf(b)))
                return ordered[0] ?? null
            },
            async countDocuments() {
                // The only countDocuments this route makes is the rail's size.
                return featuredDocs().length
            },
            async updateOne(filter: { _id: ObjectId }, update: { $set?: Doc, $unset?: Record<string, ''> }) {
                const doc = state.docs[filter._id.toString()]
                if (!doc) return {}
                Object.assign(doc, update.$set ?? {})
                for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
                return {}
            },
        },
        operations: {
            async findOne(filter: { _id: ObjectId }) {
                return state.operations.find(o => o._id instanceof ObjectId && o._id.equals(filter._id)) ?? null
            },
        },
        users: {
            // Matched on `id` — the Discord id (or, for a skeleton account, the
            // ObjectId string standing in for one), which is what
            // gallery_media.authorId holds. Never on _id.
            async findOne(filter: { id: string }) {
                return state.users.find(u => u.id === filter.id) ?? null
            },
        },
    },
}))
vi.mock('@/lib/discord', () => ({
    default: { fetchMe: async () => ({ id: '1', username: 'manager', globalName: null, guild: null }) },
}))
vi.mock('@/lib/orbat/hasPermission', () => ({ hasPermission: async () => true }))
vi.mock('@/lib/logAction', () => ({ logAction: async () => {} }))

/**
 * A throwaway content tree, so one test can exercise the branch the rest of
 * the suite deliberately cannot: relocateMedia actually finding a file and
 * moving it.
 *
 * The route calls relocateMedia with the real roots and offers no way to point
 * them elsewhere, so the module is mocked to pass the fixture roots through —
 * but to the REAL implementation. Nothing about relocateMedia's behaviour is
 * faked; a test that faked it could not have caught the defect below, which
 * lives in the interaction between the route's guard and what relocateMedia
 * does with a document that has no operationId. Everything else the module
 * exports stays original — operationFacets imports resolveOperationFolder from
 * here, and it must keep resolving for the tests above.
 *
 * `vi.hoisted`, because the mock factory is hoisted with it; `await import`
 * inside it, because top-level import bindings are not initialised yet at the
 * point hoisted code runs.
 */
const fixture = await vi.hoisted(async () => {
    const { mkdtempSync } = await import('fs')
    const { join: j } = await import('path')
    const { tmpdir } = await import('os')
    const root = mkdtempSync(j(tmpdir(), 'asot-media-route-'))
    return { root, contentDir: j(root, 'content'), mediaDir: j(root, 'media') }
})

vi.mock('@/lib/gallery/relocate', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/gallery/relocate')>()
    return {
        ...actual,
        relocateMedia: (deps: RelocateDeps, id: ObjectId) =>
            actual.relocateMedia({ ...deps, contentDir: fixture.contentDir, mediaDir: fixture.mediaDir }, id),
    }
})

afterAll(() => rmSync(fixture.root, { recursive: true, force: true }))

const { PATCH } = await import('./route')

const OP_ID = new ObjectId('6a8000000000000000000001')
const EMBED_ID = new ObjectId('6a9380f11c4e5d2a77b31001')
const UPLOAD_ID = new ObjectId('6a9380f11c4e5d2a77b31002')
/** The migration's own output: an upload in the content tree whose folder
 *  matched no operation record, so it carries a folder-derived operation,
 *  mission, year and date and NO operationId (scripts/index-gallery.mjs). */
const LEGACY_ID = new ObjectId('6a9380f11c4e5d2a77b31003')
const LEGACY_SEGMENTS = ['2023', '5. Op Atlantic Shield', 'I', 'photo-042.jpg']
const LEGACY_KEY = `content:${LEGACY_SEGMENTS.join('/')}`
const LEGACY_TAKEN_AT = new Date('2023-01-01T00:00:00Z')

function patch(id: ObjectId, body: unknown) {
    return PATCH(
        new NextRequest(`http://localhost/api/gallery/admin/media/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: id.toString() }) },
    )
}

const MEMBER_ID = '2288100000000000001'
const SKELETON_ID = '6a8000000000000000000042'

beforeEach(() => {
    state.users.length = 0
    state.users.push(
        { id: MEMBER_ID, globalName: 'nine', username: 'nine_au', guild: { displayName: 'CPL Nine' } },
        // No `guild` at all: the fallback chain has to reach globalName, which
        // is the shape a CSV-imported member is stored in.
        { id: SKELETON_ID, isSkeletonAccount: true, globalName: 'PVT Archive', username: 'pvt_archive' },
    )

    state.operations.length = 0
    state.operations.push({ _id: OP_ID, title: 'OPERATION Undated' })

    for (const key of Object.keys(state.docs)) delete state.docs[key]
    state.docs[EMBED_ID.toString()] = {
        _id: EMBED_ID,
        source: 'youtube',
        operation: '3. Op Somewhere Else',
        opLabel: 'Op Somewhere Else',
        year: '2019',
        takenAt: new Date('2019-04-06T09:00:00Z'),
    }
    state.docs[UPLOAD_ID.toString()] = {
        _id: UPLOAD_ID,
        source: 'upload',
        storageKey: `media:${UPLOAD_ID}.jpg`,
        operation: '3. Op Somewhere Else',
        opLabel: 'Op Somewhere Else',
        year: '2019',
    }
    state.docs[LEGACY_ID.toString()] = {
        _id: LEGACY_ID,
        source: 'upload',
        storageKey: LEGACY_KEY,
        operation: '5. Op Atlantic Shield',
        opLabel: 'Op Atlantic Shield',
        mission: 'I',
        year: '2023',
        takenAt: LEGACY_TAKEN_AT,
    }

    // Real bytes for LEGACY_ID, in the fixture tree — this is the one document
    // in the suite whose file relocateMedia can actually find and move.
    rmSync(fixture.contentDir, { recursive: true, force: true })
    mkdirSync(join(fixture.contentDir, ...LEGACY_SEGMENTS.slice(0, -1)), { recursive: true })
    writeFileSync(join(fixture.contentDir, ...LEGACY_SEGMENTS), 'bytes')
})

describe('PATCH — reassigning the operation', () => {
    test('an embed gets every facet the operation decides, not just the id', async () => {
        const res = await patch(EMBED_ID, { operationId: OP_ID.toString() })
        expect(res.status).toBe(200)

        const doc = state.docs[EMBED_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect(doc.takenAt).toBeNull()
        expect('year' in doc).toBe(false)
    })

    test('clearing an embed’s operation clears the facets with it', async () => {
        state.docs[EMBED_ID.toString()].operationId = OP_ID

        await patch(EMBED_ID, { operationId: null })

        const doc = state.docs[EMBED_ID.toString()]
        expect('operationId' in doc).toBe(false)
        expect('operation' in doc).toBe(false)
        expect('opLabel' in doc).toBe(false)
        expect('year' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
    })

    /* The narrower sibling of the embed defect above: `doc.storageKey` being
       present is not proof the bytes behind it still exist. This fixture never
       creates a file for UPLOAD_ID (matching this suite's design of never
       touching the real storage/gallery tree — see the file header), so
       relocateMedia finds nothing to move and returns null without writing
       anything, exactly as it would for an upload the Health view lists under
       missingFiles. The route used to leave it there: operationId pointed at
       the new operation while year/operation/opLabel/takenAt still named the
       one it was reassigned away from. */
    test('an upload whose file is missing still gets the new operation\'s facets, not just its id', async () => {
        await patch(UPLOAD_ID, { operationId: OP_ID.toString() })

        const doc = state.docs[UPLOAD_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect(doc.takenAt).toBeNull()
        expect('year' in doc).toBe(false)
        // storageKey is untouched — relocateMedia's contract is to never point
        // a record at a path with no bytes behind it, even on this fallback.
        expect(doc.storageKey).toBe(`media:${UPLOAD_ID}.jpg`)
    })

    /* relocateMedia is still the sole writer when it actually succeeds — this
       suite cannot create the real file relocateMedia needs to exercise that
       branch (see the file header), but it can pin that the fallback above
       only fires when relocateMedia genuinely had nothing to do, not on every
       upload reassignment: a no-op caption-only edit must not touch the
       operation facets at all. */
    test('an upload edited without an operation change does not touch its facets', async () => {
        await patch(UPLOAD_ID, { caption: 'Renamed' })

        const doc = state.docs[UPLOAD_ID.toString()]
        expect(doc.operation).toBe('3. Op Somewhere Else')
        expect(doc.opLabel).toBe('Op Somewhere Else')
        expect(doc.year).toBe('2019')
    })

    /* The same claim as the test above, made against the fixture that can
       actually disprove it. UPLOAD_ID's file does not exist, so relocateMedia
       bails before the move and that test passes whether or not the route
       guards the call; and UPLOAD_ID carries an operationId, so it is not the
       shape at risk anyway.

       LEGACY_ID is the shape at risk, and roughly 1,157 rows of the migrated
       archive have it: bytes on disk, a folder-derived operation/mission/year/
       date, and no operationId. relocateMedia resolves an absent operationId
       to Unknown/ — it moves the bytes there, unsets operation, opLabel, year
       and mission and nulls takenAt — so letting a caption edit reach it
       destroys every field the folder gave the item, silently and with no
       undo. Nothing in the request asked for the operation to change, so
       nothing about the operation may change. */
    test('a caption edit on an unlinked archive item leaves its folder-derived facets and its file alone', async () => {
        const res = await patch(LEGACY_ID, { caption: 'Dawn patrol', authorName: 'Trooper Nine' })
        expect(res.status).toBe(200)

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.caption).toBe('Dawn patrol')
        expect(doc.authorName).toBe('Trooper Nine')

        expect(doc.operation).toBe('5. Op Atlantic Shield')
        expect(doc.opLabel).toBe('Op Atlantic Shield')
        expect(doc.mission).toBe('I')
        expect(doc.year).toBe('2023')
        expect(doc.takenAt).toEqual(LEGACY_TAKEN_AT)
        expect(doc.storageKey).toBe(LEGACY_KEY)
        expect('operationId' in doc).toBe(false)

        // And the bytes are still where the document says they are.
        expect(existsSync(join(fixture.contentDir, ...LEGACY_SEGMENTS))).toBe(true)
        expect(existsSync(join(fixture.contentDir, 'Unknown'))).toBe(false)
    })

    /* The other direction, which must keep working: an unlinked item whose
       operation the reviewer DOES change is relocated, because the request
       asked for it. Here that means clearing it on purpose — the Inspector's
       "Unknown" option — which is the one path allowed to discard the folder
       name. */
    test('deliberately clearing an unlinked item’s operation still relocates it', async () => {
        const res = await patch(LEGACY_ID, { operationId: 'unknown' })
        expect(res.status).toBe(200)

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.storageKey).not.toBe(LEGACY_KEY)
        expect(String(doc.storageKey).startsWith('content:Unknown/')).toBe(true)
        expect('operation' in doc).toBe(false)
        expect('opLabel' in doc).toBe(false)
        expect('year' in doc).toBe(false)
        expect('mission' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
        expect(existsSync(join(fixture.contentDir, ...LEGACY_SEGMENTS))).toBe(false)
    })

    /* And linking one to a real operation moves it into that operation's
       folder rather than leaving it where the migration put it. The fixture
       operation is undated, so the destination is Unknown/ by
       resolveOperationFolder's own rule — what this pins is that the id is
       written and the bytes actually moved, not that the guard swallowed the
       request. */
    test('linking an unlinked item to a real operation still relocates it', async () => {
        const res = await patch(LEGACY_ID, { operationId: OP_ID.toString() })
        expect(res.status).toBe(200)

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.operationId).toEqual(OP_ID)
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect(doc.storageKey).not.toBe(LEGACY_KEY)
        expect(existsSync(join(fixture.contentDir, ...LEGACY_SEGMENTS))).toBe(false)
    })

    test('an operation that does not exist is rejected, and nothing is written', async () => {
        const res = await patch(EMBED_ID, { operationId: new ObjectId().toString() })

        expect(res.status).toBe(400)
        expect(state.docs[EMBED_ID.toString()].operation).toBe('3. Op Somewhere Else')
        expect('operationId' in state.docs[EMBED_ID.toString()]).toBe(false)
    })
})

/**
 * The author pair.
 *
 * `gallery_media` has always carried `authorId` AND `authorName`, and
 * submissions set both — but this route only ever wrote the name. That is not
 * a missing feature. `authorId` is what grants the original submitter access
 * to their own unpublished bytes (`api/gallery/media/[id]`, `.../poster`) and
 * what the accept/reject notification is addressed to
 * (`api/gallery/submissions/[id]`), so a reviewer correcting the credit on a
 * submitted photo produced a document naming one member and pointing at
 * another: the wrong person kept the access and would have kept the
 * notifications, and nothing anywhere said so.
 *
 * Every test below asserts on BOTH fields, because a fix that gets one right
 * and leaves the other is the defect.
 */
describe('PATCH — the author pair', () => {
    test('linking a member writes both fields, and takes the name from the user record', async () => {
        const res = await patch(LEGACY_ID, { authorId: MEMBER_ID, authorName: 'Whatever The Browser Had Cached' })
        expect(res.status).toBe(200)

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.authorId).toBe(MEMBER_ID)
        // Not the string the client sent. A member renamed since the credit was
        // written must be recorded under the name the roster has now, and a
        // client is trusted to say WHICH member, never what they are called.
        expect(doc.authorName).toBe('CPL Nine')
    })

    test('a skeleton account can be credited — most of the archive was shot by one', async () => {
        await patch(LEGACY_ID, { authorId: SKELETON_ID })

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.authorId).toBe(SKELETON_ID)
        expect(doc.authorName).toBe('PVT Archive')
    })

    /* The bug itself. Before the fix this wrote the name and left `authorId`
       exactly where it was, so the document credited Ghost Recon Dave while
       still granting the original submitter owner access to the file. */
    test('a typed name clears the link, so the two can never disagree', async () => {
        state.docs[LEGACY_ID.toString()].authorId = MEMBER_ID
        state.docs[LEGACY_ID.toString()].authorName = 'CPL Nine'

        const res = await patch(LEGACY_ID, { authorId: null, authorName: 'Ghost Recon Dave' })
        expect(res.status).toBe(200)

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.authorName).toBe('Ghost Recon Dave')
        expect('authorId' in doc).toBe(false)
    })

    test('clearing the author clears both fields, not just the name', async () => {
        state.docs[LEGACY_ID.toString()].authorId = MEMBER_ID
        state.docs[LEGACY_ID.toString()].authorName = 'CPL Nine'

        await patch(LEGACY_ID, { authorId: null, authorName: '' })

        const doc = state.docs[LEGACY_ID.toString()]
        expect('authorId' in doc).toBe(false)
        expect('authorName' in doc).toBe(false)
    })

    /* Rejected rather than quietly falling back to the name beside it: writing
       that name would produce the same split one field further along — a
       credit nobody chose, over an id that no longer resolves. */
    test('an authorId matching no member is rejected, and nothing is written', async () => {
        state.docs[LEGACY_ID.toString()].authorId = MEMBER_ID
        state.docs[LEGACY_ID.toString()].authorName = 'CPL Nine'

        const res = await patch(LEGACY_ID, { authorId: 'not-a-member', authorName: 'Nobody At All' })

        expect(res.status).toBe(400)
        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.authorId).toBe(MEMBER_ID)
        expect(doc.authorName).toBe('CPL Nine')
    })

    /* A regression guard rather than a bug reproduction — the old route also
       left the author alone when the payload never mentioned it. It is here
       because the new resolver has three outcomes and "change nothing" is the
       one an over-eager clear would swallow: an inspector saving a caption
       must not wipe a credit it never asked about. */
    test('an edit that mentions no author leaves an existing credit alone', async () => {
        state.docs[LEGACY_ID.toString()].authorId = MEMBER_ID
        state.docs[LEGACY_ID.toString()].authorName = 'CPL Nine'

        await patch(LEGACY_ID, { caption: 'Dawn patrol' })

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.authorId).toBe(MEMBER_ID)
        expect(doc.authorName).toBe('CPL Nine')
    })
})

/**
 * The featured rail, one item at a time.
 *
 * `featuredOrder` on `gallery_media` is the public rail's entire source of
 * truth, and until this route accepted `featured` the only writer was the
 * Featured tab's whole-list PUT — there was no way to add one photograph
 * without re-sending the other fifty-nine. This owns MEMBERSHIP; that route
 * still owns arrangement, which is why adding appends and re-adding never
 * renumbers.
 *
 * The last test in this block is the one that matters most and looks least
 * like a featured test at all: featuring is a field on the same PATCH that
 * relocates files, and b8d70341 established that only the REQUEST asking for
 * an operation may move an item's bytes. A `featured` flag that leaked into
 * that condition would relocate an unlinked archive photograph to Unknown/ and
 * destroy the operation, mission, year and date its folder gave it — the
 * exact defect a caption edit used to cause, with a new trigger.
 */
describe('PATCH — the featured rail', () => {
    test('featuring the first item starts the rail at 0', async () => {
        const res = await patch(LEGACY_ID, { featured: true })
        expect(res.status).toBe(200)
        expect(state.docs[LEGACY_ID.toString()].featuredOrder).toBe(0)
    })

    test('featuring appends one past the current highest, and touches nothing else', async () => {
        state.docs[EMBED_ID.toString()].featuredOrder = 0
        state.docs[UPLOAD_ID.toString()].featuredOrder = 7

        const res = await patch(LEGACY_ID, { featured: true })
        expect(res.status).toBe(200)

        expect(state.docs[LEGACY_ID.toString()].featuredOrder).toBe(8)
        // The rotation the Featured tab curated is untouched — appending
        // must never renumber the items already in it.
        expect(state.docs[EMBED_ID.toString()].featuredOrder).toBe(0)
        expect(state.docs[UPLOAD_ID.toString()].featuredOrder).toBe(7)
    })

    /* Re-stating a slot rather than appending it again. A stale tab, a double
       click, or a reviewer checking their work sends `featured: true` for an
       item that already is: appending would drag a tile J5 deliberately put at
       the front of the rail all the way to the back. */
    test('re-featuring something already featured keeps its slot', async () => {
        state.docs[EMBED_ID.toString()].featuredOrder = 4
        state.docs[LEGACY_ID.toString()].featuredOrder = 1

        const res = await patch(LEGACY_ID, { featured: true })
        expect(res.status).toBe(200)
        expect(state.docs[LEGACY_ID.toString()].featuredOrder).toBe(1)
    })

    /* $unset, not a sentinel value. The rail's query is
       `featuredOrder: { $exists: true }` (api/gallery/route.ts), so writing -1
       or null would leave the item in the rail with a strange position rather
       than out of it. */
    test('unfeaturing removes the field outright', async () => {
        state.docs[LEGACY_ID.toString()].featuredOrder = 3

        const res = await patch(LEGACY_ID, { featured: false })
        expect(res.status).toBe(200)
        expect('featuredOrder' in state.docs[LEGACY_ID.toString()]).toBe(false)
    })

    /* Nothing is written, so the route's existing "Nothing to change" answer
       is the honest one. The point of the assertion is the second line: an
       unguarded `unset.featuredOrder = ''` would have made this a 200 that
       reported a change to a field the document never had. */
    test('unfeaturing something that was never featured changes nothing', async () => {
        const res = await patch(LEGACY_ID, { featured: false })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'Nothing to change' })
    })

    /* The cap the Featured tab's PUT has always enforced, applied at the point
       an item is added. Without it a reviewer can toggle a sixty-first item in
       and only find out when a drag in the Featured tab is refused, with
       nothing to connect the failure to the toggle that caused it. */
    test('the rail refuses a sixty-first item, and writes nothing', async () => {
        for (let i = 0; i < MAX_FEATURED; i++) {
            const id = new ObjectId()
            state.docs[id.toString()] = { _id: id, source: 'youtube', featuredOrder: i }
        }

        const res = await patch(LEGACY_ID, { featured: true })
        expect(res.status).toBe(400)
        expect(String((await res.json()).error)).toContain(String(MAX_FEATURED))
        expect('featuredOrder' in state.docs[LEGACY_ID.toString()]).toBe(false)
    })

    /* The load-bearing one. LEGACY_ID is the shape at risk — bytes on disk, a
       folder-derived operation/mission/year/date, no operationId — and
       relocateMedia resolves an absent operationId to Unknown/, moving the
       bytes and unsetting every one of those fields. Nothing in this request
       mentions the operation, so nothing about the operation may change. */
    test('featuring an unlinked archive item does not re-file it', async () => {
        const res = await patch(LEGACY_ID, { featured: true })
        expect(res.status).toBe(200)

        const doc = state.docs[LEGACY_ID.toString()]
        expect(doc.featuredOrder).toBe(0)
        expect(doc.operation).toBe('5. Op Atlantic Shield')
        expect(doc.opLabel).toBe('Op Atlantic Shield')
        expect(doc.mission).toBe('I')
        expect(doc.year).toBe('2023')
        expect(doc.takenAt).toEqual(LEGACY_TAKEN_AT)
        expect(doc.storageKey).toBe(LEGACY_KEY)

        // And the bytes never moved.
        expect(existsSync(join(fixture.contentDir, ...LEGACY_SEGMENTS))).toBe(true)
        expect(existsSync(join(fixture.contentDir, 'Unknown'))).toBe(false)
    })
})
