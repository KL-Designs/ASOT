import { describe, expect, test } from 'vitest'
import {
    grantExpiresAt, grantIsLive, hasSeatPriority, preLearningState, sanitisePreLearning,
    unlockedMemberIds, waitlistOrder, type SeatRecord,
} from './pre-learning'

const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 9, day, hour))

const seat = (memberId: string, rsvpStatus: SeatRecord['rsvpStatus'], minute: number, extra: Partial<SeatRecord> = {}): SeatRecord => ({
    memberId, rsvpStatus, slotType: 'trainee', createdAt: new Date(Date.UTC(2026, 9, 1, 10, minute)), ...extra,
})

describe('who is unlocked', () => {
    const records = [
        seat('a', 'attending', 0),
        seat('b', 'attending', 1),
        seat('w1', 'waitlist', 2),
        seat('w2', 'waitlist', 3),
        seat('w3', 'waitlist', 4),
        seat('gone', 'not_attending', 5),
        seat('trainer', 'attending', 6, { slotType: 'trainer' }),
        seat('watcher', 'attending', 7, { slotType: 'sit-in' }),
    ]

    test('everybody with a trainee seat, and the first two waiting', () => {
        expect(unlockedMemberIds(records)).toEqual(['a', 'b', 'w1', 'w2'])
    })

    test('trainers, sit-ins and people who pulled out are not', () => {
        const ids = unlockedMemberIds(records)
        expect(ids).not.toContain('trainer')
        expect(ids).not.toContain('watcher')
        expect(ids).not.toContain('gone')
    })

    test('the third in the queue is unlocked when somebody ahead leaves it', () => {
        const moved = records.map(r => r.memberId === 'w1' ? { ...r, rsvpStatus: 'not_attending' as const } : r)
        expect(unlockedMemberIds(moved)).toContain('w3')
    })

    test('a record from before slot types existed counts as a trainee', () => {
        expect(unlockedMemberIds([seat('old', 'attending', 0, { slotType: null })])).toEqual(['old'])
    })
})

describe('the waitlist', () => {
    test('is first come first served', () => {
        expect(waitlistOrder([seat('late', 'waitlist', 9), seat('early', 'waitlist', 1)]).map(r => r.memberId))
            .toEqual(['early', 'late'])
    })

    test('with priority ahead of everybody who has none', () => {
        const order = waitlistOrder([
            seat('early', 'waitlist', 1),
            seat('priority', 'waitlist', 9, { priority: true }),
        ])
        expect(order.map(r => r.memberId)).toEqual(['priority', 'early'])
    })
})

describe('a grant', () => {
    const grant = { unlockedAt: at(1), eventId: 'session-1' }

    test('lasts two weeks from when it unlocked', () => {
        expect(grantExpiresAt(grant)).toEqual(at(15))
        expect(grantIsLive(grant, at(14))).toBe(true)
        expect(grantIsLive(grant, at(15))).toBe(false)
    })

    test('reads as locked, open, done or expired', () => {
        expect(preLearningState(null, at(2))).toBe('locked')
        expect(preLearningState(grant, at(2))).toBe('open')
        expect(preLearningState({ ...grant, completedAt: at(3) }, at(4))).toBe('done')
        expect(preLearningState({ ...grant, completedAt: at(3) }, at(20))).toBe('expired')
    })
})

describe('seat priority', () => {
    const done = { unlockedAt: at(1), eventId: 'missed', completedAt: at(2) }

    test('for somebody who finished it and is signing up to another session inside the window', () => {
        expect(hasSeatPriority(done, { eventId: 'next', scheduledAt: at(10) }, at(5))).toBe(true)
    })

    test('not for the session that unlocked it', () => {
        expect(hasSeatPriority(done, { eventId: 'missed', scheduledAt: at(10) }, at(5))).toBe(false)
    })

    test('not without finishing the pre-learning', () => {
        expect(hasSeatPriority({ ...done, completedAt: null }, { eventId: 'next', scheduledAt: at(10) }, at(5))).toBe(false)
    })

    test('not for a session after the two weeks are up', () => {
        expect(hasSeatPriority(done, { eventId: 'next', scheduledAt: at(16) }, at(5))).toBe(false)
    })

    test('and not once the grant itself has lapsed', () => {
        expect(hasSeatPriority(done, { eventId: 'next', scheduledAt: at(10) }, at(20))).toBe(false)
    })
})

describe('sanitisePreLearning', () => {
    test('keeps labelled web and site links', () => {
        expect(sanitisePreLearning([
            { type: 'video', label: ' Watch this ', url: 'https://example.com/v' },
            { type: 'file', label: 'Handbook', url: '/storage/handbook.pdf' },
            { type: 'odd', label: 'Page', url: 'http://example.com' },
        ])).toEqual([
            { type: 'video', label: 'Watch this', url: 'https://example.com/v' },
            { type: 'file', label: 'Handbook', url: '/storage/handbook.pdf' },
            { type: 'url', label: 'Page', url: 'http://example.com' },
        ])
    })

    test('drops anything that is not a link a member should be sent to', () => {
        expect(sanitisePreLearning([
            { type: 'url', label: 'Script', url: 'javascript:alert(1)' },
            { type: 'url', label: 'Other host', url: '//evil.example' },
            { type: 'url', label: '', url: 'https://example.com' },
            { type: 'url', label: 'No url' },
            'nonsense',
        ])).toEqual([])
    })

    test('anything that is not a list is nothing', () => {
        expect(sanitisePreLearning(undefined)).toEqual([])
    })
})
