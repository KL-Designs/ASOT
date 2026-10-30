import { describe, expect, test } from 'vitest'
import type { RosterSlot } from '@/lib/attendance/roster'
import {
    DEFAULT_INTEL_SETTINGS, forViewer, groupByMission, hiddenUntil, inReport, intelStanding, inView, playerCanSee,
    safeUrl, sanitiseEntryInput, sanitiseEvidence, tallyVotes, viewsFor,
} from './report'

const settings = DEFAULT_INTEL_SETTINGS
const at = { campaignId: 'c1', operationId: 'op3', sequence: 3 }

function entry(p: Partial<IntelEntry> = {}): IntelEntry & { _id: { toString(): string } } {
    return {
        _id: { toString: () => 'e1' } as never,
        campaignId: 'c1', operationId: 'op1', sourceSequence: 1, callSign: 'Alpha',
        submittedById: 'u1', submittedByName: 'Sgt A', title: 'Tank', description: 'T-72 at the bridge',
        evidence: [], grid: '034 127', hiddenUntilSequence: null, publication: 'published',
        assessment: { status: 'unassessed', comment: '', released: false },
        versions: [], createdAt: new Date(0), updatedAt: new Date(0),
        ...p,
    }
}

describe('what is in the report', () => {
    test('earlier missions and starting intel carry forward; later ones do not', () => {
        expect(inReport(entry({ sourceSequence: 0, operationId: null }), at, settings)).toBe(true)
        expect(inReport(entry({ sourceSequence: 2 }), at, settings)).toBe(true)
        expect(inReport(entry({ sourceSequence: 4 }), at, settings)).toBe(false)
        expect(inReport(entry({ campaignId: 'c2' }), at, settings)).toBe(false)
    })
    test('carry forward off keeps only starting intel and this mission', () => {
        const off = { ...settings, carryForward: false }
        expect(inReport(entry({ sourceSequence: 2 }), at, off)).toBe(false)
        expect(inReport(entry({ sourceSequence: 3 }), at, off)).toBe(true)
        expect(inReport(entry({ sourceSequence: 0 }), at, off)).toBe(true)
    })
    test('a standalone operation reads only its own entries', () => {
        const solo = { campaignId: null, operationId: 'opX', sequence: 1 }
        expect(inReport(entry({ campaignId: null, operationId: 'opX' }), solo, settings)).toBe(true)
        expect(inReport(entry({ campaignId: null, operationId: 'opY' }), solo, settings)).toBe(false)
        expect(inReport(entry(), solo, settings)).toBe(false)
    })
})

describe('players never see what they should not', () => {
    test('hidden future intel, pending, deleted and sharing off are all filtered', () => {
        expect(playerCanSee(entry({ hiddenUntilSequence: 4 }), 3, settings)).toBe(false)
        expect(playerCanSee(entry({ hiddenUntilSequence: 3 }), 3, settings)).toBe(true)
        expect(playerCanSee(entry({ publication: 'pending' }), 3, settings)).toBe(false)
        expect(playerCanSee(entry({ deletedAt: new Date() }), 3, settings)).toBe(false)
        expect(playerCanSee(entry(), 3, { ...settings, sharing: false })).toBe(false)
    })
    test('declined and unassessed intel still carries forward', () => {
        expect(playerCanSee(entry({ assessment: { status: 'declined', comment: '', released: true } }), 3, settings)).toBe(true)
        expect(playerCanSee(entry(), 3, settings)).toBe(true)
    })
    test('a withheld assessment and the staff fields are stripped for players', () => {
        const e = entry({ hiddenUntilSequence: null, assessment: { status: 'confirmed', comment: 'yes', released: false } })
        const out = forViewer(e, false, { up: 0, down: 0, mine: 0 })
        expect(out.assessment).toBeNull()
        expect(out).not.toHaveProperty('hiddenUntilSequence')
        expect(out).not.toHaveProperty('publication')
        expect(out).not.toHaveProperty('submittedById')
        expect(forViewer(e, true, { up: 0, down: 0, mine: 0 }).assessment?.status).toBe('confirmed')
    })
})

describe('staff views', () => {
    test('review holds pending, hidden and unassessed; deleted holds the bin', () => {
        expect(inView(entry({ publication: 'pending' }), 'review', 3)).toBe(true)
        expect(inView(entry({ hiddenUntilSequence: 5 }), 'review', 3)).toBe(true)
        expect(inView(entry({ assessment: { status: 'confirmed', comment: '', released: true } }), 'review', 3)).toBe(false)
        expect(inView(entry({ deletedAt: new Date() }), 'deleted', 3)).toBe(true)
        expect(inView(entry({ deletedAt: new Date() }), 'active', 3)).toBe(false)
    })
    test('visible and hidden split by what players can see; assessment plays no part', () => {
        const assessed = { assessment: { status: 'confirmed' as const, comment: '', released: true } }
        expect(inView(entry(assessed), 'active', 3)).toBe(true)
        expect(inView(entry({ ...assessed, hidden: true }), 'active', 3)).toBe(false)
        expect(inView(entry({ ...assessed, hidden: true }), 'hidden', 3)).toBe(true)
        expect(inView(entry({ ...assessed, hiddenUntilSequence: 5 }), 'hidden', 3)).toBe(true)
        expect(inView(entry({ ...assessed, hiddenUntilSequence: 5 }), 'review', 3)).toBe(false)
        expect(inView(entry({}), 'active', 3)).toBe(true)
        expect(playerCanSee(entry({ hidden: true }), 3, settings)).toBe(false)
    })
    test('standing: staff on the night may add, the owner holds everything', () => {
        const slot = (p: Partial<RosterSlot> & { sectionTitle: string; order: number }): RosterSlot =>
            ({ id: `${p.sectionTitle}-${p.order}`, category: 'platoon11', role: 'R', roleId: null, homeUserId: null, occupantUserId: null, ...p })
        const roster = [slot({ sectionTitle: 'Alpha', order: 0, occupantUserId: 'sgt' }), slot({ sectionTitle: 'Alpha', order: 1, occupantUserId: 'rfn' })]
        const none = { canAdd: false, canAssess: false, canManage: false }
        expect(intelStanding(roster, 'sgt', none, false)).toEqual({ canAdd: true, canAssess: false, canManage: false })
        expect(intelStanding(roster, 'rfn', none, false)).toEqual(none)
        expect(intelStanding(roster, 'rfn', none, true)).toEqual({ canAdd: true, canAssess: true, canManage: true })
        expect(viewsFor({ canAdd: true, canAssess: true, canManage: false })).toEqual(['active', 'hidden', 'add', 'review'])
    })
})

describe('input and votes', () => {
    test('only our uploads and http links survive', () => {
        expect(safeUrl('javascript:alert(1)')).toBeNull()
        expect(safeUrl('/api/upload/image?id=x&ext=png')).toBe('/api/upload/image?id=x&ext=png')
        expect(sanitiseEvidence([{ kind: 'video', url: 'https://youtu.be/x', caption: 'clip' }, { kind: 'exe', url: 'https://x' }]))
            .toEqual([{ kind: 'video', url: 'https://youtu.be/x', caption: 'clip' }])
    })
    test('an empty entry is refused; a missing title comes from the description', () => {
        expect(sanitiseEntryInput({ title: ' ', description: '' })).toBeNull()
        expect(sanitiseEntryInput({ description: 'Mortar team\nnorth ridge' })?.title).toBe('Mortar team')
    })
    test('hidden until must be after the source mission', () => {
        expect(hiddenUntil('', 2)).toBeNull()
        expect(hiddenUntil(2, 2)).toBeNull()
        expect(hiddenUntil('4', 2)).toBe(4)
    })
    test('votes tally and the viewer sees their own', () => {
        expect(tallyVotes([{ userId: 'a', value: 1 }, { userId: 'b', value: -1 }, { userId: 'c', value: 1 }], 'b')).toEqual({ up: 2, down: 1, mine: -1 })
    })
    test('grouping is by mission then call sign', () => {
        const g = groupByMission([{ sourceSequence: 2, callSign: 'Bravo' }, { sourceSequence: 0, callSign: 'Starting intel' }, { sourceSequence: 2, callSign: 'Alpha' }])
        expect(g.map(m => [m.sequence, m.callSigns.map(c => c.callSign)])).toEqual([[0, ['Starting intel']], [2, ['Alpha', 'Bravo']]])
    })
})
