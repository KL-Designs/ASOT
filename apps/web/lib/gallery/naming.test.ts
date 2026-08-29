import { describe, test, expect } from 'vitest'
import { splitOperation } from './naming'

describe('splitOperation', () => {
    test('strips a numeric prefix and keeps it for sorting', () => {
        expect(splitOperation('1. Op Black Hill')).toEqual({ label: 'Op Black Hill', order: 1 })
    })

    test('accepts the separators that actually appear in storage', () => {
        for (const folder of ['9) Op Copper Ridge', '9 - Op Copper Ridge', '9 Op Copper Ridge', '9. Op Copper Ridge']) {
            expect(splitOperation(folder), folder).toEqual({ label: 'Op Copper Ridge', order: 9 })
        }
    })

    test('keeps parenthesised codenames intact', () => {
        expect(splitOperation('9. Op Copper Ridge (Lanze Verde)'))
            .toEqual({ label: 'Op Copper Ridge (Lanze Verde)', order: 9 })
    })

    test('an unnumbered folder sorts last rather than first', () => {
        // MAX_SAFE_INTEGER, not 0 — an unnumbered folder is "unknown position",
        // and putting it at the top would misrepresent it as the first operation.
        const { label, order } = splitOperation('Op Unnumbered')
        expect(label).toBe('Op Unnumbered')
        expect(order).toBe(Number.MAX_SAFE_INTEGER)
    })

    test('a folder that is only a number keeps its own name as the label', () => {
        expect(splitOperation('12')).toEqual({ label: '12', order: 12 })
    })

    test('trims surrounding whitespace', () => {
        expect(splitOperation('  3.  Op Ash  ')).toEqual({ label: 'Op Ash', order: 3 })
    })
})
