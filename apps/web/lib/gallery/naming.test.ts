import { describe, test, expect } from 'vitest'
import { findByOperationKey, fullKey, operationDisplayName, splitOperation, strippedKey } from './naming'

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

describe('operationDisplayName', () => {
    /* A number in a folder name is a storage detail, and every surface that
       fell back to the raw folder printed it: the J5 media table, the
       inspector, the viewer and the public facet rail all showed
       "15. Op Black Hills" for a migrated item that has no opLabel. */
    test('strips the order prefix off the raw folder fallback', () => {
        expect(operationDisplayName(null, '15. Op Black Hills')).toBe('Op Black Hills')
        expect(operationDisplayName(undefined, '9. Op Copper Ridge (Lanze Verde)'))
            .toBe('Op Copper Ridge (Lanze Verde)')
    })

    /* opLabel is ALREADY the stripped form — every producer writes it as
       splitOperation(folder).label — so re-splitting it would be a second bite
       at a name that has none left to give, and would eat the leading digits
       of an operation that legitimately starts with one. */
    test('returns opLabel untouched rather than splitting it twice', () => {
        expect(operationDisplayName('Op Black Hills', '15. Op Black Hills')).toBe('Op Black Hills')
        expect(operationDisplayName('1st Recon Sweep', null)).toBe('1st Recon Sweep')
    })

    test('an empty label falls through to the folder, and no name at all is null', () => {
        expect(operationDisplayName('', 'Op Unnumbered')).toBe('Op Unnumbered')
        expect(operationDisplayName(null, null)).toBeNull()
        expect(operationDisplayName(undefined, undefined)).toBeNull()
    })
})

/**
 * The two-tier folder-to-operation match. Both folder names below are real:
 * "9. Op Copper Ridge (Lanze Verde)" and "12. MW Training (CAG)" are the only
 * two in the archive carrying a trailing parenthetical, and both sit beside
 * operations whose own titles do not repeat it.
 */
describe('fullKey / strippedKey', () => {
    test('the full key keeps a trailing parenthetical and the stripped key drops it', () => {
        expect(fullKey('Op Copper Ridge (Lanze Verde)')).toBe('copper ridge lanze verde')
        expect(strippedKey('Op Copper Ridge (Lanze Verde)')).toBe('copper ridge')
    })

    test('the two keys agree when there is no parenthetical to drop', () => {
        expect(fullKey('OPERATION Copper Ridge \u2014 Sat')).toBe('copper ridge')
        expect(strippedKey('OPERATION Copper Ridge \u2014 Sat')).toBe('copper ridge')
    })

    test('only a TRAILING parenthetical is dropped', () => {
        // Mid-string parentheses are part of the name, not a qualifier.
        expect(strippedKey('Op (Night) Assault')).toBe('night assault')
    })
})

describe('findByOperationKey', () => {
    const title = (t: string) => t

    // Why the tiers are ordered rather than merged: these two operations both
    // exist, and an unconditional strip puts the folder on whichever sorted
    // first.
    test('prefers the candidate carrying the same parenthetical', () => {
        const ops = ['OPERATION Copper Ridge \u2014 Sat', 'OPERATION Copper Ridge (Lanze Verde) \u2014 Sat']
        expect(findByOperationKey('Op Copper Ridge (Lanze Verde)', ops, title))
            .toBe('OPERATION Copper Ridge (Lanze Verde) \u2014 Sat')
        expect(findByOperationKey('Op Copper Ridge', ops, title))
            .toBe('OPERATION Copper Ridge \u2014 Sat')
    })

    // The case the migration already handled and the other two matchers did
    // not: nothing repeats the folder's parenthetical, so the loose key is the
    // only thing that can link them.
    test('falls back to the stripped key when no candidate repeats the parenthetical', () => {
        expect(findByOperationKey('Op Copper Ridge (Lanze Verde)', ['OPERATION Copper Ridge \u2014 Sun'], title))
            .toBe('OPERATION Copper Ridge \u2014 Sun')
        expect(findByOperationKey('MW Training (CAG)', ['MW Training'], title))
            .toBe('MW Training')
    })

    // The full tier is swept across every candidate before the stripped tier
    // is tried at all — a per-candidate "full or stripped" test would let this
    // return the first entry.
    test('an exact match later in the list beats a loose match earlier in it', () => {
        const ops = ['OPERATION Copper Ridge', 'OPERATION Copper Ridge (Lanze Verde)']
        expect(findByOperationKey('Op Copper Ridge (Lanze Verde)', ops, title))
            .toBe('OPERATION Copper Ridge (Lanze Verde)')
    })

    test('no candidate matches at all', () => {
        expect(findByOperationKey('Op Nothing Like It', ['OPERATION Copper Ridge'], title)).toBeUndefined()
    })
})
