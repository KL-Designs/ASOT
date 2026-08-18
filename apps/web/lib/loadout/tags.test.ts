/**
 * Tags arrive from a JSON body and are then used as `Record` lookups when
 * chips are rendered on a public page, so an unrecognised or hostile value has
 * to be dropped at the door rather than stored.
 */
import { describe, test, expect } from 'vitest'
import {
    KIT_TAGS, KIT_TAG_KEYS, KIT_TAG_LABELS, KIT_TAG_GROUPS,
    MAX_KIT_TAGS, isKitTag, normaliseTags,
} from './tags'

describe('kit tags', () => {
    test('every tag has a label and every key is unique', () => {
        expect(new Set(KIT_TAG_KEYS).size).toBe(KIT_TAG_KEYS.length)
        for (const key of KIT_TAG_KEYS) {
            expect(typeof KIT_TAG_LABELS[key]).toBe('string')
            expect(KIT_TAG_LABELS[key].length).toBeGreaterThan(0)
        }
    })

    test('every tag appears in exactly one group', () => {
        const grouped = KIT_TAG_GROUPS.flatMap(g => g.tags)
        expect(grouped.slice().sort()).toEqual(KIT_TAG_KEYS.slice().sort())
        expect(new Set(grouped).size).toBe(grouped.length)
    })

    test('the vocabulary covers the roles the unit actually fields', () => {
        for (const key of ['staff', 'medical', 'mg', 'lmg', 'mat'] as const) {
            expect(KIT_TAG_KEYS).toContain(key)
        }
        expect(KIT_TAGS.length).toBeGreaterThanOrEqual(20)
    })

    test('accepts a real key and rejects everything else', () => {
        expect(isKitTag('medical')).toBe(true)
        expect(isKitTag('Medical')).toBe(false)
        expect(isKitTag('not-a-tag')).toBe(false)
        expect(isKitTag('__proto__')).toBe(false)
        expect(isKitTag('constructor')).toBe(false)
        expect(isKitTag(3)).toBe(false)
        expect(isKitTag(null)).toBe(false)
    })

    test('normalises a good list', () => {
        expect(normaliseTags(['medical', 'night'])).toEqual(['medical', 'night'])
    })

    test('drops unknown values and non-strings', () => {
        expect(normaliseTags(['medical', 'nope', 7, null, { key: 'mg' }])).toEqual(['medical'])
    })

    test('de-duplicates', () => {
        expect(normaliseTags(['mg', 'mg', 'mg'])).toEqual(['mg'])
    })

    test('caps at MAX_KIT_TAGS', () => {
        const many = normaliseTags(['staff', 'medical', 'mg', 'lmg', 'mat', 'night'])
        expect(many).toHaveLength(MAX_KIT_TAGS)
    })

    test('returns declared order regardless of input order', () => {
        const forwards = normaliseTags(['medical', 'mg'])
        const backwards = normaliseTags(['mg', 'medical'])
        expect(forwards).toEqual(backwards)
        expect(forwards).toEqual(['medical', 'mg'])
    })

    test('survives input that is not an array', () => {
        expect(normaliseTags(undefined)).toEqual([])
        expect(normaliseTags(null)).toEqual([])
        expect(normaliseTags('medical')).toEqual([])
        expect(normaliseTags({ 0: 'medical' })).toEqual([])
    })
})
