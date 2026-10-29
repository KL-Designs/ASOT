import { describe, expect, test } from 'vitest'
import {
    defaultReminderOffsets, formatOffset, reminderSentence, sanitiseOffsets, suggestedEnd, MAX_OFFSET,
} from './reminder-offsets'

describe('defaultReminderOffsets', () => {
    test('Selection: a month and a week before Session 1', () => {
        expect(defaultReminderOffsets('selection')).toEqual([30 * 24 * 60, 7 * 24 * 60])
    })
    test('everything else: a day and thirty minutes before', () => {
        expect(defaultReminderOffsets(undefined)).toEqual([24 * 60, 30])
        expect(defaultReminderOffsets('reinforcement_cycle')).toEqual([24 * 60, 30])
    })
})

describe('sanitiseOffsets', () => {
    test('not a list means not sent', () => {
        expect(sanitiseOffsets(undefined)).toBeNull()
        expect(sanitiseOffsets('30')).toBeNull()
    })
    test('drops junk, repeats and out-of-range values, sorts largest first', () => {
        expect(sanitiseOffsets([30, '1440', 30, -5, 0, 'x', MAX_OFFSET + 1, 12.7])).toEqual([1440, 30, 12])
    })
    test('caps the count', () => {
        expect(sanitiseOffsets([1, 2, 3, 4, 5, 6, 7])).toHaveLength(5)
    })
})

describe('formatOffset', () => {
    test.each([
        [15, '15 minutes'], [1, '1 minute'], [60, '1 hour'], [120, '2 hours'],
        [1440, '1 day'], [10080, '1 week'], [43200, '1 month'], [90, '90 minutes'],
    ])('%i → %s', (mins, text) => {
        expect(formatOffset(mins)).toBe(text)
    })
})

describe('reminderSentence', () => {
    test('the 30-minute reminder asks members to be ready 15 minutes early', () => {
        expect(reminderSentence('BCT 1', 30)).toBe('BCT 1 starts in 30 minutes. Be ready to load in in 15 minutes.')
    })
    test('other reminders are just the countdown', () => {
        expect(reminderSentence('BCT 1', 1440)).toBe('BCT 1 starts in 1 day.')
    })
})

describe('suggestedEnd', () => {
    test('90-minute training at 18:30 ends at 20:00', () => {
        const start = new Date(2026, 9, 21, 18, 30)
        expect(suggestedEnd(start, 90)).toEqual(new Date(2026, 9, 21, 20, 0))
    })
    test('no duration falls back to an hour', () => {
        const start = new Date(2026, 9, 21, 18, 30)
        expect(suggestedEnd(start, undefined)).toEqual(new Date(2026, 9, 21, 19, 30))
    })
})
