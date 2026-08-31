import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import type { WithId } from 'mongodb'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { operationFacets } from './operation-facets'
import { relocateMedia, type RelocateDeps } from './relocate'

/**
 * The two producers of `year`/`operation`/`opLabel`/`takenAt` must agree.
 *
 * This suite is the merge of two route-level suites that pinned the same
 * property from either side — `resolveOperation()` in
 * app/api/gallery/submissions/route.ts and `operationFields()` in
 * app/api/gallery/submissions/[id]/route.ts. Both used to write
 * `operation`/`opLabel` straight off the operation document (`op.title`),
 * while `relocateMedia` writes the folder name `resolveOperationFolder`
 * resolves to, so one document could carry `"OPERATION Silent Ridge — Sat"`
 * where another carried `"4. Op Silent Ridge"` — one operation rendered as two
 * entries in the public gallery's facet rail.
 *
 * The two near-duplicates are now one function, and it lives in lib/ rather
 * than in a route: a Next.js route file may only export route handlers and the
 * config names `typedRoutes` allows, and exporting these helpers so a test
 * could reach them failed `next build` with "incompatible with index
 * signature" — which `tsc --noEmit`, lint and this suite all passed straight
 * over for several commits.
 *
 * Nothing here is mocked, and nothing connects to anything: operationFacets()
 * takes its collections as a parameter, so a fixture and a throwaway
 * `contentDir` are the whole harness.
 */

const OP_ID = new ObjectId('6a8000000000000000000001')
const UPLOAD_ID = new ObjectId('6a9380f11c4e5d2a77b31099')

let root: string
let contentDir: string
let mediaDir: string

/** `as never`, matching relocate.test.ts's own fixture: WithId<Operation> has
 *  ~20 required fields no test here needs, and this stand-in only ever carries
 *  the two (title, date) both operationFacets() and relocateMedia read. */
function operationsFixture(ops: Record<string, unknown>[]) {
    return {
        async findOne(filter: { _id: ObjectId }) {
            return (ops.find(o => (o._id as ObjectId).equals(filter._id)) ?? null) as never
        },
    }
}

/* J2's campaign organiser. Real OperationCampaign/CampaignMission values
   rather than `as never` — both shapes are small enough to satisfy honestly,
   and satisfying them is what makes the string-vs-ObjectId difference between
   `CampaignMission.campaignId` and `Operation.campaignId` a fact the compiler
   holds this fixture to. Empty by default: most tests here are about an
   operation with no campaign, and an empty organiser is exactly that. */
function campaignFixtures(campaigns: WithId<OperationCampaign>[] = [], missions: WithId<CampaignMission>[] = []) {
    return {
        campaigns: {
            async findOne(filter: { _id: ObjectId }) {
                return campaigns.find(c => c._id.equals(filter._id)) ?? null
            },
        },
        campaignMissions: {
            async findOne(filter: { _id: ObjectId }) {
                return missions.find(m => m._id.equals(filter._id)) ?? null
            },
        },
    }
}

/** operationFacets() never calls deps.media — resolveOperationFolder() only
 *  reads deps.operations, deps.campaigns/campaignMissions and deps.contentDir
 *  — but RelocateDeps requires `media` structurally, so a stand-in that is
 *  never invoked is supplied. */
function deps(
    ops: Record<string, unknown>[],
    campaigns: WithId<OperationCampaign>[] = [],
    missions: WithId<CampaignMission>[] = [],
): RelocateDeps {
    return {
        contentDir,
        media: {
            async findOne() { return null },
            async updateOne() { return {} },
        },
        operations: operationsFixture(ops),
        ...campaignFixtures(campaigns, missions),
    }
}

/** A minimal stand-in for the media collection relocateMedia touches,
 *  mirroring relocate.test.ts's own deps(). */
function mediaFixture(docs: Record<string, Record<string, unknown>>) {
    return {
        async findOne(filter: { _id: ObjectId }) {
            return (docs[filter._id.toString()] ?? null) as never
        },
        async updateOne(filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>, $unset?: Record<string, ''> }) {
            const doc = docs[filter._id.toString()]
            Object.assign(doc, update.$set ?? {})
            for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
            return {}
        },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-operation-facets-'))
    contentDir = join(root, 'content')
    mediaDir = join(root, 'media')
    mkdirSync(contentDir, { recursive: true })
    mkdirSync(mediaDir, { recursive: true })
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('operationFacets', () => {
    test('writes the folder name to operation/opLabel, not the raw operation title', async () => {
        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })
        const ops = [{ _id: OP_ID, title: 'OPERATION Silent Ridge — Sat', date: new Date('2021-08-14T09:00:00Z') }]

        const fields = await operationFacets(deps(ops), OP_ID.toString())

        // Exactly what relocateMedia (lib/gallery/relocate.test.ts, "moves
        // the file, renames it, and updates the document") writes for the
        // same operation — the whole point of the fix.
        expect(fields?.$set.operation).toBe('4. Op Silent Ridge')
        expect(fields?.$set.opLabel).toBe('Op Silent Ridge')
        expect(fields?.$set.year).toBe('2021')
    })

    test('mints an unnumbered folder name when no existing folder matches, same as relocateMedia', async () => {
        mkdirSync(join(contentDir, '2021', '7. Op Copper Ridge'), { recursive: true })
        const ops = [{ _id: OP_ID, title: 'OPERATION Brand New — Sun', date: new Date('2021-11-02T09:00:00Z') }]

        const fields = await operationFacets(deps(ops), OP_ID.toString())

        expect(fields?.$set.operation).toBe('Op Brand New')
        expect(fields?.$set.opLabel).toBe('Op Brand New')
    })

    // Matches relocateMedia's own undated branch (relocate.test.ts, "an
    // operation with no date cannot be placed in a year, but the operation
    // itself is kept") — no folder to check against without a date, so the
    // raw title is what both functions fall back to.
    test('an undated operation keeps the raw title and unsets year', async () => {
        const ops = [{ _id: OP_ID, title: 'OPERATION Undated' }]

        const fields = await operationFacets(deps(ops), OP_ID.toString())

        expect(fields?.$set.operation).toBe('OPERATION Undated')
        expect(fields?.$set.opLabel).toBe('OPERATION Undated')
        expect(fields?.$unset).toEqual({ campaign: '', year: '' })
    })

    test('"unknown" clears operationId, operation, opLabel and year, and nulls takenAt', async () => {
        const fields = await operationFacets(deps([]), 'unknown')

        expect(fields?.$unset).toEqual({ operationId: '', campaign: '', operation: '', opLabel: '', year: '' })
        expect(fields?.$set).toEqual({ takenAt: null })
    })

    test('a null operationId is treated the same as "unknown"', async () => {
        const fields = await operationFacets(deps([]), null)

        expect(fields?.$unset).toEqual({ operationId: '', campaign: '', operation: '', opLabel: '', year: '' })
    })

    test('an invalid ObjectId string is rejected', async () => {
        expect(await operationFacets(deps([]), 'not-an-id')).toBeNull()
    })

    test('an operation id that matches no document is rejected', async () => {
        expect(await operationFacets(deps([]), OP_ID.toString())).toBeNull()
    })

    /* All four facets in one update, never `operationId` on its own. An embed
       has no bytes, so relocateMedia returns early for it and nothing else
       ever revisits these fields: an update carrying only the id would leave
       `operation`/`opLabel`/`year`/`takenAt` naming the OLD operation while
       `operationId` named the new one, and reconcile is structurally blind to
       it (rule 4 needs a content: storageKey an embed never has). That is the
       reassignment defect this function exists to close. */
    test('a reassignment carries every field that hangs off the operation, not just the id', async () => {
        mkdirSync(join(contentDir, '2022', '2. Op New Home'), { recursive: true })
        const ops = [{ _id: OP_ID, title: 'OPERATION New Home — Sat', date: new Date('2022-03-05T09:00:00Z') }]

        const fields = await operationFacets(deps(ops), OP_ID.toString())

        expect(fields?.$set).toEqual({
            operationId: OP_ID,
            operation: '2. Op New Home',
            opLabel: 'Op New Home',
            year: '2022',
            takenAt: new Date('2022-03-05T09:00:00Z'),
        })
    })

    /* An embed reassigned to a campaign mission has to land in the same rail
       row as a photograph from that mission — it is the same operation, and
       nothing else will ever revisit an embed's facets. */
    test('a campaign mission fills campaign and the day, and moving out of the campaign clears it', async () => {
        const CAMPAIGN_ID = new ObjectId('6a8000000000000000000010')
        const MISSION_ID = new ObjectId('6a8000000000000000000011')
        const campaigns: WithId<OperationCampaign>[] = [{
            _id: CAMPAIGN_ID, name: 'Operation Trinity', createdBy: 'seed', createdAt: '2026-01-01T00:00:00.000Z', isDeleted: false,
        }]
        const missions: WithId<CampaignMission>[] = [{
            _id: MISSION_ID, campaignId: CAMPAIGN_ID.toHexString(), name: 'Operation Trinity I',
            sequence: 1, createdAt: new Date('2026-01-01T00:00:00.000Z'), isDeleted: false,
        }]
        const ops = [{
            _id: OP_ID,
            title: 'OPERATION Trinity I — Sat',
            date: new Date('2026-05-16T09:00:00Z'),
            campaignId: CAMPAIGN_ID,
            campaignMissionId: MISSION_ID.toHexString(),
            daySlot: 'saturday',
        }]

        const fields = await operationFacets(deps(ops, campaigns, missions), OP_ID.toString())

        expect(fields?.$set).toEqual({
            operationId: OP_ID,
            campaign: 'Op Trinity',
            operation: 'Operation Trinity I',
            opLabel: 'Operation Trinity I',
            mission: 'Saturday',
            year: '2026',
            takenAt: new Date('2026-05-16T09:00:00Z'),
        })
        expect(fields?.$unset).toBeUndefined()

        /* The same operation with the campaign organiser empty — a deleted
           campaign, from this function's point of view. `campaign` has to be
           UNSET, not merely omitted: an embed carrying a campaign whose folder
           it is no longer in sits in a rail row nothing agrees with, and
           reconcile cannot see an embed at all. */
        const cleared = await operationFacets(deps(ops), OP_ID.toString())
        expect(cleared?.$unset).toEqual({ campaign: '' })
        expect(cleared?.$set.operation).toBe('Op Trinity I')
        expect(cleared?.$set.mission).toBe('Saturday')
    })

    /* An operation whose campaign is known but whose CampaignMission record
       does not exist yet — J2's board infers those from titles until someone
       presses Auto-group, so it is the state most campaigns are in. The embed
       has to land in the row a photograph from the same operation lands in,
       and relocateMedia files that photograph at
       `2026/1. Op Trinity/Saturday/…` with NO campaign facet, so this must
       clear `campaign` and put the campaign's folder name in `operation`. */
    test('a campaign operation with no mission record fills operation from the campaign and clears the campaign facet', async () => {
        const CAMPAIGN_ID = new ObjectId('6a8000000000000000000010')
        const campaigns: WithId<OperationCampaign>[] = [{
            _id: CAMPAIGN_ID, name: 'Operation Trinity', createdBy: 'seed', createdAt: '2026-01-01T00:00:00.000Z', isDeleted: false,
        }]
        const ops = [{
            _id: OP_ID,
            title: 'OPERATION Trinity I — Sat',
            date: new Date('2026-05-16T09:00:00Z'),
            campaignId: CAMPAIGN_ID,
            daySlot: 'saturday',
        }]

        const fields = await operationFacets(deps(ops, campaigns, []), OP_ID.toString())

        expect(fields?.$set).toEqual({
            operationId: OP_ID,
            operation: 'Op Trinity',
            opLabel: 'Op Trinity',
            mission: 'Saturday',
            year: '2026',
            takenAt: new Date('2026-05-16T09:00:00Z'),
        })
        // Unset, not merely omitted: an embed reassigned out of a campaign
        // mission and into this state would otherwise keep pointing at a
        // campaign folder its bytes are no longer under, and nothing else
        // revisits an embed's facets.
        expect(fields?.$unset).toEqual({ campaign: '' })
    })

    /* The one field this function is allowed to differ from relocateMedia on.
       It has an operation id and no media document, so it cannot tell a legacy
       archive item's mission folder from a stale day — and the caller that
       applies it to an item WITH bytes is the missing-bytes fallback in
       app/api/gallery/admin/media/[id]/route.ts, whose item is exactly the
       migrated archive item whose folder-derived mission is its provenance. */
    test('an operation with no day slot leaves mission completely alone — neither set nor unset', async () => {
        const ops = [{ _id: OP_ID, title: 'OPERATION No Slot — Sat', date: new Date('2026-03-07T09:00:00Z') }]

        const fields = await operationFacets(deps(ops), OP_ID.toString())

        expect(fields?.$set.mission).toBeUndefined()
        // Object.keys rather than `$unset.mission`: the field is not in
        // OperationFacetUpdate's $unset key union at all, which is the
        // type-level half of the same guarantee.
        expect(Object.keys(fields?.$unset ?? {})).not.toContain('mission')
    })
})

describe('operationFacets agrees with relocateMedia', () => {
    test('an accepted embed and an accepted upload from the same operation end up with the same operation and opLabel', async () => {
        const ops = [{ _id: OP_ID, title: 'OPERATION Silent Ridge — Sat', date: new Date('2021-08-14T09:00:00Z') }]

        // The embed: operationFacets() is the ONLY writer that will ever touch
        // its operation/opLabel — relocateMedia skips embeds entirely (they
        // have no storageKey), so nothing corrects this later.
        const embedFields = await operationFacets(deps(ops), OP_ID.toString())

        // The upload: relocateMedia is the writer, run against the same disk
        // state (no folder exists yet for this operation either way) —
        // exactly what happens in production when a reviewer accepts the
        // photo without ever having accepted the embed first.
        writeFileSync(join(mediaDir, `${UPLOAD_ID}.jpg`), 'BYTES')
        const docs = {
            [UPLOAD_ID.toString()]: {
                _id: UPLOAD_ID,
                storageKey: `media:${UPLOAD_ID}.jpg`,
                authorName: 'Koda',
                operationId: OP_ID,
            } as Record<string, unknown>,
        }
        await relocateMedia(
            { contentDir, mediaDir, media: mediaFixture(docs), operations: operationsFixture(ops), ...campaignFixtures() },
            UPLOAD_ID,
        )
        const uploadDoc = docs[UPLOAD_ID.toString()]

        expect(embedFields?.$set.operation).toBe(uploadDoc.operation)
        expect(embedFields?.$set.opLabel).toBe(uploadDoc.opLabel)
        expect(embedFields?.$set.year).toBe(uploadDoc.year)
        expect(embedFields?.$set.takenAt).toEqual(uploadDoc.takenAt)
        expect(embedFields?.$set.operation).toBe('Op Silent Ridge')
        expect(embedFields?.$set.opLabel).toBe('Op Silent Ridge')
    })

    test('an operation with no date: still agrees, both keep the raw title and no year', async () => {
        const ops = [{ _id: OP_ID, title: 'OPERATION Undated' }]

        const embedFields = await operationFacets(deps(ops), OP_ID.toString())

        writeFileSync(join(mediaDir, `${UPLOAD_ID}.jpg`), 'BYTES')
        const docs = {
            [UPLOAD_ID.toString()]: {
                _id: UPLOAD_ID,
                storageKey: `media:${UPLOAD_ID}.jpg`,
                authorName: 'Koda',
                operationId: OP_ID,
            } as Record<string, unknown>,
        }
        await relocateMedia(
            { contentDir, mediaDir, media: mediaFixture(docs), operations: operationsFixture(ops), ...campaignFixtures() },
            UPLOAD_ID,
        )
        const uploadDoc = docs[UPLOAD_ID.toString()]

        expect(embedFields?.$set.operation).toBe('OPERATION Undated')
        expect(embedFields?.$set.operation).toBe(uploadDoc.operation)
        expect(embedFields?.$set.opLabel).toBe(uploadDoc.opLabel)
        // Both spell "no year" the same way: the key is absent, never `''`.
        expect(embedFields?.$set.year).toBeUndefined()
        expect(embedFields?.$unset).toEqual({ campaign: '', year: '' })
        expect('year' in uploadDoc).toBe(false)
    })
})
