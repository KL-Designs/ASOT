/**
 * The read view and the editor must agree on what a document is.
 *
 * They did not. `app/operations/[id]/doc-body.tsx` kept its own hand-written
 * extension list beside `contentExtensions()`, and the copy was missing
 * `TextStyle` and the `FontSize` attribute that rides on it. ProseMirror
 * refuses to parse a document carrying a mark its schema has never heard of, so
 * the moment an author set a font size anywhere in a section, the *entire*
 * section threw on load and the reader was told there was no document body —
 * over 40kB of live orders (Operation New Winter) sitting in Mongo unread.
 *
 * These assert against the schema `contentExtensions()` builds, at the parse
 * step `generateHTML` performs first and where the read view actually threw.
 * Not the HTML serialisation after it: that needs a DOM, and the failure was
 * never there. They would all have failed on the old list, which is the only
 * reason to write them.
 */
import { describe, test, expect } from 'vitest'
import { getSchema } from '@tiptap/core'
import { Node as PMNode } from 'prosemirror-model'
import { contentExtensions } from '@/components/editor/content-extensions'

const schema = getSchema(contentExtensions())

/** The first thing `generateHTML` does, and the line the read view died on. */
function parse(doc: unknown): PMNode {
    return PMNode.fromJSON(schema, doc)
}

const paragraph = (content: unknown[]) => ({ type: 'paragraph', attrs: { textAlign: null }, content })

describe('the read view parses what the editor writes', () => {
    test('text carrying a sized textStyle mark', () => {
        // The exact shape that broke: every text node in the section had one.
        const doc = parse({
            type: 'doc',
            content: [paragraph([{
                type: 'text',
                text: 'OPERATION NEW WINTER',
                marks: [
                    { type: 'textStyle', attrs: { fontSize: '18pt' } },
                    { type: 'bold', attrs: {} },
                    { type: 'underline', attrs: {} },
                ],
            }])],
        })

        expect(doc.textContent).toBe('OPERATION NEW WINTER')

        const marks = doc.firstChild!.firstChild!.marks
        const textStyle = marks.find(m => m.type.name === 'textStyle')
        expect(textStyle).toBeDefined()
        // The size has to survive, not just the mark — FontSize adds it as a
        // global attribute on textStyle, and losing it loses the formatting.
        expect(textStyle!.attrs.fontSize).toBe('18pt')
        expect(marks.map(m => m.type.name).sort()).toEqual(['bold', 'textStyle', 'underline'])
    })

    test('a bare textStyle mark with no size set', () => {
        const doc = parse({
            type: 'doc',
            content: [paragraph([{ type: 'text', text: 'plain', marks: [{ type: 'textStyle', attrs: {} }] }])],
        })
        expect(doc.textContent).toBe('plain')
        expect(doc.firstChild!.firstChild!.marks[0].attrs.fontSize).toBeNull()
    })

    test('an image with the editor’s own sizing and border attributes', () => {
        // ResizableImage's attributes are schema, so they belong in the shared
        // list — the read view parses images the editor wrote.
        const doc = parse({
            type: 'doc',
            content: [{
                type: 'image',
                attrs: {
                    src: '/api/operations/image?id=1',
                    alt: null,
                    title: null,
                    width: 420,
                    align: 'center',
                    position: 'break',
                    borderStyle: 'solid',
                    borderColor: '#ffffff',
                    borderWidth: 2,
                },
            }],
        })

        const img = doc.firstChild!
        expect(img.type.name).toBe('image')
        expect(img.attrs.src).toBe('/api/operations/image?id=1')
        expect(img.attrs.width).toBe(420)
        expect(img.attrs.align).toBe('center')
        expect(img.attrs.borderStyle).toBe('solid')
    })

    test('the marks and nodes the archive is actually built from', () => {
        const doc = parse({
            type: 'doc',
            content: [
                { type: 'heading', attrs: { level: 2, textAlign: null }, content: [{ type: 'text', text: 'Mission' }] },
                paragraph([
                    { type: 'text', text: 'seize ', marks: [{ type: 'bold' }] },
                    { type: 'text', text: 'the quarry', marks: [{ type: 'italic' }] },
                    { type: 'hardBreak' },
                    { type: 'text', text: '029 871', marks: [{ type: 'code' }] },
                    { type: 'text', text: 'hilite', marks: [{ type: 'highlight' }] },
                    { type: 'text', text: 'ref', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
                    { type: 'text', text: 'struck', marks: [{ type: 'strike' }] },
                ]),
                {
                    type: 'bulletList',
                    content: [{ type: 'listItem', content: [paragraph([{ type: 'text', text: '1-1 Platoon' }])] }],
                },
                { type: 'blockquote', content: [paragraph([{ type: 'text', text: 'Assume nothing.' }])] },
                { type: 'horizontalRule' },
            ],
        })

        expect(doc.textContent).toContain('Mission')
        expect(doc.textContent).toContain('1-1 Platoon')
        expect(doc.textContent).toContain('Assume nothing.')

        const seen = new Set<string>()
        doc.descendants(node => { seen.add(node.type.name); node.marks.forEach(m => seen.add(m.type.name)) })
        for (const name of [
            'heading', 'paragraph', 'hardBreak', 'bulletList', 'listItem', 'blockquote', 'horizontalRule',
            'bold', 'italic', 'code', 'highlight', 'link', 'strike',
        ]) {
            expect(seen).toContain(name)
        }
    })

    test('a mark genuinely outside the schema still throws', () => {
        // The guard on the guard: if this stopped throwing, everything above
        // would pass against a schema that silently accepts anything.
        expect(() => parse({
            type: 'doc',
            content: [paragraph([{ type: 'text', text: 'x', marks: [{ type: 'notARealMark' }] }])],
        })).toThrow()
    })
})
