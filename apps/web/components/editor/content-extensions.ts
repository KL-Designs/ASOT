import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Table, TableView } from '@tiptap/extension-table'
import { columnResizingPluginKey } from 'prosemirror-tables'
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
                    parseHTML: (el: HTMLElement) => {
                        const raw = el.style.fontSize
                        if (!raw) return null
                        // Normalize pt → px (1pt = 96/72px at 96 DPI)
                        if (raw.endsWith('pt')) {
                            const pt = parseFloat(raw)
                            if (!isNaN(pt)) return `${Math.round(pt * 96 / 72)}px`
                        }
                        // Normalize em/rem → px (assume 16px base)
                        if (raw.endsWith('em')) {
                            const em = parseFloat(raw)
                            if (!isNaN(em)) return `${Math.round(em * 16)}px`
                        }
                        return raw
                    },
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
                    style: `--tbl-bc:${attrs.borderColor || '#4a5060'};--tbl-bw:${attrs.borderWidth ?? 1}px;width:${attrs.tableWidth || '100%'}${attrs.tableMinHeight ? `;min-height:${attrs.tableMinHeight}` : ''}`,
                }),
            },
            tableMinHeight: {
                default: '',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-table-min-height') || '',
                renderHTML: (attrs: Record<string, any>) => attrs.tableMinHeight
                    ? { 'data-table-min-height': attrs.tableMinHeight }
                    : {},
            },
        }
    },

})

// When resizable:true, TipTap's Table extension returns null from addNodeView() and
// delegates entirely to prosemirror-tables' columnResizing plugin, which registers its
// own nodeViews[table] entry directly. The only way to intercept that NodeView is to
// pass a custom View class.
//
// Two problems this subclass solves:
// 1. updateColumns() unconditionally overwrites table.style.width with a px total on
//    every NodeView update — fixed by overriding update() to restore the percentage.
// 2. displayColumnWidth() calls updateColumnsOnResize DIRECTLY on the DOM element
//    during a column drag, bypassing update() entirely — fixed with a MutationObserver
//    on table[style] that restores the percentage as a microtask (before paint).
class PatchedTableView extends TableView {
    private _observer: MutationObserver

    constructor(node: any, cellMinWidth: number, _view?: any, HTMLAttributes: Record<string, any> = {}) {
        super(node, cellMinWidth, _view, HTMLAttributes)
        this._applyDeclaredSize(node)

        // Intercept displayColumnWidth's direct DOM writes. It calls
        // updateColumnsOnResize(table, ...) without going through the NodeView,
        // setting table.style.width to a px total that makes the table shrink
        // visually during the drag. We restore the declared percentage here as a
        // microtask (MutationObserver fires before the browser paints).
        //
        // Only intercept absolute-px or empty-string widths — those come from
        // displayColumnWidth/updateColumnsOnResize. Percentage widths come from the
        // corner-handle live preview and must be left alone so horizontal drag works.
        this._observer = new MutationObserver(() => {
            const isAbsolute = this.table.style.width !== '' && !this.table.style.width.endsWith('%')
            if (isAbsolute || this.table.style.minWidth) {
                this.table.style.minWidth = ''
                this.table.style.width = this.node.attrs?.tableWidth || '100%'
            }
        })
        this._observer.observe(this.table, { attributes: true, attributeFilter: ['style'] })
    }

    override update(node: any): boolean {
        const result = super.update(node)
        if (result) this._applyDeclaredSize(node)
        return result
    }

    destroy() {
        this._observer.disconnect()
    }

    private _applyDeclaredSize(node: any) {
        this.table.style.minWidth = ''
        this.table.style.width = node.attrs?.tableWidth || '100%'
        this.table.style.minHeight = node.attrs?.tableMinHeight || ''
    }
}

export { TableRow as ContentTableRow, TableCell as ContentTableCell, TableHeader as ContentTableHeader }

function normalizeColorValue(raw: string): string | null {
    const v = raw.trim().toLowerCase()
    if (!v || v === 'transparent' || v === 'rgba(0,0,0,0)' || v === 'rgba(0, 0, 0, 0)') return null
    // Convert rgb(r, g, b) / rgba(r, g, b, a) to hex
    const rgba = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/)
    if (rgba) {
        const r = parseInt(rgba[1]).toString(16).padStart(2, '0')
        const g = parseInt(rgba[2]).toString(16).padStart(2, '0')
        const b = parseInt(rgba[3]).toString(16).padStart(2, '0')
        const hex = `#${r}${g}${b}`
        if (hex === '#ffffff' || hex === '#000000') return null
        return hex
    }
    if (v.startsWith('#')) return v
    return null
}

/**
 * Extends the base Highlight mark so pasted content with inline background-color
 * styles (from Word, Google Docs, etc.) also gets parsed as a highlight mark.
 * The base Highlight extension only matches <mark> elements.
 */
export const ContentHighlight = Highlight.extend({
    parseHTML() {
        return [
            ...(this.parent?.() ?? []),
            {
                style: 'background-color',
                getAttrs: (value: string | HTMLElement) => {
                    if (typeof value !== 'string') return false
                    const hex = normalizeColorValue(value)
                    if (!hex) return false
                    return { color: hex }
                },
            },
        ]
    },
})

/**
 * Adds a corner resize handle (bottom-right of each table) to resize the whole
 * table width. Dragging the handle gives a live percentage preview; releasing
 * commits a tableWidth attr change via a ProseMirror transaction.
 *
 * The outer edge lock (keeping the right border fixed during column drags) is
 * handled by ContentTable.addNodeView(), which patches the TableView update()
 * to re-apply the tableWidth percentage after prosemirror-tables' updateColumns()
 * overwrites it with a px total.
 */
export const ContentTableInteractions = Extension.create({
    name: 'tableInteractions',

    addProseMirrorPlugins() {
        const pluginKey = new PluginKey('tableInteractions')

        return [new Plugin({
            key: pluginKey,
            view(editorView: EditorView) {
                const handles = new Map<HTMLElement, HTMLElement>()

                // --- Corner handle position ---
                function placeHandle(wrapper: HTMLElement, handle: HTMLElement) {
                    const tbl = wrapper.querySelector('table') as HTMLTableElement | null
                    if (!tbl) return
                    handle.style.left = `${tbl.offsetLeft + tbl.offsetWidth - 14}px`
                    handle.style.top = `${tbl.offsetTop + tbl.offsetHeight - 14}px`
                }

                function attachToWrapper(wrapper: HTMLElement) {
                    if (handles.has(wrapper)) return
                    if (!wrapper.querySelector('table')) return

                    const handle = document.createElement('div')
                    handle.className = 'table-corner-resize'
                    wrapper.appendChild(handle)
                    handles.set(wrapper, handle)
                    placeHandle(wrapper, handle)

                    let startX = 0, startW = 0, containerW = 0
                    let startY = 0, startH = 0

                    function computeSizes(e: MouseEvent) {
                        const pct = Math.max(10, Math.min(100, Math.round((startW + e.clientX - startX) / containerW * 100)))
                        const newW = `${pct}%`
                        const dy = e.clientY - startY
                        const newH = dy > 0 ? `${Math.round(startH + dy)}px` : ''
                        return { newW, newH }
                    }

                    function onMove(e: MouseEvent) {
                        const tbl = wrapper.querySelector('table') as HTMLTableElement | null
                        if (!tbl) return
                        const { newW, newH } = computeSizes(e)
                        tbl.style.width = newW
                        tbl.style.minHeight = newH
                        placeHandle(wrapper, handle)
                    }

                    function onUp(e: MouseEvent) {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                        const tbl = wrapper.querySelector('table') as HTMLTableElement | null
                        if (!tbl) return
                        const { newW, newH } = computeSizes(e)
                        tbl.style.width = newW
                        tbl.style.minHeight = newH
                        placeHandle(wrapper, handle)

                        const { state } = editorView
                        const { doc, tr } = state
                        doc.descendants((node: any, pos: number) => {
                            if (node.type.name !== 'table') return
                            const dom = editorView.nodeDOM(pos)
                            const domEl = dom instanceof HTMLElement ? dom : null
                            if (domEl && (domEl === wrapper || wrapper.contains(domEl) || domEl.contains(tbl))) {
                                editorView.dispatch(tr.setNodeMarkup(pos, undefined, {
                                    ...node.attrs,
                                    tableWidth: newW,
                                    tableMinHeight: newH,
                                }))
                                return false
                            }
                        })
                    }

                    handle.addEventListener('mousedown', (e: MouseEvent) => {
                        e.preventDefault()
                        e.stopPropagation()
                        startX = e.clientX
                        startY = e.clientY
                        const tbl = wrapper.querySelector('table') as HTMLTableElement | null
                        if (!tbl) return
                        const rect = tbl.getBoundingClientRect()
                        startW = rect.width
                        startH = rect.height
                        containerW = wrapper.parentElement?.getBoundingClientRect().width || startW
                        document.addEventListener('mousemove', onMove)
                        document.addEventListener('mouseup', onUp)
                    })
                }

                function sync() {
                    editorView.dom.querySelectorAll<HTMLElement>('.tableWrapper').forEach((w: HTMLElement) => attachToWrapper(w))
                    handles.forEach((handle, wrapper) => {
                        if (!wrapper.isConnected) {
                            handle.remove()
                            handles.delete(wrapper)
                        } else {
                            placeHandle(wrapper, handle)
                        }
                    })
                }

                // Intercepts column-resize mousedowns before prosemirror-tables gets them.
                // Only the two columns adjacent to the dragged border redistribute width;
                // all others stay fixed and the outer table width stays at its declared %.
                //
                // Uses columnResizingPluginKey.activeHandle (set by prosemirror-tables'
                // mousemove handler) rather than a class check, because the handle widget
                // is only in the DOM when the cursor has already hovered over a border —
                // clicking the CSS cell divider directly would miss the class check.
                function onColumnMouseDown(e: MouseEvent): void {
                    if (e.button !== 0) return
                    const resizeState = columnResizingPluginKey.getState(editorView.state) as { activeHandle: number; dragging: unknown } | null
                    if (!resizeState || resizeState.activeHandle === -1 || resizeState.dragging) return

                    // activeHandle is the ProseMirror pos of the left cell of the border
                    const cellDom = editorView.nodeDOM(resizeState.activeHandle)
                    if (!(cellDom instanceof HTMLElement) || !cellDom.matches('td, th')) return
                    const tblEl = cellDom.closest('table') as HTMLTableElement | null
                    if (!tblEl) return

                    // Count which column this cell is in (left col of the dragged border)
                    let leftCol = 0
                    let prev = cellDom.previousElementSibling
                    while (prev) { leftCol += (prev as HTMLTableCellElement).colSpan || 1; prev = prev.previousElementSibling }
                    const rightCol = leftCol + 1

                    const colEls = Array.from(tblEl.querySelectorAll('col')) as HTMLElement[]
                    if (rightCol >= colEls.length) return

                    // Measure starting widths from the first row's rendered cells
                    const firstRow = tblEl.querySelector('tr')
                    if (!firstRow) return
                    const cells0 = Array.from(firstRow.children) as HTMLTableCellElement[]
                    const leftStartW = cells0[leftCol]?.offsetWidth ?? 60
                    const rightStartW = cells0[rightCol]?.offsetWidth ?? 60
                    const minW = 20
                    const startX = e.clientX

                    function onMove(ev: MouseEvent): void {
                        const dx = ev.clientX - startX
                        const newLeft = Math.max(minW, Math.min(leftStartW + rightStartW - minW, leftStartW + dx))
                        colEls[leftCol].style.width = `${Math.round(newLeft)}px`
                        colEls[rightCol].style.width = `${Math.round(leftStartW + rightStartW - newLeft)}px`
                    }

                    function onUp(ev: MouseEvent): void {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)

                        const dx = ev.clientX - startX
                        const newLeft = Math.max(minW, Math.min(leftStartW + rightStartW - minW, leftStartW + dx))
                        const newRight = leftStartW + rightStartW - newLeft

                        const { state } = editorView
                        const tr = state.tr

                        function setCellColwidth(cellEl: Element, newW: number): void {
                            if ((cellEl as HTMLTableCellElement).colSpan > 1) return
                            try {
                                const docPos = editorView.posAtDOM(cellEl as HTMLElement, 0)
                                const $pos = state.doc.resolve(docPos)
                                let cellPos: number | null = null
                                for (let d = $pos.depth; d >= 0; d--) {
                                    const n = $pos.node(d)
                                    if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
                                        cellPos = $pos.before(d)
                                        break
                                    }
                                }
                                if (cellPos === null) return
                                const cellNode = state.doc.nodeAt(cellPos)
                                if (!cellNode) return
                                tr.setNodeMarkup(cellPos, undefined, { ...cellNode.attrs, colwidth: [Math.round(newW)] })
                            } catch { /* cell outside doc */ }
                        }

                        tblEl!.querySelectorAll('tr').forEach((row: Element) => {
                            let col = 0
                            for (const cellEl of Array.from(row.children)) {
                                if (col === leftCol) setCellColwidth(cellEl, newLeft)
                                else if (col === rightCol) setCellColwidth(cellEl, newRight)
                                col += (cellEl as HTMLTableCellElement).colSpan || 1
                                if (col > rightCol) break
                            }
                        })

                        if (tr.docChanged) editorView.dispatch(tr)
                    }

                    e.stopPropagation()
                    e.preventDefault()
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                }
                editorView.dom.addEventListener('mousedown', onColumnMouseDown, true)

                requestAnimationFrame(sync)

                return {
                    update() { sync() },
                    destroy() {
                        editorView.dom.removeEventListener('mousedown', onColumnMouseDown, true)
                        handles.forEach(h => h.remove())
                        handles.clear()
                    },
                }
            },
        })]
    },
})

export function contentExtensions() {
    return [
        StarterKit.configure({ undoRedo: false }),
        ContentImage,
        ContentFlowchart,
        ContentTable.configure({ resizable: true, View: PatchedTableView, lastColumnResizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ContentHighlight.configure({ multicolor: true }),
        Underline,
        TextStyle,
        Color,
        FontSize,
        Link.configure({
            openOnClick: false,
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        }),
        ContentTableInteractions,
    ]
}
