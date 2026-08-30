import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Regression coverage for the PATCH review route's `operationFields()` —
 * fix round 2's carried finding A: it used to write `operation`/`opLabel`
 * straight off the operation document (`op.title`), while `relocateMedia`
 * (lib/gallery/relocate.ts) writes the folder name `resolveOperationFolder`
 * resolves to. The two run against the same document seconds apart — a
 * reviewer corrects the operation via PATCH, then accepts, which relocates —
 * so a document could carry one spelling of `operation` before publish and a
 * different one after, splitting one operation into two entries in the
 * public gallery's facet rail.
 *
 * Importing route.ts pulls in `@/lib/mongo` and `@/lib/discord` at module
 * scope — both connect to something real (Mongo, the bot's Discord client)
 * as a side effect of being imported, which a unit test must never trigger.
 * Both are mocked below to inert stand-ins; `operationFields()` itself never
 * touches them because every test passes its own `deps` explicitly.
 */
vi.mock('@/lib/mongo', () => ({ default: {} }))
vi.mock('@/lib/discord', () => ({ default: {} }))

const { operationFields } = await import('./route')

const OP_ID = new ObjectId('6a8000000000000000000001')

let root: string
let contentDir: string

/** Mirrors relocate.test.ts's own fixture — operationFields() only reads
 *  `deps.operations` and `deps.contentDir` (via resolveOperationFolder), but
 *  RelocateDeps requires `media` structurally, so a stand-in is supplied even
 *  though nothing here calls it. */
function deps(ops: Record<string, unknown>[]) {
    return {
        contentDir,
        media: {
            async findOne() { return null },
            async updateOne() { return {} },
        },
        operations: {
            // `as never`, matching relocate.test.ts's own fixture: WithId<Operation>
            // has ~20 required fields no test fixture here needs, and this stand-in
            // only ever carries the two (title, date) operationFields() reads.
            async findOne(filter: { _id: ObjectId }) {
                return (ops.find(o => (o._id as ObjectId).equals(filter._id)) ?? null) as never
            },
        },
    }
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-operation-fields-'))
    contentDir = join(root, 'content')
    mkdirSync(contentDir, { recursive: true })
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('operationFields', () => {
    test('writes the folder name to operation/opLabel, not the raw operation title', async () => {
        mkdirSync(join(contentDir, '2021', '4. Op Silent Ridge'), { recursive: true })
        const ops = [{ _id: OP_ID, title: 'OPERATION Silent Ridge — Sat', date: new Date('2021-08-14T09:00:00Z') }]

        const fields = await operationFields(OP_ID.toString(), deps(ops))

        // Exactly what relocateMedia (lib/gallery/relocate.test.ts, "moves
        // the file, renames it, and updates the document") writes for the
        // same operation — the whole point of the fix.
        expect(fields?.$set.operation).toBe('4. Op Silent Ridge')
        expect(fields?.$set.opLabel).toBe('Op Silent Ridge')
        expect(fields?.$set.year).toBe('2021')
    })

    test('creates the next numbered folder name when no existing folder matches, same as relocateMedia', async () => {
        mkdirSync(join(contentDir, '2021', '7. Op Copper Ridge'), { recursive: true })
        const ops = [{ _id: OP_ID, title: 'OPERATION Brand New — Sun', date: new Date('2021-11-02T09:00:00Z') }]

        const fields = await operationFields(OP_ID.toString(), deps(ops))

        expect(fields?.$set.operation).toBe('8. Op Brand New')
        expect(fields?.$set.opLabel).toBe('Op Brand New')
    })

    // Matches relocateMedia's own undated branch (relocate.test.ts, "an
    // operation with no date cannot be placed in a year, but the operation
    // itself is kept") — no folder to check against without a date, so the
    // raw title is what both functions fall back to.
    test('an undated operation keeps the raw title and unsets year', async () => {
        const ops = [{ _id: OP_ID, title: 'OPERATION Undated' }]

        const fields = await operationFields(OP_ID.toString(), deps(ops))

        expect(fields?.$set.operation).toBe('OPERATION Undated')
        expect(fields?.$set.opLabel).toBe('OPERATION Undated')
        expect(fields?.$unset).toEqual({ year: '' })
    })

    test('"unknown" clears operationId, operation, opLabel and year, and nulls takenAt', async () => {
        const fields = await operationFields('unknown', deps([]))

        expect(fields?.$unset).toEqual({ operationId: '', operation: '', opLabel: '', year: '' })
        expect(fields?.$set).toEqual({ takenAt: null })
    })

    test('a null operationId is treated the same as "unknown"', async () => {
        const fields = await operationFields(null, deps([]))

        expect(fields?.$unset).toEqual({ operationId: '', operation: '', opLabel: '', year: '' })
    })

    test('an invalid ObjectId string is rejected', async () => {
        expect(await operationFields('not-an-id', deps([]))).toBeNull()
    })

    test('an operation id that matches no document is rejected', async () => {
        expect(await operationFields(OP_ID.toString(), deps([]))).toBeNull()
    })
})
