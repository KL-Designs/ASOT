/**
 * The deck's Advance button is a manual override on top of the cron that
 * normally drives these transitions, so "what comes next" has to be one
 * answer both agree on.
 */
import { describe, test, expect } from 'vitest'
import { STAGE_ORDER, stageIndex, nextStage, stageLabel, stageProgress } from './stage'

describe('STAGE_ORDER', () => {
    test('is the lifecycle in order', () => {
        expect(STAGE_ORDER).toEqual([
            'preparing', 'rsvp_open', 'rsvp_closed',
            'op_running', 'confirmations_open', 'completed',
        ])
    })
})

describe('stageIndex', () => {
    test('locates a stage', () => {
        expect(stageIndex('preparing')).toBe(0)
        expect(stageIndex('completed')).toBe(5)
    })

    test('treats null and anything unrecognised as preparing', () => {
        expect(stageIndex(null)).toBe(0)
        expect(stageIndex('nonsense' as never)).toBe(0)
    })
})

describe('nextStage', () => {
    test('advances one step', () => {
        expect(nextStage('preparing')).toBe('rsvp_open')
        expect(nextStage('op_running')).toBe('confirmations_open')
    })

    test('null at the end, so the button can disable itself', () => {
        expect(nextStage('completed')).toBeNull()
    })
})

describe('stageLabel', () => {
    test('renders human labels', () => {
        expect(stageLabel('rsvp_open')).toBe('RSVP Open')
        expect(stageLabel('op_running')).toBe('Op Running')
        expect(stageLabel(null)).toBe('Preparing')
    })
})

describe('stageProgress', () => {
    test('is a 1-based count for the six-segment bar', () => {
        expect(stageProgress('preparing')).toBe(1)
        expect(stageProgress('completed')).toBe(6)
    })
})
