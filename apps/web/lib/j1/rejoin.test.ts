import { describe, expect, test } from 'vitest'
import { defaultRejoinStatus, dischargeLevel, isRejoinStatus, worseLevel } from './rejoin'

describe('dischargeLevel', () => {
    test('reads the site\'s own discharge types — the bug this replaces', () => {
        expect(dischargeLevel('honorable')).toBe('HD')
        expect(dischargeLevel('general')).toBe('GD')
        expect(dischargeLevel('dishonorable')).toBe('DD')
    })

    test('still reads the master sheet\'s abbreviations', () => {
        expect(dischargeLevel('HD')).toBe('HD')
        expect(dischargeLevel(' gd ')).toBe('GD')
        expect(dischargeLevel('dd')).toBe('DD')
    })

    test('reads either spelling of honourable', () => {
        expect(dischargeLevel('Honourable')).toBe('HD')
        expect(dischargeLevel('Dishonourable')).toBe('DD')
    })

    test('an unknown or missing type is to be reviewed', () => {
        expect(dischargeLevel(undefined)).toBe('GD')
        expect(dischargeLevel('')).toBe('GD')
        expect(dischargeLevel('medical')).toBe('GD')
    })

    test('a rejoin status set by J4 wins over the type, in both directions', () => {
        expect(dischargeLevel('general', 'welcome')).toBe('HD')
        expect(dischargeLevel('honorable', 'not_welcome')).toBe('DD')
        expect(dischargeLevel('dishonorable', 'review')).toBe('GD')
    })

    test('a junk rejoin status is ignored rather than trusted', () => {
        expect(dischargeLevel('honorable', 'maybe')).toBe('HD')
    })
})

describe('defaultRejoinStatus', () => {
    test('follows the discharge type', () => {
        expect(defaultRejoinStatus('honorable')).toBe('welcome')
        expect(defaultRejoinStatus('general')).toBe('review')
        expect(defaultRejoinStatus('dishonorable')).toBe('not_welcome')
    })
})

describe('worseLevel', () => {
    test('keeps the more cautious outcome', () => {
        expect(worseLevel('CLEAR', 'HD')).toBe('HD')
        expect(worseLevel('DD', 'HD')).toBe('DD')
        expect(worseLevel('GD', 'DD')).toBe('DD')
        expect(worseLevel('GD', 'GD')).toBe('GD')
    })
})

describe('isRejoinStatus', () => {
    test('accepts the three statuses only', () => {
        expect(isRejoinStatus('welcome')).toBe(true)
        expect(isRejoinStatus('review')).toBe(true)
        expect(isRejoinStatus('not_welcome')).toBe(true)
        expect(isRejoinStatus('HD')).toBe(false)
        expect(isRejoinStatus(null)).toBe(false)
    })
})
