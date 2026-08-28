/**
 * The dev-only template document.
 *
 * The thing worth testing here is not the prose — it is that every node and
 * mark the content uses actually exists in the editor's schema. ProseMirror
 * drops what it does not recognise without complaining, so a typo in a mark
 * name produces a document that loads fine and is quietly missing half its
 * formatting. That failure is invisible by eye and obvious to a schema check.
 */
import { describe, test, expect } from 'vitest'
import * as Y from 'yjs'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import {
    applyTemplateDocument, buildTemplateDocument, templateSchema, type TemplateNode,
} from './template-document'

const pages = buildTemplateDocument()
const sections = pages.flatMap(page => page.sections.map(s => ({ page: page.title, ...s })))

function walk(node: TemplateNode, visit: (n: TemplateNode) => void) {
    visit(node)
    for (const child of node.content ?? []) walk(child, visit)
}

/** Every node and mark type reachable from a node, as two sorted lists. */
function typesIn(root: TemplateNode) {
    const nodes = new Set<string>()
    const marks = new Set<string>()
    walk(root, n => {
        nodes.add(n.type)
        for (const m of n.marks ?? []) marks.add(m.type)
    })
    return { nodes: [...nodes].sort(), marks: [...marks].sort() }
}

/** The same, across every section of every page. */
function collect() {
    const all = sections.map(s => typesIn(s.content))
    return {
        nodes: new Set(all.flatMap(x => x.nodes)),
        marks: new Set(all.flatMap(x => x.marks)),
    }
}

/** Deterministic ids, so a failing assertion names a key rather than a nonce. */
function ids() {
    let n = 0
    return () => `id${++n}`
}

describe('buildTemplateDocument', () => {
    test('every section validates against the editor’s own schema', () => {
        const schema = templateSchema()
        for (const section of sections) {
            expect(
                () => schema.nodeFromJSON(section.content).check(),
                `${section.page} › ${section.title}`,
            ).not.toThrow()
        }
    })

    test('no mark is silently dropped on the way through the schema', () => {
        // `nodeFromJSON` throws on an unknown node but merely discards an
        // unknown *mark*, so validity alone does not prove the marks survived.
        // Comparing the JSON wholesale would not work either: the schema fills
        // in default attributes (`textAlign: null` on every block), which is
        // normalisation, not loss. What has to match is the set of types.
        const schema = templateSchema()
        for (const section of sections) {
            const after = schema.nodeFromJSON(section.content).toJSON() as TemplateNode
            expect(typesIn(after), `${section.page} › ${section.title}`)
                .toEqual(typesIn(section.content))
        }
    })

    test('uses every node the schema defines, so the whole editor is exercised', () => {
        const { nodes } = collect()
        const defined = Object.keys(templateSchema().nodes)
            // `text` is implicit and `doc` is the wrapper — neither is content
            // anybody can look at.
            //
            // `image` joined the shared schema when the read view started using
            // it (see doc-schema.test.ts), and the template cannot honestly
            // cover it: an image node needs a `src` pointing at a real uploaded
            // file, and this generator writes into a Y.Doc without touching
            // storage. A fabricated URL would put a broken image in every dev
            // document, which is worse than the gap it closes.
            .filter(n => n !== 'text' && n !== 'doc' && n !== 'image')
        expect([...defined].sort().filter(n => !nodes.has(n))).toEqual([])
    })

    test('uses every mark the schema defines', () => {
        const { marks } = collect()
        expect(Object.keys(templateSchema().marks).filter(m => !marks.has(m))).toEqual([])
    })

    test('includes a staff-only section, which is what the public page must hide', () => {
        expect(sections.some(s => s.isPublic === false)).toBe(true)
    })

    test('the first page is the operation’s own orders page', () => {
        // applyTemplateDocument appends this one to `main` rather than creating
        // a page for it; a reorder here would silently create a second orders page.
        expect(pages[0].pageType).toBe('orders')
    })
})

describe('applyTemplateDocument', () => {
    test('appends the main page’s sections and adds the rest as pages', () => {
        const ydoc = new Y.Doc()
        const result = applyTemplateDocument(ydoc, { newId: ids() })

        expect(result.pages).toBe(pages.length - 1)
        expect(result.sections).toBe(sections.length)
        expect(ydoc.getArray<string>('sectionOrder').length).toBe(pages[0].sections.length)
        // main + one per extra page
        expect(ydoc.getArray<string>('pageOrder').length).toBe(pages.length)
    })

    test('registers main in pageOrder, so adding pages does not hide the orders page', () => {
        const ydoc = new Y.Doc()
        applyTemplateDocument(ydoc, { newId: ids() })
        expect(ydoc.getArray<string>('pageOrder').toArray()).toContain('main')
        expect(ydoc.getMap<string>('pmeta-main').get('title')).toBe('CHQ Orders')
    })

    test('writes section meta where the editor reads it', () => {
        const ydoc = new Y.Doc()
        applyTemplateDocument(ydoc, { newId: ids() })

        const first = ydoc.getArray<string>('sectionOrder').get(0)
        expect(ydoc.getMap<string>(`smeta-${first}`).get('title')).toBe(pages[0].sections[0].title)

        const staffOnly = pages[0].sections.findIndex(s => s.isPublic === false)
        const staffId = ydoc.getArray<string>('sectionOrder').get(staffOnly)
        expect(ydoc.getMap<string>(`smeta-${staffId}`).get('isPublic')).toBe('false')
    })

    test('a non-main page keeps its own prefixed keys', () => {
        const ydoc = new Y.Doc()
        applyTemplateDocument(ydoc, { newId: ids() })

        const pageId = ydoc.getArray<string>('pageOrder').toArray().find(id => id !== 'main')!
        expect(ydoc.getMap<string>(`pmeta-${pageId}`).get('pageType')).toBe(pages[1].pageType)

        const order = ydoc.getArray<string>(`sectionOrder-${pageId}`)
        expect(order.length).toBe(pages[1].sections.length)
        expect(ydoc.getMap<string>(`smeta-${pageId}-${order.get(0)}`).get('title'))
            .toBe(pages[1].sections[0].title)
    })

    test('content round-trips back out of the Y.Doc unchanged', () => {
        const ydoc = new Y.Doc()
        applyTemplateDocument(ydoc, { newId: ids() })
        const schema = templateSchema()

        // Compared as ProseMirror nodes rather than as JSON: `.eq` ignores the
        // ordering and default-attribute noise the two paths normalise
        // differently, and compares the document itself.
        ydoc.getArray<string>('sectionOrder').toArray().forEach((id, i) => {
            const back = schema.nodeFromJSON(
                yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(`scontent-${id}`)),
            )
            const original = schema.nodeFromJSON(pages[0].sections[i].content)
            expect(back.eq(original), pages[0].sections[i].title).toBe(true)
        })
    })

    test('appends rather than replacing — it runs against documents people are in', () => {
        const ydoc = new Y.Doc()
        ydoc.getArray<string>('sectionOrder').push(['existing'])
        ydoc.getMap<string>('smeta-existing').set('title', 'Somebody’s work')

        applyTemplateDocument(ydoc, { newId: ids() })

        expect(ydoc.getArray<string>('sectionOrder').get(0)).toBe('existing')
        expect(ydoc.getMap<string>('smeta-existing').get('title')).toBe('Somebody’s work')
    })

    test('lands as one transaction, so peers see the document arrive whole', () => {
        const ydoc = new Y.Doc()
        let updates = 0
        ydoc.on('update', () => { updates++ })
        applyTemplateDocument(ydoc, { newId: ids() })
        expect(updates).toBe(1)
    })
})
