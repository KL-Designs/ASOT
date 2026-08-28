/**
 * A filled-in operation document, for looking at.
 *
 * The operations editor is a lot of surface — multiple pages, sections that can
 * be staff-only, and a formatting toolbar with a dozen marks — and an empty
 * document exercises none of it. Neither does typing "test test test" into one
 * section, which is what actually happens when you need something on screen.
 * This produces a real one: five-paragraph orders across four pages, using
 * every node and mark the editor's schema defines.
 *
 * ## Why the content is built here rather than fetched
 *
 * It has to be applied on the client, into the live `Y.Doc`. Writing the
 * document server-side means writing `yjsState` in Mongo, and Hocuspocus only
 * reads that once, when the first client connects — so a server-side write
 * lands underneath whatever is already in memory and is then overwritten by
 * the next save. Applying it to the shared document instead is the same path
 * "+ Add Section" takes: it syncs to every connected viewer and persists
 * through the normal store.
 *
 * ## It appends, and never deletes
 *
 * This writes into a document other people may have open. A generator that
 * cleared the page first would be a one-click way to destroy somebody's work,
 * dev build or not, and appending gives exactly the same test surface. Click it
 * twice and you get the content twice, which is visible and undoable.
 */
import * as Y from 'yjs'
import { getSchema } from '@tiptap/core'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { contentExtensions } from '@/components/editor/content-extensions'

/** ProseMirror JSON, loosely typed — the schema is what actually validates it. */
export interface TemplateNode {
    type: string
    attrs?: Record<string, unknown>
    content?: TemplateNode[]
    marks?: { type: string; attrs?: Record<string, unknown> }[]
    text?: string
}

export interface TemplateSection {
    title: string
    /** Staff-only sections are the ones the public orders page must hide. */
    isPublic?: boolean
    /** The section body, as a ProseMirror `doc` node. */
    content: TemplateNode
}

export interface TemplatePage {
    title: string
    /** `main` is the operation's own orders page and always exists already. */
    pageType: 'orders' | 'zeus' | 'staff_orders' | 'aar'
    sections: TemplateSection[]
}

// ── Content helpers ───────────────────────────────────────────────────────────

type Mark = { type: string; attrs?: Record<string, unknown> }

const t = (text: string, ...marks: Mark[]): TemplateNode =>
    marks.length ? { type: 'text', text, marks } : { type: 'text', text }

const bold = { type: 'bold' }
const italic = { type: 'italic' }
const strike = { type: 'strike' }
const code = { type: 'code' }
const underline = { type: 'underline' }
const highlight = { type: 'highlight' }
const size = (px: string): Mark => ({ type: 'textStyle', attrs: { fontSize: px } })
const link = (href: string): Mark => ({ type: 'link', attrs: { href } })

const p = (...content: (string | TemplateNode)[]): TemplateNode => ({
    type: 'paragraph',
    content: content.map(c => (typeof c === 'string' ? t(c) : c)),
})

/** A paragraph with an alignment set — `textAlign` is an attribute, not a mark. */
const pAlign = (align: 'center' | 'right', ...content: (string | TemplateNode)[]): TemplateNode => ({
    ...p(...content),
    attrs: { textAlign: align },
})

const h = (level: number, text: string): TemplateNode => ({
    type: 'heading',
    attrs: { level },
    content: [t(text)],
})

const li = (...content: (string | TemplateNode)[]): TemplateNode => ({
    type: 'listItem',
    content: [p(...content)],
})

const ul = (...items: TemplateNode[]): TemplateNode => ({ type: 'bulletList', content: items })
const ol = (...items: TemplateNode[]): TemplateNode => ({ type: 'orderedList', attrs: { start: 1 }, content: items })
const quote = (...content: TemplateNode[]): TemplateNode => ({ type: 'blockquote', content })
const pre = (text: string): TemplateNode => ({
    type: 'codeBlock',
    attrs: { language: null },
    content: [t(text)],
})
const rule: TemplateNode = { type: 'horizontalRule' }
const br: TemplateNode = { type: 'hardBreak' }

const doc = (...content: TemplateNode[]): TemplateNode => ({ type: 'doc', content })

// ── The document ──────────────────────────────────────────────────────────────

/**
 * Deliberately covers every node and mark in `contentExtensions()`. A node the
 * schema does not know about is silently dropped on load, which reads as data
 * loss rather than a configuration mismatch — so the point of this content is
 * as much to prove the schema round-trips as to fill a page.
 */
export function buildTemplateDocument(): TemplatePage[] {
    return [
        {
            title: 'CHQ Orders',
            pageType: 'orders',
            sections: [
                {
                    title: 'Situation',
                    content: doc(
                        h(3, 'Ground'),
                        p(
                            'The area of operations is the ', t('Zaros valley', bold),
                            ', a north–south corridor between two ridgelines with a single sealed road running its length. Movement off the road is ',
                            t('slow and canalised', italic), '.',
                        ),
                        p(
                            t('Light is last at 1840L. ', size('18px')),
                            'Expect ', t('reduced visibility', highlight), ' for the second half of the operation.',
                        ),
                        h(3, 'Enemy Forces'),
                        ul(
                            li(t('Mechanised infantry company', bold), ' — dug in around the northern quarry.'),
                            li('Two BTR-70 in a fire support position, callsign ', t('HOSTILE-1', code), '.'),
                            li(t('Reported', strike), ' Confirmed mortar section, grid ', t('034 887', code), '.'),
                        ),
                        h(3, 'Friendly Forces'),
                        ul(
                            li('1-1 Platoon — main effort, assaulting the quarry.'),
                            li('1-2 Platoon — support by fire from the eastern ridge.'),
                            li('1-3 Support — engineers, medics and the AT section under CHQ control.'),
                        ),
                        quote(p(t('Assume nothing on the enemy dispositions above. It is 36 hours old.', italic))),
                    ),
                },
                {
                    title: 'Mission',
                    content: doc(
                        pAlign('center', t('India Company will seize the Zaros quarry NLT 2100L to deny the enemy observation over the valley road.', bold)),
                        rule,
                        p(t('Repeat: ', underline), 'seize the Zaros quarry NLT 2100L.'),
                    ),
                },
                {
                    title: 'Execution',
                    content: doc(
                        h(3, 'Concept of Operations'),
                        p('Three phases, sequential. No phase begins before the previous is confirmed complete on the company net.'),
                        ol(
                            li(t('Phase 1 — Move. ', bold), 'Company moves dismounted along the eastern treeline to the line of departure.'),
                            li(t('Phase 2 — Suppress. ', bold), '1-2 Platoon establishes the support-by-fire position and fixes the enemy.'),
                            li(t('Phase 3 — Assault. ', bold), '1-1 Platoon clears the quarry from the south, 1-3 in reserve.'),
                        ),
                        h(3, 'Coordinating Instructions'),
                        p(
                            'H-hour is ', t('1930L', code), '.', br,
                            'Line of departure is the culvert at ', t('029 871', code), '.',
                        ),
                        pre(
                            'PHASE LINES\n'
                            + '  LD      029 871\n'
                            + '  PL AMBER 031 878   (report crossing)\n'
                            + '  PL RED   034 884   (no fires beyond without CHQ)\n'
                            + '  OBJ      036 889',
                        ),
                    ),
                },
                {
                    title: 'Service Support',
                    content: doc(
                        ul(
                            li('Casualty collection point at the culvert, marked with a ', t('red cyalume', highlight), '.'),
                            li('Ammunition resupply held with 1-3, released on company net only.'),
                            li('One vehicle held in reserve for CASEVAC — it is not a taxi.'),
                        ),
                        pAlign('right', t('Rations and water are individual responsibility.', italic)),
                    ),
                },
                {
                    title: 'Command & Signal',
                    content: doc(
                        pre(
                            'COMMS PLAN\n'
                            + '  COMPANY    50.0 MHz  LR\n'
                            + '  1-1        51.0 MHz  SR\n'
                            + '  1-2        52.0 MHz  SR\n'
                            + '  1-3        53.0 MHz  SR\n'
                            + '  ZEUS       69.0 MHz  LR  (admin only)',
                        ),
                        p(
                            'Company commander moves with 1-1. Second in command with 1-2. Full signals annex on the ',
                            t('unit SOP page', link('https://asotmilsim.com/dashboard/sops')), '.',
                        ),
                        quote(p('No radio checks after H-hour unless something is broken.')),
                    ),
                },
                {
                    title: 'Annex A — Staff Only',
                    isPublic: false,
                    content: doc(
                        p(t('This section is staff-only and must not appear on the public orders page.', bold)),
                        ul(
                            li('Zeus will inject a counter-attack if the quarry falls before 2030L.'),
                            li('Hold the AT section back until the BTRs commit.'),
                        ),
                    ),
                },
            ],
        },
        {
            title: 'Zeus Control',
            pageType: 'zeus',
            sections: [
                {
                    title: 'Trigger Plan',
                    isPublic: false,
                    content: doc(
                        ol(
                            li(t('T1 ', code), '— on crossing PL AMBER, reveal the mortar section.'),
                            li(t('T2 ', code), '— on the first casualty, commit the BTRs.'),
                            li(t('T3 ', code), '— if the quarry falls early, counter-attack from the north.'),
                        ),
                        quote(p(t('Do not fire T3 after 2045L. The op ends on time.', bold))),
                    ),
                },
                {
                    title: 'Escalation',
                    isPublic: false,
                    content: doc(
                        p('If the company is stalled at the line of departure for more than twenty minutes, thin the enemy rather than extending the operation.'),
                    ),
                },
            ],
        },
        {
            title: '1-1 Platoon Orders',
            pageType: 'staff_orders',
            sections: [
                {
                    title: 'Platoon Mission',
                    content: doc(
                        p('1-1 Platoon will clear the Zaros quarry from the south in order to deny enemy observation over the valley road.'),
                        ul(
                            li('Alpha — lead, clears the southern face.'),
                            li('Bravo — follows, clears the buildings.'),
                            li('Charlie — cut-off on the eastern lip.'),
                        ),
                    ),
                },
            ],
        },
        {
            title: 'After Action Review',
            pageType: 'aar',
            sections: [
                {
                    title: 'Timeline',
                    content: doc(
                        pre(
                            '1930  LD crossed on time\n'
                            + '1948  Contact, southern face\n'
                            + '2012  First casualty, CCP established\n'
                            + '2054  Objective secure',
                        ),
                    ),
                },
                {
                    title: 'Sustain / Improve',
                    content: doc(
                        h(3, 'Sustain'),
                        ul(li('Movement to the line of departure was quiet and on time.')),
                        h(3, 'Improve'),
                        ul(li('Company net discipline collapsed during the assault.')),
                    ),
                },
            ],
        },
    ]
}

// ── Applying it ───────────────────────────────────────────────────────────────

/** The same id shape `CollabEditor.addSection` and `PageSidebar.addPage` use. */
function randomId(): string {
    return Math.random().toString(36).slice(2, 10)
}

/**
 * The document's own schema. Built from `contentExtensions()` so this validates
 * against exactly what the editor mounts, not a lookalike that drifts.
 */
export function templateSchema() {
    return getSchema(contentExtensions())
}

export interface ApplyResult {
    /** Pages added, not counting the existing main page it appended to. */
    pages: number
    sections: number
}

/**
 * Write the template into a live document.
 *
 * Mirrors the key layout `CollabEditor`/`PageSidebar` read: `pageOrder`,
 * `pmeta-{page}`, `sectionOrder[-{page}]`, `smeta-[{page}-]{section}` and the
 * `scontent-[{page}-]{section}` fragment. One transaction, so peers see the
 * whole document arrive at once rather than sections trickling in.
 */
export function applyTemplateDocument(
    ydoc: Y.Doc,
    opts: { newId?: () => string } = {},
): ApplyResult {
    const newId = opts.newId ?? randomId
    const schema = templateSchema()
    const [main, ...extra] = buildTemplateDocument()
    let sections = 0

    const addSections = (pageId: string, page: TemplatePage) => {
        const isMain = pageId === 'main'
        const order = ydoc.getArray<string>(isMain ? 'sectionOrder' : `sectionOrder-${pageId}`)
        for (const section of page.sections) {
            const id = newId()
            order.push([id])
            const smeta = ydoc.getMap<string>(isMain ? `smeta-${id}` : `smeta-${pageId}-${id}`)
            smeta.set('title', section.title)
            smeta.set('isPublic', section.isPublic === false ? 'false' : 'true')
            prosemirrorJSONToYXmlFragment(
                schema,
                section.content,
                ydoc.getXmlFragment(isMain ? `scontent-${id}` : `scontent-${pageId}-${id}`),
            )
            sections++
        }
    }

    ydoc.transact(() => {
        // `main` is implicit in a document nobody has added a page to yet —
        // PageSidebar registers it lazily. Register it here too, or appending a
        // page would make the orders page itself vanish from the rail.
        const pageOrder = ydoc.getArray<string>('pageOrder')
        if (!pageOrder.toArray().includes('main')) {
            pageOrder.push(['main'])
            ydoc.getMap<string>('pmeta-main').set('title', 'CHQ Orders')
        }

        addSections('main', main)

        for (const page of extra) {
            const pageId = newId()
            pageOrder.push([pageId])
            const pmeta = ydoc.getMap<string>(`pmeta-${pageId}`)
            pmeta.set('title', page.title)
            pmeta.set('isMain', 'false')
            pmeta.set('pageType', page.pageType)
            addSections(pageId, page)
        }
    })

    return { pages: extra.length, sections }
}
