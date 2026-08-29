import { describe, test, expect } from 'vitest'
import type { RosterSlot } from '@/lib/attendance/roster'
import {
    aarOpen, sectionLead, sectionsOf, ledSections, canWriteSection, didAttend,
    ATTENDANCE_STATUSES, attendanceStatus, RATING_SCALE, validRating, averageRating,
} from './aar'

function slot(partial: Partial<RosterSlot> & { sectionTitle: string; order: number }): RosterSlot {
    return {
        id: `${partial.sectionTitle}-${partial.order}`,
        category: 'platoon11',
        role: 'Rifleman',
        roleId: null,
        homeUserId: null,
        occupantUserId: null,
        ...partial,
    }
}

/** A section with a commander, a 2IC and two riflemen. */
const ALPHA = [
    slot({ sectionTitle: 'Alpha', order: 0, role: 'Section Commander', occupantUserId: 'sgt' }),
    slot({ sectionTitle: 'Alpha', order: 1, role: '2IC', occupantUserId: 'cpl' }),
    slot({ sectionTitle: 'Alpha', order: 2, occupantUserId: 'rfn1' }),
    slot({ sectionTitle: 'Alpha', order: 3, occupantUserId: null }),
]

const BRAVO = [
    slot({ sectionTitle: 'Bravo', order: 4, role: 'Section Commander', occupantUserId: 'sgt2' }),
    slot({ sectionTitle: 'Bravo', order: 5, occupantUserId: 'rfn2' }),
]

describe('aarOpen', () => {
    test('opens the moment the operation finishes, and stays open', () => {
        expect(aarOpen('confirmations_open')).toBe(true)
        expect(aarOpen('completed')).toBe(true)
    })

    test('is closed before that', () => {
        for (const stage of ['preparing', 'rsvp_open', 'rsvp_closed', 'op_running'] as const) {
            expect(aarOpen(stage), stage).toBe(false)
        }
    })

    test('an operation with no stage at all has not finished', () => {
        expect(aarOpen(null)).toBe(false)
        expect(aarOpen(undefined)).toBe(false)
    })
})

describe('sectionLead', () => {
    test('is the occupant of the top slot', () => {
        expect(sectionLead(ALPHA, 'Alpha')).toBe('sgt')
    })

    test('walks down when the top slot was never filled', () => {
        // The commander did not show, so the 2IC ran the section — and the
        // write-up is theirs, not the absent commander's.
        const noCommander = ALPHA.map(s => s.order === 0 ? { ...s, occupantUserId: null } : s)
        expect(sectionLead(noCommander, 'Alpha')).toBe('cpl')
    })

    test('walks past several empty slots', () => {
        const skeleton = ALPHA.map(s => s.order <= 1 ? { ...s, occupantUserId: null } : s)
        expect(sectionLead(skeleton, 'Alpha')).toBe('rfn1')
    })

    test('is null for a section nobody filled', () => {
        const empty = ALPHA.map(s => ({ ...s, occupantUserId: null }))
        expect(sectionLead(empty, 'Alpha')).toBeNull()
    })

    test('is null for a section that does not exist', () => {
        expect(sectionLead(ALPHA, 'Charlie')).toBeNull()
    })

    test('does not read across section boundaries', () => {
        // Bravo's slots are ordered after Alpha's; the lead of Bravo must be
        // Bravo's own top occupant, not the roster's.
        expect(sectionLead([...ALPHA, ...BRAVO], 'Bravo')).toBe('sgt2')
    })

    test('ignores roster order in the array, using the slot order', () => {
        const shuffled = [...ALPHA].reverse()
        expect(sectionLead(shuffled, 'Alpha')).toBe('sgt')
    })
})

describe('sectionsOf', () => {
    test('lists each section once, in roster order', () => {
        expect(sectionsOf([...BRAVO, ...ALPHA])).toEqual(['Alpha', 'Bravo'])
    })

    test('is empty for an empty roster', () => {
        expect(sectionsOf([])).toEqual([])
    })
})

describe('ledSections', () => {
    const roster = [...ALPHA, ...BRAVO]

    test('names the sections this member led', () => {
        expect(ledSections(roster, 'sgt')).toEqual(['Alpha'])
        expect(ledSections(roster, 'sgt2')).toEqual(['Bravo'])
    })

    test('is empty for somebody who led nothing', () => {
        expect(ledSections(roster, 'rfn1')).toEqual([])
        expect(ledSections(roster, null)).toEqual([])
    })

    test('handles one person leading two sections', () => {
        const both = [...ALPHA, ...BRAVO.map(s => s.order === 4 ? { ...s, occupantUserId: 'sgt' } : s)]
        expect(ledSections(both, 'sgt')).toEqual(['Alpha', 'Bravo'])
    })
})

describe('canWriteSection', () => {
    const roster = [...ALPHA, ...BRAVO]

    test('the 1IC may write their own section', () => {
        expect(canWriteSection(roster, 'sgt', 'Alpha', false)).toBe(true)
    })

    test('and nobody else\'s', () => {
        expect(canWriteSection(roster, 'sgt', 'Bravo', false)).toBe(false)
    })

    test('a member of the section may not', () => {
        expect(canWriteSection(roster, 'rfn1', 'Alpha', false)).toBe(false)
    })

    test('staff may write any section — somebody has to be able to close an op out', () => {
        expect(canWriteSection(roster, 'nobody', 'Alpha', true)).toBe(true)
        expect(canWriteSection(roster, 'nobody', 'Bravo', true)).toBe(true)
    })

    test('a logged-out visitor may not, even for a section with no lead', () => {
        expect(canWriteSection(roster, null, 'Alpha', false)).toBe(false)
    })
})

describe('didAttend', () => {
    const base: OperationAttendanceRecord = {
        userId: 'rfn1', unit: 'Alpha', orbatSection: 'Alpha', orbatRole: 'Rifleman',
        rsvp: null, confirmed: false, confirmedBy: null, confirmedAt: null,
    }

    test('a confirmed member attended', () => {
        expect(didAttend({ ...base, confirmed: true }, false)).toBe(true)
    })

    test('an explicit ATTENDED counts before confirmation', () => {
        expect(didAttend({ ...base, attendanceType: 'ATTENDED' }, false)).toBe(true)
    })

    test.each(['NOT ATTENDING', 'LOA', 'NO NOTICE', 'N/A'])('%s means they were not there', status => {
        // Even if they said they were coming and held a slot — somebody has
        // since said otherwise, and that is the answer.
        expect(didAttend({ ...base, rsvp: 'attending', attendanceType: status }, true)).toBe(false)
    })

    test('before confirmation, saying yes and holding a position is enough', () => {
        // Otherwise nobody could leave feedback until their 1IC did paperwork.
        expect(didAttend({ ...base, rsvp: 'attending' }, true)).toBe(true)
    })

    test('but saying yes without a position is not', () => {
        expect(didAttend({ ...base, rsvp: 'attending' }, false)).toBe(false)
    })

    test('and a position without saying yes is not', () => {
        expect(didAttend({ ...base, rsvp: null }, true)).toBe(false)
        expect(didAttend({ ...base, rsvp: 'not_attending' }, true)).toBe(false)
    })

    test('somebody with no record at all did not attend', () => {
        expect(didAttend(undefined, true)).toBe(false)
    })

    test('confirmation outranks a stale non-attending status', () => {
        expect(didAttend({ ...base, confirmed: true, attendanceType: 'LOA' }, false)).toBe(true)
    })
})

describe('attendance statuses', () => {
    test('carry the eight the board has always had', () => {
        expect(ATTENDANCE_STATUSES.map(s => s.value)).toEqual([
            'ATTENDED', 'NOT ATTENDING', 'RESOLVED', 'NO NOTICE',
            'LOA', 'CONFIRM', 'N/A', 'ADDED TO UNIT',
        ])
    })

    test('every one of them has a colour and a label', () => {
        for (const s of ATTENDANCE_STATUSES) {
            expect(s.label, s.value).toBeTruthy()
            expect(s.colour, s.value).toMatch(/^#|^rgba?\(/)
        }
    })

    test('lookup returns null rather than throwing on an unknown status', () => {
        expect(attendanceStatus('ATTENDED')?.label).toBe('Attended')
        expect(attendanceStatus('NONSENSE')).toBeNull()
        expect(attendanceStatus(undefined)).toBeNull()
    })
})

describe('the rating scale', () => {
    test('is five steps centred on "as usual"', () => {
        expect(RATING_SCALE).toHaveLength(5)
        const middle = RATING_SCALE.find(s => s.value === 3)
        expect(middle?.offset).toBe(0)
        expect(middle?.label).toBe('As usual')
    })

    test('diverges symmetrically, so the bar has a real centre', () => {
        expect(RATING_SCALE.map(s => s.offset)).toEqual([-2, -1, 0, 1, 2])
        expect(RATING_SCALE.reduce((a, s) => a + s.offset, 0)).toBe(0)
    })

    test('validRating accepts the five and nothing else', () => {
        for (const v of [1, 2, 3, 4, 5]) expect(validRating(v), String(v)).toBe(true)
        for (const v of [0, 6, 2.5, -1, '3', null, undefined, NaN]) {
            expect(validRating(v), String(v)).toBe(false)
        }
    })
})

describe('averageRating', () => {
    test('averages what was given', () => {
        expect(averageRating([3, 3, 3])).toBe(3)
        expect(averageRating([1, 5])).toBe(3)
        expect(averageRating([4, 5])).toBe(4.5)
    })

    test('rounds to one decimal — the answer does not carry more than that', () => {
        expect(averageRating([3, 4, 5])).toBe(4)
        expect(averageRating([1, 2, 4])).toBe(2.3)
    })

    test('ignores gaps rather than counting them as zero', () => {
        expect(averageRating([5, null, undefined, 5])).toBe(5)
    })

    test('is null when nobody answered', () => {
        expect(averageRating([])).toBeNull()
        expect(averageRating([null, undefined])).toBeNull()
    })

    test('ignores values off the scale rather than averaging nonsense in', () => {
        expect(averageRating([3, 99, 0])).toBe(3)
    })
})
