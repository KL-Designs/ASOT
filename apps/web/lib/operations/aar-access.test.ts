import { describe, expect, test } from 'vitest'
import type { RosterSlot } from '@/lib/attendance/roster'
import {
    aarHasContent, bypassesUnlock, canCommend, canEditMissionAar, consolidatedUnlocked, sanitiseMissionAar,
    summariseFeedback, viewableSections,
} from './aar-access'

function slot(p: Partial<RosterSlot> & { sectionTitle: string; order: number }): RosterSlot {
    return { id: `${p.sectionTitle}-${p.order}`, category: 'platoon11', role: 'Rifleman', roleId: null, homeUserId: null, occupantUserId: null, ...p }
}

const ROSTER = [
    slot({ category: 'companyHQ', sectionTitle: 'CHQ', order: 0, occupantUserId: 'oc' }),
    slot({ sectionTitle: '1-1 PHQ', order: 1, occupantUserId: 'pl' }),
    slot({ sectionTitle: 'Alpha', order: 2, occupantUserId: 'sgt' }),
    slot({ sectionTitle: 'Alpha', order: 3, occupantUserId: 'rfn' }),
    slot({ category: 'platoon12', sectionTitle: 'Charlie', order: 4, occupantUserId: 'sgt2' }),
]
const nobody = { canManageAll: false, isJ4: false, isMissionMaker: false }

describe('viewableSections', () => {
    test('an ordinary member cannot read any section, their own included', () => {
        expect(viewableSections(ROSTER, 'rfn', nobody)).toEqual([])
    })
    test('a section lead reads their section; PHQ their platoon; CHQ everything', () => {
        expect(viewableSections(ROSTER, 'sgt', nobody)).toEqual(['Alpha'])
        expect(viewableSections(ROSTER, 'pl', nobody)).toEqual(['1-1 PHQ', 'Alpha'])
        expect(viewableSections(ROSTER, 'oc', nobody)).toEqual(['CHQ', '1-1 PHQ', 'Alpha', 'Charlie'])
    })
    test('J4 and the mission maker read everything', () => {
        expect(viewableSections(ROSTER, 'x', { ...nobody, isJ4: true })).toHaveLength(4)
        expect(viewableSections(ROSTER, 'x', { ...nobody, isMissionMaker: true })).toHaveLength(4)
    })
})

describe('the consolidated view gate', () => {
    test('opens only after your report and, if you were there, your feedback', () => {
        expect(consolidatedUnlocked({ hasOwnAar: false, attended: true, hasFeedback: true, bypass: false })).toBe(false)
        expect(consolidatedUnlocked({ hasOwnAar: true, attended: true, hasFeedback: false, bypass: false })).toBe(false)
        expect(consolidatedUnlocked({ hasOwnAar: true, attended: true, hasFeedback: true, bypass: false })).toBe(true)
        expect(consolidatedUnlocked({ hasOwnAar: true, attended: false, hasFeedback: false, bypass: false })).toBe(true)
    })
    test('only J4 and the mission maker skip it', () => {
        expect(bypassesUnlock({ isJ4: true, isMissionMaker: false })).toBe(true)
        expect(bypassesUnlock({ isJ4: false, isMissionMaker: true })).toBe(true)
        expect(bypassesUnlock({ isJ4: false, isMissionMaker: false })).toBe(false)
    })
    test('an empty report does not count', () => {
        expect(aarHasContent({ fix: ' ', improve: '', sustain: '' })).toBe(false)
        expect(aarHasContent({ fix: 'x', improve: '', sustain: '' })).toBe(true)
    })
})

describe('feedback summary', () => {
    test('averages each aspect, Enjoyment included, and keeps the comments', () => {
        const s = summariseFeedback([
            { server: 3, combat: 5, story: 4, enjoyment: 5, comment: 'Great' },
            { server: 1, combat: null, story: 4, enjoyment: 4, comment: ' ' },
        ])
        expect(s.responses).toBe(2)
        expect(s.averages).toEqual({ server: 2, combat: 5, story: 4, enjoyment: 4.5 })
        expect(s.comments).toEqual(['Great'])
    })
})

describe('mission AAR and commendations', () => {
    test('section staff, CHQ and the overrides edit a section block; a rifleman does not', () => {
        expect(canEditMissionAar(ROSTER, 'sgt', 'Alpha', nobody)).toBe(true)
        expect(canEditMissionAar(ROSTER, 'pl', 'Alpha', nobody)).toBe(true)
        expect(canEditMissionAar(ROSTER, 'oc', 'Charlie', nobody)).toBe(true)
        expect(canEditMissionAar(ROSTER, 'rfn', 'Alpha', nobody)).toBe(false)
        expect(canEditMissionAar(ROSTER, 'sgt', 'Charlie', nobody)).toBe(false)
    })
    test('staff on the night may commend; riflemen may not', () => {
        expect(canCommend(ROSTER, 'sgt', nobody)).toBe(true)
        expect(canCommend(ROSTER, 'pl', nobody)).toBe(true)
        expect(canCommend(ROSTER, 'rfn', nobody)).toBe(false)
    })
    test('vehicles without a name are dropped', () => {
        const v = sanitiseMissionAar({ situation: 'x', vehicles: [{ name: 'ASLAV 1', status: 'Damaged' }, { name: '' }] })
        expect(v?.vehicles).toEqual([{ name: 'ASLAV 1', status: 'Damaged', note: '' }])
    })
})
