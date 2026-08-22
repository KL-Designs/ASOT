/**
 * Feeds the status bar's "1,240 words · 6 sections". Takes a plain
 * ProseMirror JSON document so it never needs a live editor to test.
 */
import { describe, test, expect } from 'vitest'
import { docStats } from './doc-stats'

const doc = {
    type: 'doc',
    content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Situation' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Enemy forces hold the compound.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Mission' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Seize and hold.' }] },
    ],
}

describe('docStats', () => {
    test('counts words across every text node, headings included', () => {
        // Situation(1) + 5 + Mission(1) + 3
        expect(docStats(doc).words).toBe(10)
    })

    test('counts headings as sections', () => {
        expect(docStats(doc).sections).toBe(2)
    })

    test('collapses runs of whitespace rather than counting empties', () => {
        const d = { type: 'doc', content: [
            { type: 'paragraph', content: [{ type: 'text', text: '  spaced   out  ' }] },
        ] }
        expect(docStats(d).words).toBe(2)
    })

    test('returns zeroes for null, so the status bar renders before the doc loads', () => {
        expect(docStats(null)).toEqual({ words: 0, sections: 0 })
        expect(docStats(undefined)).toEqual({ words: 0, sections: 0 })
    })

    test('walks nested content such as lists and blockquotes', () => {
        const d = { type: 'doc', content: [
            { type: 'bulletList', content: [
                { type: 'listItem', content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'one two three' }] },
                ] },
            ] },
        ] }
        expect(docStats(d).words).toBe(3)
    })
})
