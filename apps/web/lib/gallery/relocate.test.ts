import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import type { WithId } from 'mongodb'
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { relocateMedia, resolveOperationFolder, operationYear, type RelocateDeps } from './relocate'

const OP_ID = new ObjectId('6a8000000000000000000001')
const MEDIA_ID = new ObjectId('6a9380f11c4e5d2a77b31099')
const CAMPAIGN_ID = new ObjectId('6a8000000000000000000010')
const MISSION_ID = new ObjectId('6a8000000000000000000011')

let contentDir: string
let root: string

/* The campaign fixtures are built as REAL OperationCampaign/CampaignMission
   values rather than through the `as never` the operations fixture needs.
   Both shapes are small enough to satisfy honestly, and doing so is what makes
   `campaignId` being a string on the mission and an ObjectId on the operation
   a fact the compiler checks here rather than something the test asserts about
   its own invention. */
function campaignDoc(name: string, opts: { id?: ObjectId, isDeleted?: boolean } = {}): WithId<OperationCampaign> {
    return {
        _id: opts.id ?? CAMPAIGN_ID,
        name,
        createdBy: 'seed',
        createdAt: '2026-01-01T00:00:00.000Z',
        isDeleted: opts.isDeleted ?? false,
    }
}

function missionDoc(id: ObjectId, name: string, opts: { campaignId?: ObjectId, sequence?: number, isDeleted?: boolean } = {}): WithId<CampaignMission> {
    return {
        _id: id,
        campaignId: (opts.campaignId ?? CAMPAIGN_ID).toHexString(),
        name,
        sequence: opts.sequence ?? 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        isDeleted: opts.isDeleted ?? false,
    }
}

/** An operation inside a campaign, as J2's organiser writes one. */
function campaignOp(id: ObjectId, title: string, missionId: ObjectId, daySlot: 'saturday' | 'sunday' | null, date = '2026-05-16T09:00:00Z'): Record<string, unknown> {
    return {
        _id: id,
        title,
        date: new Date(date),
        campaignId: CAMPAIGN_ID,
        campaignMissionId: missionId.toHexString(),
        ...(daySlot ? { daySlot } : {}),
    }
}

/* An operation J2's board DISPLAYS inside a campaign mission but that carries
   no CampaignMission link — `campaignId` and nothing else. The board's second
   pass in lib/operations/board.ts infers the mission from the TITLE into a
   synthetic `t:{stripped}` entry, and a real CampaignMission document is only
   written when someone presses the organiser's "Auto-group" button, so this is
   the state every campaign is in until that happens. The user's "Operation
   Trinity" sat here with six operations. */
function campaignOnlyOp(id: ObjectId, title: string, daySlot: 'saturday' | 'sunday' | null, date = '2026-05-16T09:00:00Z'): Record<string, unknown> {
    return {
        _id: id,
        title,
        date: new Date(date),
        campaignId: CAMPAIGN_ID,
        ...(daySlot ? { daySlot } : {}),
    }
}

/** A minimal stand-in for the four collections relocate touches. */
function deps(
    docs: Record<string, Record<string, unknown>>,
    ops: Record<string, unknown>[],
    campaigns: WithId<OperationCampaign>[] = [],
    missions: WithId<CampaignMission>[] = [],
): RelocateDeps & { docs: typeof docs } {
    return {
        docs,
        contentDir,
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
        media: {
            async findOne(filter: { _id: ObjectId }) {
                return (docs[filter._id.toString()] ?? null) as never
            },
            async updateOne(filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>, $unset?: Record<string, ''> }) {
                const doc = docs[filter._id.toString()]
                Object.assign(doc, update.$set ?? {})
                for (const k of Object.keys(update.$unset ?? {})) delete doc[k]
                return {}
            },
        },
        operations: {
            async findOne(filter: { _id: ObjectId }) {
                return (ops.find(o => (o._id as ObjectId).equals(filter._id)) ?? null) as never
            },
        },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-relocate-'))
    contentDir = join(root, 'content')
    mkdirSync(contentDir, { recursive: true })
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('resolveOperationFolder', () => {
    test('a null operation is Unknown, with no year', async () => {
        const d = deps({}, [])
        expect(await resolveOperationFolder(d, null)).toEqual({ year: null, campaign: null, operation: null, mission: null })
    })

    // The common case, and the reason normalizeKey exists: the operation is
    // titled per session day, the folder is per weekend and abbreviated.
    test('reuses an existing folder whose label matches the operation title', async () => {
        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Silent Ridge \u2014 Sat', date: new Date('2021-08-14T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2021', campaign: null, operation: '4. Op Silent Ridge', mission: null })
    })

    /* Final review, important 5: the archive's two parenthetical folders sit
       beside operations whose titles do not repeat the parenthetical.
       Matching only on the full key could not see either, so accepting a
       submission minted a DUPLICATE numbered folder next to the one already
       holding that operation's photographs, and the public facet rail showed
       the operation twice. */
    test('reuses a folder whose label carries a parenthetical the operation title lacks', async () => {
        mkdirSync(join(contentDir, '2021', '9. Op Copper Ridge (Lanze Verde)'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Copper Ridge \u2014 Sat', date: new Date('2021-05-15T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2021', campaign: null, operation: '9. Op Copper Ridge (Lanze Verde)', mission: null })
    })

    test('reuses the MW Training (CAG) folder for an operation titled MW Training', async () => {
        mkdirSync(join(contentDir, '2021', '12. MW Training (CAG)'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'MW Training', date: new Date('2021-06-19T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2021', campaign: null, operation: '12. MW Training (CAG)', mission: null })
    })

    // The reason the tiers are ordered rather than merged: both folders are
    // real and unrelated, so the specific one must win its own operation.
    test('a parenthetical folder does not steal an operation that has a plain namesake folder', async () => {
        mkdirSync(join(contentDir, '2021', '9. Op Copper Ridge (Lanze Verde)'), { recursive: true })
        mkdirSync(join(contentDir, '2021', '10. Op Copper Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Copper Ridge (Lanze Verde) \u2014 Sat', date: new Date('2021-05-15T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2021', campaign: null, operation: '9. Op Copper Ridge (Lanze Verde)', mission: null })
    })

    test('creates the next numbered folder name when nothing matches', async () => {
        mkdirSync(join(contentDir, '2021', '1. Op Armoured Spearhead'), { recursive: true })
        mkdirSync(join(contentDir, '2021', '7. Op Copper Ridge'), { recursive: true })
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Brand New \u2014 Sun', date: new Date('2021-11-02T09:00:00Z') }])

        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2021', campaign: null, operation: '8. Op Brand New', mission: null })
    })

    test('a year with no folders yet starts at 1', async () => {
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION First \u2014 Sat', date: new Date('2027-01-09T09:00:00Z') }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2027', campaign: null, operation: '1. Op First', mission: null })
    })

    // year stays null — there is no date to file a year folder under — but
    // operation does not: operationFacets() (lib/gallery/operation-facets.ts) keeps
    // operation/opLabel set on its undated branch and unsets only year, so
    // this must too, or the same document disagrees depending on which path
    // touched it last.
    test('an operation with no date cannot be placed in a year, but the operation itself is kept', async () => {
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Undated' }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: null, campaign: null, operation: 'OPERATION Undated', mission: null })
    })

    test('an operation dated right at the year boundary resolves by UTC, not local time', async () => {
        // 2025-12-31T23:30:00Z is still December in UTC but would already be
        // January in any timezone ahead of UTC — exactly the case
        // operationYear() exists to pin down.
        const d = deps({}, [{ _id: OP_ID, title: 'OPERATION Boundary \u2014 Sun', date: new Date('2025-12-31T23:30:00Z') }])
        expect(await resolveOperationFolder(d, OP_ID)).toEqual({ year: '2025', campaign: null, operation: '1. Op Boundary', mission: null })
    })

    /* THE test for this change. The user linked media into three operations of
       one campaign and got three sibling top-level folders, because the folder
       came from `op.title` and "OPERATION Trinity I / II / III" are three
       different titles that match nothing and each mint their own number.
       Resolving reads the disk, so each folder is created between calls exactly
       as relocateMedia's mkdir would. */
    test('three missions of one campaign share one numbered campaign folder', async () => {
        const SAT_1 = new ObjectId('6a8000000000000000000101')
        const SAT_2 = new ObjectId('6a8000000000000000000102')
        const SAT_3 = new ObjectId('6a8000000000000000000103')
        const M1 = new ObjectId('6a8000000000000000000201')
        const M2 = new ObjectId('6a8000000000000000000202')
        const M3 = new ObjectId('6a8000000000000000000203')

        const d = deps({}, [
            campaignOp(SAT_1, 'OPERATION Trinity I — Sat', M1, 'saturday', '2026-05-16T09:00:00Z'),
            campaignOp(SAT_2, 'OPERATION Trinity II — Sat', M2, 'saturday', '2026-05-23T09:00:00Z'),
            campaignOp(SAT_3, 'OPERATION Trinity III — Sat', M3, 'saturday', '2026-05-30T09:00:00Z'),
        ], [campaignDoc('Operation Trinity')], [
            missionDoc(M1, 'Operation Trinity I', { sequence: 1 }),
            missionDoc(M2, 'Operation Trinity II', { sequence: 2 }),
            missionDoc(M3, 'Operation Trinity III', { sequence: 3 }),
        ])

        expect(await resolveOperationFolder(d, SAT_1))
            .toEqual({ year: '2026', campaign: '1. Op Trinity', operation: 'Operation Trinity I', mission: 'Saturday' })
        mkdirSync(join(contentDir, '2026', '1. Op Trinity', 'Operation Trinity I', 'Saturday'), { recursive: true })

        expect(await resolveOperationFolder(d, SAT_2))
            .toEqual({ year: '2026', campaign: '1. Op Trinity', operation: 'Operation Trinity II', mission: 'Saturday' })
        mkdirSync(join(contentDir, '2026', '1. Op Trinity', 'Operation Trinity II', 'Saturday'), { recursive: true })

        expect(await resolveOperationFolder(d, SAT_3))
            .toEqual({ year: '2026', campaign: '1. Op Trinity', operation: 'Operation Trinity III', mission: 'Saturday' })

        // The year holds exactly one top-level folder, which is the whole
        // point: before this, it held three.
        expect(readdirSync(join(contentDir, '2026'))).toEqual(['1. Op Trinity'])
    })

    test('the Sunday half of a campaign mission is a sibling of the Saturday half, not a second folder', async () => {
        const SUN = new ObjectId('6a8000000000000000000104')
        const d = deps({}, [campaignOp(SUN, 'OPERATION Trinity I — Sun', MISSION_ID, 'sunday')],
            [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, 'Operation Trinity I')])

        expect(await resolveOperationFolder(d, SUN))
            .toEqual({ year: '2026', campaign: '1. Op Trinity', operation: 'Operation Trinity I', mission: 'Sunday' })
    })

    /* An operation J2 has attached to a campaign mission but not yet given a
       day slot. No day folder, and above all no day GUESSED from the "— Sun"
       in the title: a slot nobody set is not a slot. */
    test('a campaign mission with no daySlot gets no day folder, and the title suffix is not used as one', async () => {
        const d = deps({}, [campaignOp(OP_ID, 'OPERATION Trinity I — Sun', MISSION_ID, null)],
            [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, 'Operation Trinity I')])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2026', campaign: '1. Op Trinity', operation: 'Operation Trinity I', mission: null })
    })

    test('a single mission with a day slot gets the day folder directly under its own folder', async () => {
        const d = deps({}, [{
            _id: OP_ID, title: 'OPERATION Lone Wolf — Sat', date: new Date('2026-03-07T09:00:00Z'), daySlot: 'saturday',
        }])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2026', campaign: null, operation: '1. Op Lone Wolf', mission: 'Saturday' })
    })

    // The field exists to mark an operation explicitly standalone, so it has
    // to beat a campaignId left behind on the same document.
    test('isSingleMission wins over a campaignId still on the document', async () => {
        const op = campaignOp(OP_ID, 'OPERATION Trinity I — Sat', MISSION_ID, 'saturday')
        const d = deps({}, [{ ...op, isSingleMission: true }],
            [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, 'Operation Trinity I')])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2026', campaign: null, operation: '1. Op Trinity I', mission: 'Saturday' })
    })

    /* Each of these is a stale link, not an error: the media still has to be
       filed somewhere, and "somewhere" is the single-mission grammar rather
       than Unknown/ — the member picked a real operation and it has a real
       date, so throwing away its year and folder would lose more than the
       campaign level ever added. */
    test('a deleted campaign and a campaign that resolves to nothing both file as single missions', async () => {
        const op = campaignOp(OP_ID, 'OPERATION Trinity I — Sat', MISSION_ID, 'saturday')
        const single = { year: '2026', campaign: null, operation: '1. Op Trinity I', mission: 'Saturday' }

        // The campaign is gone.
        expect(await resolveOperationFolder(
            deps({}, [op], [campaignDoc('Operation Trinity', { isDeleted: true })], [missionDoc(MISSION_ID, 'Operation Trinity I')]),
            OP_ID,
        )).toEqual(single)

        // Neither collection holds anything at all — the campaignId names no
        // campaign, so there is no folder for one and nothing to honour.
        expect(await resolveOperationFolder(deps({}, [op]), OP_ID)).toEqual(single)

        // The third remaining reason — a campaign name that sanitizes to
        // nothing — is pinned by the traversal test below, which is where the
        // reasoning about sanitizeSegment lives.
    })

    /* THE test for this change. J2's board infers a campaign's missions from
       operation titles and only writes CampaignMission records when someone
       presses "Auto-group", so `campaignId` with no `campaignMissionId` is a
       common, legitimate state — and it used to file as a single mission,
       which gave the user "16. Op Trinity I", "17. Op Trinity II" and
       "18. Op Trinity III" as three sibling top-level folders. The campaign is
       an explicit fact on the document, so it is honoured; the mission level
       is simply absent. Each folder is created between calls exactly as
       relocateMedia's mkdir would, because resolving reads the disk. */
    test('three campaign operations with no CampaignMission records share one campaign folder', async () => {
        const SAT_1 = new ObjectId('6a8000000000000000000101')
        const SAT_2 = new ObjectId('6a8000000000000000000102')
        const SUN_1 = new ObjectId('6a8000000000000000000103')

        const d = deps({}, [
            campaignOnlyOp(SAT_1, 'OPERATION Trinity I — Sat', 'saturday', '2026-05-16T09:00:00Z'),
            campaignOnlyOp(SAT_2, 'OPERATION Trinity II — Sat', 'saturday', '2026-05-23T09:00:00Z'),
            campaignOnlyOp(SUN_1, 'OPERATION Trinity I — Sun', 'sunday', '2026-05-17T09:00:00Z'),
        ], [campaignDoc('Operation Trinity')], [])

        /* `campaign` is null and the campaign's folder arrives in `operation`:
           this is the single-mission grammar with the campaign's name on the
           top folder, which is the only reading buildContentPath can emit and
           parseContentPath can read back unchanged. See
           resolveOperationFolder's own comment. */
        const expected = { year: '2026', campaign: null, operation: '1. Op Trinity', mission: 'Saturday' }
        expect(await resolveOperationFolder(d, SAT_1)).toEqual(expected)
        mkdirSync(join(contentDir, '2026', '1. Op Trinity', 'Saturday'), { recursive: true })

        expect(await resolveOperationFolder(d, SAT_2)).toEqual(expected)
        expect(await resolveOperationFolder(d, SUN_1))
            .toEqual({ year: '2026', campaign: null, operation: '1. Op Trinity', mission: 'Sunday' })

        // One folder for the campaign, not one per mission. Before this
        // change the three calls returned '1. Op Trinity I', '2. Op Trinity II'
        // and '3. Op Trinity I' and the year held three directories.
        expect(readdirSync(join(contentDir, '2026'))).toEqual(['1. Op Trinity'])
    })

    /* The mission is never reconstructed from the title. board.ts's detectRoman
       would read "I" out of this one, and that inference is safe in a display
       layer and not in something that MOVES FILES — the "— Sun" suffix is in
       the fixture deliberately, and so is the absence of a day folder. */
    test('a campaign operation with no mission and no daySlot gets the campaign folder alone', async () => {
        const d = deps({}, [campaignOnlyOp(OP_ID, 'OPERATION Trinity I — Sun', null)],
            [campaignDoc('Operation Trinity')], [])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2026', campaign: null, operation: '1. Op Trinity', mission: null })
    })

    /* Each of these is an unusable MISSION beside a known-good campaign, and
       every one of them now drops the mission LEVEL rather than falling back
       to a top-level operation folder. The mismatch case is the one that
       changed meaning most: a mission moved to another campaign says nothing
       about whether this operation's own campaign is real. */
    test('a deleted mission, a missing mission, a mismatched one and a half-linked operation all file under the campaign with no mission level', async () => {
        const OTHER_CAMPAIGN = new ObjectId('6a8000000000000000000099')
        const op = campaignOp(OP_ID, 'OPERATION Trinity I — Sat', MISSION_ID, 'saturday')
        const campaignOnly = { year: '2026', campaign: null, operation: '1. Op Trinity', mission: 'Saturday' }

        // The mission is gone.
        expect(await resolveOperationFolder(
            deps({}, [op], [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, 'Operation Trinity I', { isDeleted: true })]),
            OP_ID,
        )).toEqual(campaignOnly)

        // The campaignMissionId names nothing.
        expect(await resolveOperationFolder(
            deps({}, [op], [campaignDoc('Operation Trinity')], []),
            OP_ID,
        )).toEqual(campaignOnly)

        // The mission belongs to a different campaign than the operation names.
        expect(await resolveOperationFolder(
            deps({}, [op], [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, 'Operation Trinity I', { campaignId: OTHER_CAMPAIGN })]),
            OP_ID,
        )).toEqual(campaignOnly)

        // A campaignId with no campaignMissionId beside it — half-linked, and
        // the state the user's six Trinity operations were actually in.
        expect(await resolveOperationFolder(
            deps({}, [campaignOnlyOp(OP_ID, 'OPERATION Trinity I — Sat', 'saturday')], [campaignDoc('Operation Trinity')], []),
            OP_ID,
        )).toEqual(campaignOnly)

        // A mission whose name is only punctuation: no folder to name, so no
        // mission level — and NOT an empty segment joined into the path.
        expect(await resolveOperationFolder(
            deps({}, [op], [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, '...')]),
            OP_ID,
        )).toEqual(campaignOnly)
    })

    // isSingleMission is checked before the campaign is ever read, so it still
    // beats a campaignId that has no mission beside it — the case that would
    // otherwise now resolve to a campaign folder rather than being ignored.
    test('isSingleMission beats a campaignId with no mission record', async () => {
        const d = deps({}, [{ ...campaignOnlyOp(OP_ID, 'OPERATION Trinity I — Sat', 'saturday'), isSingleMission: true }],
            [campaignDoc('Operation Trinity')], [])

        expect(await resolveOperationFolder(d, OP_ID))
            .toEqual({ year: '2026', campaign: null, operation: '1. Op Trinity I', mission: 'Saturday' })
    })

    /* A campaign name is free text from the J2 dashboard, and it now reaches a
       filesystem path — the same class of input that made
       lib/gallery/featured-path.ts necessary. sanitizeSegment reduces both of
       these to nothing, and a campaign with no usable name is a single
       mission rather than an empty or climbing path segment. */
    test('a campaign named with traversal or separators cannot reach outside its year folder', async () => {
        const op = campaignOp(OP_ID, 'OPERATION Trinity I — Sat', MISSION_ID, 'saturday')

        expect(await resolveOperationFolder(
            deps({}, [op], [campaignDoc('..')], [missionDoc(MISSION_ID, 'Operation Trinity I')]),
            OP_ID,
        )).toEqual({ year: '2026', campaign: null, operation: '1. Op Trinity I', mission: 'Saturday' })

        const slashed = await resolveOperationFolder(
            deps({}, [op], [campaignDoc('Trinity/../..')], [missionDoc(MISSION_ID, '../Escape')]),
            OP_ID,
        )
        // 'Trinity/../..' loses its separators to ILLEGAL and its trailing dots
        // to the final trim, leaving a plain folder name to be numbered.
        expect(slashed.campaign).toBe('1. Trinity')
        expect(slashed.operation).toBe('..Escape')
        for (const segment of [slashed.campaign, slashed.operation]) {
            expect(segment).not.toContain('/')
            expect(segment).not.toBe('..')
        }
    })
})

describe('operationYear', () => {
    // operationFacets() (lib/gallery/operation-facets.ts) calls this same function
    // rather than keeping its own getFullYear() — this pins the UTC behaviour
    // both sides depend on.
    test('reads the year in UTC, not the host process\'s local timezone', () => {
        expect(operationYear(new Date('2025-12-31T23:30:00Z'))).toBe('2025')
    })
})

describe('relocateMedia', () => {
    /* Mission is the facet relocate.ts and reconcile.ts disagreed about:
       relocate dropped it from the PATH when there was no operation but never
       unset the FIELD, so a legacy file reassigned to Unknown sat at
       "Unknown/…" while its document still claimed mission "I" — and the
       public facet rail filters on that field. relocate.test.ts had never
       covered mission at all, in either direction. */
    test('a legacy file keeps its mission folder when the operation is reassigned', async () => {
        const stage = join(contentDir, '2021', '4. Op Silent Ridge', 'I')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, 'arma3_01.png'), 'BYTES')
        mkdirSync(join(contentDir, '2022', '9. Op Copper Ridge'), { recursive: true })

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_01.png',
                mission: 'I',
                operationId: OP_ID,
            },
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Copper Ridge \u2014 Sat', date: new Date('2022-03-05T09:00:00Z') }])

        const result = await relocateMedia(d, MEDIA_ID)

        expect(result?.to).toBe(`content:2022/9. Op Copper Ridge/I/${MEDIA_ID}.png`)
        expect(docs[MEDIA_ID.toString()].mission).toBe('I')
        expect(existsSync(join(contentDir, '2022', '9. Op Copper Ridge', 'I', `${MEDIA_ID}.png`))).toBe(true)
    })

    test('reassigning to Unknown unsets mission rather than leaving it behind', async () => {
        const stage = join(contentDir, '2021', '4. Op Silent Ridge', 'I')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, 'arma3_02.png'), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_02.png',
                mission: 'I',
                year: '2021',
                operation: '4. Op Silent Ridge',
            },
        }
        const d = deps(docs, [])

        const result = await relocateMedia(d, MEDIA_ID)

        // The bytes are at Unknown/, so the document must not still claim a
        // mission — exactly what reconcile.ts does for the same move.
        expect(result?.to).toBe(`content:Unknown/${MEDIA_ID}.png`)
        expect(docs[MEDIA_ID.toString()].mission).toBeUndefined()
        expect(docs[MEDIA_ID.toString()].year).toBeUndefined()
        expect(docs[MEDIA_ID.toString()].operation).toBeUndefined()
    })

    test('moves the file, renames it, and updates the document', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: `media:${MEDIA_ID}.jpg`,
                caption: 'Danger close',
                authorName: 'Koda',
                operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Silent Ridge \u2014 Sat', date: new Date('2021-08-14T09:00:00Z') }])
        // The flat source lives outside contentDir, so point the resolver at it.
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        const expected = `2021/4. Op Silent Ridge/Koda \u2014 Danger close [${MEDIA_ID}].jpg`
        expect(result).toEqual({ from: `media:${MEDIA_ID}.jpg`, to: `content:${expected}` })

        // Moved, not copied.
        expect(existsSync(join(flat, `${MEDIA_ID}.jpg`))).toBe(false)
        expect(readFileSync(join(contentDir, '2021', '4. Op Silent Ridge', `Koda \u2014 Danger close [${MEDIA_ID}].jpg`), 'utf8')).toBe('BYTES')

        const doc = docs[MEDIA_ID.toString()]
        expect(doc.storageKey).toBe(`content:${expected}`)
        expect(doc.year).toBe('2021')
        expect(doc.operation).toBe('4. Op Silent Ridge')
        expect(doc.takenAt).toEqual(new Date('2021-08-14T09:00:00Z'))
    })

    test('an item with no operation lands in Unknown, and a stale takenAt is cleared', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Reaper',
                // Left over from a previous operation link. operationFacets()
                // (lib/gallery/operation-facets.ts) always nulls
                // takenAt on its Unknown branch, so relocateMedia must too —
                // otherwise the tile would keep sorting/grouping on a date
                // from an operation it is no longer assigned to.
                takenAt: new Date('2020-01-01T00:00:00Z'),
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(result?.to).toBe(`content:Unknown/Reaper [${MEDIA_ID}].jpg`)
        expect(existsSync(join(contentDir, 'Unknown', `Reaper [${MEDIA_ID}].jpg`))).toBe(true)
        expect(docs[MEDIA_ID.toString()].takenAt).toBeNull()
    })

    // The file still goes to Unknown/ — there is no date to file a year
    // folder under — but operation/opLabel survive, matching
    // operationFacets()'s undated branch (item 3 of fix round 1).
    test('an operation that exists but has no date still lands in Unknown, with the operation preserved', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Reaper', operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Undated' }])
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(result?.to).toBe(`content:Unknown/Reaper [${MEDIA_ID}].jpg`)
        const doc = docs[MEDIA_ID.toString()]
        expect(doc.operation).toBe('OPERATION Undated')
        expect(doc.opLabel).toBe('OPERATION Undated')
        expect('year' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
    })

    // $set/$unset are built correctly and the fake's updateOne handles
    // $unset correctly (both already true) — but nothing exercised them
    // together against a document that actually HAD year/operation/opLabel
    // set beforehand, so a regression in either would go undetected (fix
    // round 1, item 1). `'x' in doc` rather than `doc.x` being undefined:
    // the field must be gone, not merely re-set to an undefined value that
    // would still satisfy a Mongo `$exists: true` query.
    test('reassigning an already-filed item to Unknown actually removes year, operation and opLabel', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: `media:${MEDIA_ID}.jpg`,
                authorName: 'Reaper',
                year: '2026',
                operation: '23. Op New Winter',
                opLabel: 'Op New Winter',
                takenAt: new Date('2026-02-01T00:00:00Z'),
                // No operationId: this is the "reassigned to Unknown" case.
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(result?.to).toBe(`content:Unknown/Reaper [${MEDIA_ID}].jpg`)
        const doc = docs[MEDIA_ID.toString()]
        expect('year' in doc).toBe(false)
        expect('operation' in doc).toBe(false)
        expect('opLabel' in doc).toBe(false)
        expect(doc.takenAt).toBeNull()
    })

    test('relocating something already in the right place is a no-op, not a delete', async () => {
        const dir = join(contentDir, 'Unknown')
        mkdirSync(dir, { recursive: true })
        const name = `Reaper [${MEDIA_ID}].jpg`
        writeFileSync(join(dir, name), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `content:Unknown/${name}`, authorName: 'Reaper',
            } as Record<string, unknown>,
        }
        const result = await relocateMedia(deps(docs, []), MEDIA_ID)

        expect(result).toBeNull()
        expect(readFileSync(join(dir, name), 'utf8')).toBe('BYTES')
    })

    /* The bytes and the document have to agree about the campaign for exactly
       the reason they already had to agree about the operation: the rail
       filters on the field, and a human reads the folder. */
    test('a campaign mission files four levels deep and writes the campaign facet', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Koda', operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [campaignOp(OP_ID, 'OPERATION Trinity I — Sat', MISSION_ID, 'saturday')],
            [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, 'Operation Trinity I')])

        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        const expected = `2026/1. Op Trinity/Operation Trinity I/Saturday/Koda [${MEDIA_ID}].jpg`
        expect(result?.to).toBe(`content:${expected}`)
        expect(existsSync(join(contentDir, ...expected.split('/')))).toBe(true)

        const doc = docs[MEDIA_ID.toString()]
        expect(doc.year).toBe('2026')
        expect(doc.campaign).toBe('1. Op Trinity')
        expect(doc.operation).toBe('Operation Trinity I')
        expect(doc.opLabel).toBe('Operation Trinity I')
        expect(doc.mission).toBe('Saturday')
    })

    /* The three-directory half of the grammar, written by the producer that
       reads it back the same way. The document must carry NO `campaign`: the
       path has no folder for one, and parseContentPath reads three directories
       as operation + mission, so a `campaign` here would be a facet the disk
       contradicts the moment anyone reconciles. */
    test('a campaign operation with no mission record files three levels deep and writes no campaign facet', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Koda', operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [campaignOnlyOp(OP_ID, 'OPERATION Trinity I — Sat', 'saturday')],
            [campaignDoc('Operation Trinity')], [])

        const result = await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        // Before this change: `2026/1. Op Trinity I/Saturday/…`, one numbered
        // folder per mission of the campaign.
        const expected = `2026/1. Op Trinity/Saturday/Koda [${MEDIA_ID}].jpg`
        expect(result?.to).toBe(`content:${expected}`)
        expect(existsSync(join(contentDir, ...expected.split('/')))).toBe(true)

        const doc = docs[MEDIA_ID.toString()]
        expect(doc.year).toBe('2026')
        expect('campaign' in doc).toBe(false)
        expect(doc.operation).toBe('1. Op Trinity')
        expect(doc.opLabel).toBe('Op Trinity')
        expect(doc.mission).toBe('Saturday')
    })

    /* The mission record disappearing must move the file UP one level, not out
       of the campaign entirely — and the stale `campaign` facet has to go with
       it, because the folder it names no longer has anything under it. */
    test('an item loses the mission level, and its campaign facet, when the CampaignMission record is gone', async () => {
        const stage = join(contentDir, '2026', '1. Op Trinity', 'Operation Trinity I', 'Saturday')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, `Koda [${MEDIA_ID}].jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: `content:2026/1. Op Trinity/Operation Trinity I/Saturday/Koda [${MEDIA_ID}].jpg`,
                authorName: 'Koda',
                operationId: OP_ID,
                year: '2026',
                campaign: '1. Op Trinity',
                operation: 'Operation Trinity I',
                mission: 'Saturday',
            } as Record<string, unknown>,
        }
        // The campaign still exists; only the mission link is unusable, so the
        // existing '1. Op Trinity' folder is reused rather than a second one
        // being minted beside it.
        const d = deps(docs, [campaignOp(OP_ID, 'OPERATION Trinity I — Sat', MISSION_ID, 'saturday')],
            [campaignDoc('Operation Trinity')], [])

        const result = await relocateMedia(d, MEDIA_ID)

        expect(result?.to).toBe(`content:2026/1. Op Trinity/Saturday/Koda [${MEDIA_ID}].jpg`)
        const doc = docs[MEDIA_ID.toString()]
        expect('campaign' in doc).toBe(false)
        expect(doc.operation).toBe('1. Op Trinity')
        expect(doc.mission).toBe('Saturday')
    })

    /* Moving OUT of a campaign has to remove the field, not just stop writing
       it — the same defect `mission` had, one level up. A document still
       claiming "1. Op Trinity" while its bytes sit in a plain operation folder
       is a rail row nothing on disk agrees with. The legacy mission folder the
       item arrived with goes too: the campaign-mission folder above it WAS
       that level, so carrying "I" through would nest one mission inside
       another. */
    test('moving an item from a campaign mission to a single mission unsets campaign, and the day replaces a legacy mission', async () => {
        const stage = join(contentDir, '2026', '1. Op Trinity', 'Operation Trinity I', 'Saturday')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, `Koda [${MEDIA_ID}].jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: `content:2026/1. Op Trinity/Operation Trinity I/Saturday/Koda [${MEDIA_ID}].jpg`,
                authorName: 'Koda',
                operationId: OP_ID,
                year: '2026',
                campaign: '1. Op Trinity',
                operation: 'Operation Trinity I',
                mission: 'Saturday',
            } as Record<string, unknown>,
        }
        // The same operation, now marked explicitly standalone.
        const d = deps(docs, [{ ...campaignOp(OP_ID, 'OPERATION Trinity I — Sat', MISSION_ID, 'saturday'), isSingleMission: true }],
            [campaignDoc('Operation Trinity')], [missionDoc(MISSION_ID, 'Operation Trinity I')])

        const result = await relocateMedia(d, MEDIA_ID)

        expect(result?.to).toBe(`content:2026/2. Op Trinity I/Saturday/Koda [${MEDIA_ID}].jpg`)
        const doc = docs[MEDIA_ID.toString()]
        expect('campaign' in doc).toBe(false)
        expect(doc.operation).toBe('2. Op Trinity I')
        expect(doc.mission).toBe('Saturday')
    })

    /* The user's report: bulk-reassigning a folder's worth of media into
       another operation left the old folder standing, empty, in a tree they
       browse in a file manager. An empty "4. Op Silent Ridge" is
       indistinguishable there from one whose photographs went missing. */
    test('the folder a file leaves is removed once it is empty, and so is its year', async () => {
        const stage = join(contentDir, '2021', '4. Op Silent Ridge', 'I')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, 'arma3_01.png'), 'BYTES')
        mkdirSync(join(contentDir, '2022', '9. Op Copper Ridge'), { recursive: true })

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_01.png',
                mission: 'I',
                operationId: OP_ID,
            },
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Copper Ridge — Sat', date: new Date('2022-03-05T09:00:00Z') }])

        await relocateMedia(d, MEDIA_ID)

        // Every level the file used to occupy, all the way up to the year —
        // the first operation of 2021 recreates it, and resolveOperationFolder
        // already treats a missing year folder as "not an error".
        expect(existsSync(stage)).toBe(false)
        expect(existsSync(join(contentDir, '2021', '4. Op Silent Ridge'))).toBe(false)
        expect(existsSync(join(contentDir, '2021'))).toBe(false)
        // The content root itself is never a candidate, empty or not.
        expect(existsSync(contentDir)).toBe(true)
    })

    test('a folder that still holds another file is left exactly where it is', async () => {
        const stage = join(contentDir, '2021', '4. Op Silent Ridge', 'I')
        mkdirSync(stage, { recursive: true })
        writeFileSync(join(stage, 'arma3_01.png'), 'BYTES')
        // A second photograph nobody moved. Pruning reads the directory rather
        // than assuming the move emptied it, so this is what it sees.
        writeFileSync(join(stage, 'arma3_02.png'), 'BYTES')
        mkdirSync(join(contentDir, '2022', '9. Op Copper Ridge'), { recursive: true })

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID,
                storageKey: 'content:2021/4. Op Silent Ridge/I/arma3_01.png',
                mission: 'I',
                operationId: OP_ID,
            },
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Copper Ridge — Sat', date: new Date('2022-03-05T09:00:00Z') }])

        await relocateMedia(d, MEDIA_ID)

        expect(existsSync(join(stage, 'arma3_02.png'))).toBe(true)
        expect(existsSync(join(contentDir, '2021'))).toBe(true)
    })

    /* Publishing a submission moves it out of the FLAT media directory, which
       is a sibling of the content tree and not part of it. Pruning is bounded
       by the content root precisely so that directory — shared by every
       pending upload — can never be removed by a publish that happens to empty
       it. */
    test('publishing the last staged upload does not remove the flat media directory', async () => {
        const flat = join(root, 'media')
        mkdirSync(flat, { recursive: true })
        writeFileSync(join(flat, `${MEDIA_ID}.jpg`), 'BYTES')

        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Koda', operationId: OP_ID,
            } as Record<string, unknown>,
        }
        const d = deps(docs, [{ _id: OP_ID, title: 'OPERATION Silent Ridge — Sat', date: new Date('2021-08-14T09:00:00Z') }])

        await relocateMedia({ ...d, mediaDir: flat }, MEDIA_ID)

        expect(existsSync(join(flat, `${MEDIA_ID}.jpg`))).toBe(false)
        expect(existsSync(flat)).toBe(true)
    })

    test('a document whose file is missing is left alone and reported as null', async () => {
        const docs = {
            [MEDIA_ID.toString()]: {
                _id: MEDIA_ID, storageKey: `media:${MEDIA_ID}.jpg`, authorName: 'Ghost',
            } as Record<string, unknown>,
        }
        const d = deps(docs, [])
        await expect(relocateMedia({ ...d, mediaDir: join(root, 'media') }, MEDIA_ID)).resolves.toBeNull()
        // The key must NOT have been rewritten to point somewhere with no file.
        expect(docs[MEDIA_ID.toString()].storageKey).toBe(`media:${MEDIA_ID}.jpg`)
    })
})
