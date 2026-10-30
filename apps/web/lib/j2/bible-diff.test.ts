import { describe, expect, test } from 'vitest'
import { changesOnly, diffBlocks, diffWords, htmlToBlocks, similarity, summariseDiff } from './bible-diff'

describe('htmlToBlocks', () => {
    test('reads headings, paragraphs and list items in order', () => {
        expect(htmlToBlocks('<h1>Rules</h1><p>Be <strong>clear</strong>.</p><ul><li>One</li><li>Two</li></ul>')).toEqual([
            { tag: 'h1', text: 'Rules' },
            { tag: 'p', text: 'Be clear.' },
            { tag: 'li', text: 'One' },
            { tag: 'li', text: 'Two' },
        ])
    })

    test('decodes entities and collapses whitespace', () => {
        expect(htmlToBlocks('<p>Tom &amp; Jerry&nbsp;&nbsp;said\n &quot;no&quot;</p>')).toEqual([
            { tag: 'p', text: 'Tom & Jerry said "no"' },
        ])
    })

    test('drops empty blocks', () => {
        expect(htmlToBlocks('<p></p><p><br></p><p>Kept</p>')).toEqual([{ tag: 'p', text: 'Kept' }])
    })

    test('a list item that wraps a paragraph is counted once', () => {
        expect(htmlToBlocks('<ul><li><p>Wrapped</p></li></ul>')).toEqual([{ tag: 'p', text: 'Wrapped' }])
    })
})

describe('diffWords', () => {
    test('marks the words that changed and joins the runs', () => {
        expect(diffWords('Brief the section before stepping off', 'Brief the whole platoon before stepping off')).toEqual([
            { op: 'same', text: 'Brief the' },
            { op: 'removed', text: 'section' },
            { op: 'added', text: 'whole platoon' },
            { op: 'same', text: 'before stepping off' },
        ])
    })
})

describe('similarity', () => {
    test('is 1 for the same words and 0 for none in common', () => {
        expect(similarity('a b c', 'a b c')).toBe(1)
        expect(similarity('a b c', 'x y z')).toBe(0)
        expect(similarity('', 'x')).toBe(0)
    })
})

describe('diffBlocks', () => {
    const v1 = htmlToBlocks('<h1>Intel</h1><p>Deliver intel before the mission.</p><p>Keep it short.</p>')

    test('identical versions are all the same', () => {
        expect(diffBlocks(v1, v1).every(c => c.op === 'same')).toBe(true)
    })

    test('a new paragraph is an addition, in its place', () => {
        const v2 = htmlToBlocks('<h1>Intel</h1><p>Deliver intel before the mission.</p><p>Name your sources.</p><p>Keep it short.</p>')
        expect(diffBlocks(v1, v2).map(c => c.op)).toEqual(['same', 'same', 'added', 'same'])
    })

    test('a deleted paragraph is a removal', () => {
        const v2 = htmlToBlocks('<h1>Intel</h1><p>Keep it short.</p>')
        const changes = diffBlocks(v1, v2)
        expect(changes.map(c => c.op)).toEqual(['same', 'removed', 'same'])
        expect(changes[1].text).toBe('Deliver intel before the mission.')
    })

    test('a reworded paragraph is one change, with its words marked', () => {
        const v2 = htmlToBlocks('<h1>Intel</h1><p>Deliver intel well before the mission.</p><p>Keep it short.</p>')
        const changes = diffBlocks(v1, v2)
        expect(changes.map(c => c.op)).toEqual(['same', 'changed', 'same'])
        const changed = changes[1]
        expect(changed.op === 'changed' && changed.parts.some(p => p.op === 'added' && p.text === 'well')).toBe(true)
    })

    test('a paragraph replaced by an unrelated one is a removal and an addition', () => {
        const v2 = htmlToBlocks('<h1>Intel</h1><p>Zeus owns the radio net.</p><p>Keep it short.</p>')
        expect(diffBlocks(v1, v2).map(c => c.op)).toEqual(['same', 'removed', 'added', 'same'])
    })

    test('summariseDiff counts each kind', () => {
        const v2 = htmlToBlocks('<h1>Intel</h1><p>Deliver intel well before the mission.</p><p>New rule entirely here.</p>')
        expect(summariseDiff(diffBlocks(v1, v2))).toEqual({ added: 1, removed: 1, changed: 1 })
    })
})

describe('changesOnly', () => {
    test('keeps the changes and the heading each sits under', () => {
        const before = htmlToBlocks('<h1>Intel</h1><p>One.</p><h1>Zeus</h1><p>Two.</p>')
        const after = htmlToBlocks('<h1>Intel</h1><p>One.</p><h1>Zeus</h1><p>Two.</p><p>Brand new rule.</p>')
        expect(changesOnly(diffBlocks(before, after)).map(c => `${c.op}:${c.text}`)).toEqual([
            'same:Zeus', 'added:Brand new rule.',
        ])
    })

    test('is empty when nothing changed', () => {
        const blocks = htmlToBlocks('<h1>Intel</h1><p>One.</p>')
        expect(changesOnly(diffBlocks(blocks, blocks))).toEqual([])
    })
})
