import { Extension, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'

/**
 * The schema-defining half of the operation editor's extension list.
 *
 * Split out of CollabEditor so anything that needs to *produce* content for
 * that editor can build the same schema, rather than a lookalike that drifts.
 * A node or mark this list doesn't know about is silently dropped when the
 * document loads, which fails quietly and looks like data loss — so the mock
 * document generator's tests validate against this exact list.
 *
 * "Anything that needs to produce content" now includes anything that needs to
 * *render* it: `app/operations/[id]/doc-body.tsx` builds the read view's HTML
 * from this list. It used to keep a hand-written lookalike, and the lookalike
 * was missing `TextStyle`/`FontSize` — so any section whose author had touched
 * a font size threw on load and showed "No document body yet" over content that
 * was sitting in the database the whole time.
 *
 * What is deliberately NOT here:
 *
 * - `Placeholder`, `GlobalDragHandle`, `Collaboration`, the cursor plugin —
 *   none define nodes or marks. They are per-instance behaviour and stay with
 *   the editor that mounts them.
 *
 * Returns a fresh array per call rather than a shared const: these were
 * `.configure()`d inline per editor before, and every section mounts its own
 * editor. Handing the same objects to all of them is a behaviour change nobody
 * asked for.
 */
export const FontSize = Extension.create({
    name: 'fontSize',
    addGlobalAttributes() {
        return [{
            types: ['textStyle'],
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: (el: HTMLElement) => el.style.fontSize || null,
                    renderHTML: (attrs: Record<string, any>) =>
                        attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
                },
            },
        }]
    },
    addCommands() {
        return {
            setFontSize: (size: string) => ({ chain }: any) =>
                chain().setMark('textStyle', { fontSize: size }).run(),
            unsetFontSize: () => ({ chain }: any) =>
                chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        } as any
    },
})

/**
 * The image node's schema, without the React node view that draws it.
 *
 * Split from `ResizableImage` (CollabEditor.tsx) for the reason the list above
 * exists: the attributes are schema, and every consumer needs them to parse a
 * document containing an image, but only the editor needs the resize handles.
 * `ResizableImage` is now this plus `addNodeView()`.
 */
export const ContentImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: (el: HTMLElement) => {
                    const w = el.getAttribute('width') || el.style.width
                    return w ? (parseInt(w, 10) || null) : null
                },
                renderHTML: (attrs: Record<string, any>) =>
                    attrs.width ? { style: `width:${attrs.width}px`, width: attrs.width } : {},
            },
            align: {
                default: 'center',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-align') || 'center',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-align': attrs.align || 'center' }),
            },
            position: {
                default: 'break',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-position') || 'break',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-position': attrs.position || 'break' }),
            },
            borderStyle: {
                default: 'none',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-border-style') || 'none',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-border-style': attrs.borderStyle || 'none' }),
            },
            borderColor: {
                default: '#ffffff',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-border-color') || '#ffffff',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-border-color': attrs.borderColor || '#ffffff' }),
            },
            borderWidth: {
                default: 2,
                parseHTML: (el: HTMLElement) => parseInt(el.getAttribute('data-border-width') || '2'),
                renderHTML: (attrs: Record<string, any>) => ({ 'data-border-width': String(attrs.borderWidth ?? 2) }),
            },
            caption: {
                default: '',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-caption') || '',
                renderHTML: (attrs: Record<string, any>) => attrs.caption ? { 'data-caption': attrs.caption } : {},
            },
            captionPosition: {
                default: 'bottom-center',
                parseHTML: (el: HTMLElement) => {
                    const v = el.getAttribute('data-caption-position') || 'bottom-center'
                    if (v === 'below') return 'bottom-center'
                    if (v === 'above') return 'top-center'
                    return v
                },
                renderHTML: (attrs: Record<string, any>) => ({ 'data-caption-position': attrs.captionPosition || 'bottom-center' }),
            },
            captionAlign: {
                default: 'center',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-caption-align') || 'center',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-caption-align': attrs.captionAlign || 'center' }),
            },
            cropLeft: {
                default: 0,
                parseHTML: (el: HTMLElement) => parseFloat(el.getAttribute('data-crop-left') || '0'),
                renderHTML: (attrs: Record<string, any>) =>
                    attrs.cropLeft > 0 ? { 'data-crop-left': String(attrs.cropLeft) } : {},
            },
            cropTop: {
                default: 0,
                parseHTML: (el: HTMLElement) => parseFloat(el.getAttribute('data-crop-top') || '0'),
                renderHTML: (attrs: Record<string, any>) =>
                    attrs.cropTop > 0 ? { 'data-crop-top': String(attrs.cropTop) } : {},
            },
            cropRight: {
                default: 1,
                parseHTML: (el: HTMLElement) => {
                    const v = el.getAttribute('data-crop-right')
                    return v !== null ? parseFloat(v) : 1
                },
                renderHTML: (attrs: Record<string, any>) =>
                    attrs.cropRight < 1 ? { 'data-crop-right': String(attrs.cropRight) } : {},
            },
            cropBottom: {
                default: 1,
                parseHTML: (el: HTMLElement) => {
                    const v = el.getAttribute('data-crop-bottom')
                    return v !== null ? parseFloat(v) : 1
                },
                renderHTML: (attrs: Record<string, any>) =>
                    attrs.cropBottom < 1 ? { 'data-crop-bottom': String(attrs.cropBottom) } : {},
            },
        }
    },
})

/**
 * A flowchart: boxes and arrows, stored as data in one attribute.
 *
 * Schema only, for the reason `ContentImage` is: the read view has to parse a
 * document that contains one. What it renders to is a placeholder `<div>`
 * carrying the chart as JSON — the drawing is done by whoever shows it
 * (`FlowchartNodeView` in the editor, `DocBody` in the read view), both from
 * `lib/operations/flowchart.ts`, because an SVG laid out by dagre is not
 * something a ProseMirror `renderHTML` can describe.
 *
 * An atom: the editor treats it as one block, not as text to type into.
 */
export const ContentFlowchart = Node.create({
    name: 'flowchart',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            chart: {
                default: '{"nodes":[],"edges":[]}',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-flowchart') || '{"nodes":[],"edges":[]}',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-flowchart': attrs.chart }),
            },
            title: {
                default: '',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '',
                renderHTML: (attrs: Record<string, any>) => (attrs.title ? { 'data-title': attrs.title } : {}),
            },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-flowchart]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'op-flowchart' })]
    },
})

/**
 * The table node, extended with border and width attributes.
 *
 * Split from the raw Table extension so both the editor (which adds
 * `resizable: true` for column-drag handles) and the read view
 * (`doc-body.tsx`, which calls `generateHTML`) build against the same schema.
 * The three custom attributes emit CSS custom properties onto the `<table>`
 * element so that `td`/`th` border rules in globals.css can reference them
 * without needing inline styles per cell.
 *
 * `tableWidth` owns the full inline style for all three custom props, since
 * `renderHTML` receives every attribute and can compose the value from them.
 * `borderColor` and `borderWidth` only emit their own `data-*` attributes for
 * round-trip parsing.
 */
export const ContentTable = Table.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            borderColor: {
                default: '#4a5060',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-border-color') || '#4a5060',
                renderHTML: (attrs: Record<string, any>) => ({
                    'data-border-color': attrs.borderColor || '#4a5060',
                }),
            },
            borderWidth: {
                default: 1,
                parseHTML: (el: HTMLElement) => parseInt(el.getAttribute('data-border-width') || '1'),
                renderHTML: (attrs: Record<string, any>) => ({
                    'data-border-width': String(attrs.borderWidth ?? 1),
                }),
            },
            tableWidth: {
                default: '100%',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-table-width') || '100%',
                renderHTML: (attrs: Record<string, any>) => ({
                    'data-table-width': attrs.tableWidth || '100%',
                    style: `--tbl-bc:${attrs.borderColor || '#4a5060'};--tbl-bw:${attrs.borderWidth ?? 1}px;width:${attrs.tableWidth || '100%'}`,
                }),
            },
        }
    },
})

export { TableRow as ContentTableRow, TableCell as ContentTableCell, TableHeader as ContentTableHeader }

export function contentExtensions() {
    return [
        StarterKit.configure({ undoRedo: false }),
        ContentImage,
        ContentFlowchart,
        ContentTable.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Highlight.configure({ multicolor: true }),
        Underline,
        TextStyle,
        Color,
        FontSize,
        Link.configure({
            openOnClick: false,
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        }),
    ]
}
