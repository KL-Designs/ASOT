import { describe, expect, test } from 'vitest'
import {
    DEFAULT_STEPS, allStepsDone, buildInductionDM, doneSteps, inductionStatus, sanitiseInductionPack, withInductionDefaults,
} from './induction-pack'

const at = new Date('2026-11-01T09:00:00Z')

describe('defaults', () => {
    test('rows 348 to 350 are the first three steps', () => {
        expect(withInductionDefaults(null).steps.map(s => s.id)).toEqual(['attendance', 'orders', 'milpac'])
    })
    test('an emptied step list falls back to the defaults', () => {
        expect(withInductionDefaults({ steps: [] }).steps).toBe(DEFAULT_STEPS)
    })
})

describe('buildInductionDM', () => {
    test('fills the placeholders with absolute links and the Selection date', () => {
        const dm = buildInductionDM(withInductionDefaults(null), { name: 'Smith', selectionAt: at, baseUrl: 'https://asot.test/' })
        const text = dm.embeds[0].description
        expect(text).toContain('Welcome aboard, Smith.')
        expect(text).toContain('https://asot.test/me/induction')
        expect(text).toContain('https://asot.test/me/induction#selection')
        expect(text).toContain(`<t:${at.getTime() / 1000}:F>`)
    })
    test('no Selection scheduled says To be confirmed', () => {
        const dm = buildInductionDM(withInductionDefaults(null), { name: 'Smith', selectionAt: null, baseUrl: 'https://asot.test' })
        expect(dm.embeds[0].description).toContain('To be confirmed')
    })
})

describe('progress', () => {
    const config = withInductionDefaults(null)
    test('status moves sent, opened, in progress, completed', () => {
        expect(inductionStatus(null)).toBe('not_sent')
        expect(inductionStatus({ stepsDone: [] })).toBe('sent')
        expect(inductionStatus({ stepsDone: [], openedAt: at })).toBe('opened')
        expect(inductionStatus({ stepsDone: ['orders'], openedAt: at })).toBe('in_progress')
        expect(inductionStatus({ stepsDone: [], completedAt: at })).toBe('completed')
    })
    test('a removed step no longer counts, and order follows the induction', () => {
        const p = { stepsDone: ['milpac', 'gone', 'attendance'] }
        expect(doneSteps(config, p)).toEqual(['attendance', 'milpac'])
        expect(allStepsDone(config, p)).toBe(false)
        expect(allStepsDone(config, { stepsDone: ['milpac', 'orders', 'attendance'] })).toBe(true)
    })
})

describe('sanitiseInductionPack', () => {
    const base = { dmBody: 'Hi {name}', steps: [{ id: 'a', title: 'A', body: 'x' }] }
    test('accepts a valid config and drops unsafe links', () => {
        const r = sanitiseInductionPack({ ...base, links: [{ label: 'Bad', url: 'javascript:alert(1)' }, { label: 'Good', url: '/about' }] })
        expect('config' in r && r.config.links).toEqual([{ label: 'Good', url: '/about' }])
    })
    test('rejects duplicate step ids and an empty DM', () => {
        expect(sanitiseInductionPack({ ...base, steps: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }] })).toHaveProperty('error')
        expect(sanitiseInductionPack({ ...base, dmBody: '  ' })).toHaveProperty('error')
    })
})
