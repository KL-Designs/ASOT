import { describe, expect, test } from 'vitest'
import {
    DEFAULT_POSTAGE_OWNER_ID, addedAwards, awardList, buildPostageDM, canManagePostage, carryOver, isPhysicalAward,
    monthKey, monthLabel, sanitisePostageConfig, withPostageDefaults,
} from './award-postage'

describe('canManagePostage', () => {
    test('the owner and the OVERRIDE list only; J4 roles play no part', () => {
        expect(canManagePostage(DEFAULT_POSTAGE_OWNER_ID, {})).toBe(true)
        expect(canManagePostage('111', { OVERRIDE: '222, 111' })).toBe(true)
        expect(canManagePostage('333', { OVERRIDE: '222,111' })).toBe(false)
        expect(canManagePostage(undefined, {})).toBe(false)
    })
    test('the owner can be moved to another account', () => {
        expect(canManagePostage('999', { AWARD_POSTAGE_OWNER_ID: '999' })).toBe(true)
        expect(canManagePostage(DEFAULT_POSTAGE_OWNER_ID, { AWARD_POSTAGE_OWNER_ID: '999' })).toBe(false)
    })
})

describe('awards', () => {
    const config = withPostageDefaults(null)
    test('campaign medallions are excluded by default', () => {
        expect(isPhysicalAward({ name: 'Campaign Medallion, First Clasp' }, config)).toBe(false)
        expect(isPhysicalAward({ name: 'Atlas Award' }, config)).toBe(true)
        expect(isPhysicalAward({ name: 'Campaign Medallion' }, { includeCampaignMedals: true })).toBe(true)
    })
    test('added awards are matched on name and date', () => {
        const before = [{ name: 'A', date: '2026-01-01' }]
        const after = [{ name: 'A', date: '2026-01-01' }, { name: 'A', date: '2026-10-01' }, { name: 'B', date: '2026-10-01' }]
        expect(addedAwards(before, after).map(a => `${a.name} ${a.date}`)).toEqual(['A 2026-10-01', 'B 2026-10-01'])
    })
    test('award lists read naturally', () => {
        expect(awardList(['A'])).toBe('**A**')
        expect(awardList(['A', 'B', 'C', 'A'])).toBe('**A**, **B** and **C**')
    })
})

describe('months', () => {
    test('keys and labels', () => {
        expect(monthKey(new Date('2026-10-31T23:00:00Z'))).toBe('2026-10')
        expect(monthLabel('2026-08')).toMatch(/August 2026/)
    })
    test('open items carry forward, keeping the first month; sent ones stay put', () => {
        expect(carryOver({ month: '2026-08', status: 'ready' as const }, '2026-10')).toEqual({ month: '2026-10', carriedFrom: '2026-08', status: 'ready' })
        expect(carryOver({ month: '2026-09', carriedFrom: '2026-08', status: 'awaiting_preference' as const }, '2026-10'))
            .toEqual({ month: '2026-10', carriedFrom: '2026-08', status: 'awaiting_preference' })
        expect(carryOver({ month: '2026-08', status: 'sent' as const }, '2026-10')).toBeNull()
        expect(carryOver({ month: '2026-10', status: 'ready' as const }, '2026-10')).toBeNull()
    })
})

describe('the DM', () => {
    test('names the awards and carries Yes and No buttons', () => {
        const dm = buildPostageDM(withPostageDefaults({ imageUrl: '/cases.png' }), { name: 'Smith', awards: ['Atlas Award', 'Diplomat Award'], baseUrl: 'https://asot.test' })
        expect(dm.embeds[0].description).toContain('**Atlas Award** and **Diplomat Award**')
        expect(dm.embeds[0].image?.url).toBe('https://asot.test/cases.png')
        expect(dm.components[0].components.map(c => c.custom_id)).toEqual(['award_postage.yes', 'award_postage.no'])
    })
    test('config needs text and only keeps safe image links', () => {
        expect(sanitisePostageConfig({ dmBody: ' ' })).toHaveProperty('error')
        const r = sanitisePostageConfig({ dmBody: 'Hi', imageUrl: 'javascript:x' })
        expect('config' in r && r.config.imageUrl).toBe('')
    })
})
