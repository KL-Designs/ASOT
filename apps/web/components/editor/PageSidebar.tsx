'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Y from 'yjs'
import { Delete, DragIndicator, HorizontalRule, ContentCopy } from '@mui/icons-material'
import { useThinScrollFade } from './useThinScrollFade'

interface PageEntry {
    id: string
    title: string
    isMain: boolean
    pageType?: string  // 'intel' | 'orders' | 'zeus' | 'ocap' | 'staff_orders' | 'separator'
    pageColor?: string
    parentId?: string
}

const STAFF_SECTION_PRESETS = ['HQ Orders', '1 PLT Orders', '2 PLT Orders', '3 PLT Orders'] as const

/** Shape both `presenceUser` and each entry of `presencePeers` share — just
 * enough identity to render an avatar (visual-fixes FIX 3). `id` is a
 * Y.js/Hocuspocus awareness clientID for peers, or the literal 'self' for
 * the local user; either way it's only ever used as a React key here. */
interface PresencePerson {
    id: string | number
    name: string
    color: string
    avatar: string | null
}

interface Props {
    ydoc: Y.Doc
    activePage: string
    onSelectPage: (id: string) => void
    themeColor: string
    orientation?: 'sidebar' | 'top'
    synced?: boolean
    allowedTypes?: string[]
    /**
     * Page types this viewer may not open. Filtered out of the list entirely
     * rather than disabled — a document you cannot read should not advertise
     * that it exists, and Zeus Notes is the whole reason this prop exists.
     *
     * Not a security boundary on its own: the page's content lives in the same
     * Y.Doc as everything else, so anyone who can open the editor can still
     * reach it over the wire. This keeps it out of the way of staff who have no
     * business in it; the real gate is `operations.zeus` on the read side.
     */
    hiddenTypes?: string[]
    readOnly?: boolean
    /** The local user and everyone else currently in the document — both
     * read off the same Hocuspocus awareness state the collaborative cursors
     * already use (ActiveEditor's own `user`/`peers`), not a second channel.
     * Drives the rail footer's "EDITING" indicator (visual-fixes FIX 3),
     * which replaces the old current-user-only footer. */
    presenceUser?: PresencePerson
    presencePeers?: PresencePerson[]
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

export default function PageSidebar({ ydoc, activePage, onSelectPage, themeColor, orientation = 'sidebar', synced = false, allowedTypes, hiddenTypes, readOnly = false, presenceUser, presencePeers = [] }: Props) {
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const [pages, setPages] = useState<PageEntry[]>([{ id: 'main', title: 'CHQ Orders', isMain: true }])
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
    const [showTypeModal, setShowTypeModal]           = useState(false)
    const [typeModalStep, setTypeModalStep]           = useState<'type' | 'staff_section'>('type')
    const [staffSectionCustom, setStaffSectionCustom] = useState('')
    const [colorPickerPageId, setColorPickerPageId]   = useState<string | null>(null)
    const [dragInsertIdx, setDragInsertIdx]           = useState<number | null>(null)
    const [dragNestTargetId, setDragNestTargetId]     = useState<string | null>(null)
    const [confirmingDuplicateId, setConfirmingDuplicateId] = useState<string | null>(null)
    // Section import
    const [importTargetId, setImportTargetId]         = useState<string | null>(null)
    const [importSourceId, setImportSourceId]         = useState('')
    const [importSectionList, setImportSectionList]   = useState<{ id: string; title: string }[]>([])
    const [importSelected, setImportSelected]         = useState<Set<string>>(new Set())
    const [importing, setImporting]                   = useState(false)

    const PAGE_COLOR_PRESETS = ['', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']
    /** The page being dragged, by id rather than by index: the list can be
     * rewritten under a drag by another editor on the same document, and an
     * index captured on dragstart would then move the wrong row. */
    const [dragSrcId, setDragSrcId] = useState<string | null>(null)
    const renameInputRef = useRef<HTMLInputElement>(null)
    const defaultInitRef = useRef(false)
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
    const listFadeRef = useThinScrollFade<HTMLDivElement>()

    // Show the system cursor over this component's modals.
    //
    // `suppress-custom-cursor`, NOT `cursor-disabled`: the latter is the
    // *user's own preference*, written to the body by components/cursor.tsx
    // from localStorage. Toggling it here removed it whenever no modal was
    // open — and since this rail is mounted on every page of the operations
    // editor, a member who had turned the custom cursor off lost the class,
    // got `cursor: none` back from globals.css, and had no cursor at all in
    // the editor while it worked everywhere else on the site.
    useEffect(() => {
        const anyModalOpen = showTypeModal || !!colorPickerPageId
        if (!anyModalOpen) return
        document.body.classList.add('suppress-custom-cursor')
        return () => document.body.classList.remove('suppress-custom-cursor')
    }, [showTypeModal, colorPickerPageId])

    // Auto-create default pages for brand-new empty documents once Hocuspocus confirms sync.
    // Waits for the real onSynced event (via `synced` prop) instead of a fixed timer, so
    // existing operations never get default pages injected on top of their content.
    // Legacy operations (pre-pageOrder) are migrated: 'main' is added to pageOrder without
    // adding the new Intel Package / Zeus / OCAP defaults.
    //
    // Guarded by a persisted `docFlags.pagesInitialized` flag rather than trusting a single
    // `pageOrder.length === 0` snapshot: `synced` can fire slightly ahead of trailing Yjs sync
    // messages actually landing, and mis-reading an existing document as empty here injects a
    // duplicate default page set that then gets persisted alongside the real one. The flag makes
    // "already initialized" durable so a later, raced load can't re-trigger this. A short delay
    // before evaluating also gives those trailing messages a moment to arrive in the first place.
    useEffect(() => {
        if (!synced) return
        if (defaultInitRef.current) return
        defaultInitRef.current = true

        const timer = setTimeout(() => {
            const flags = ydoc.getMap<string>('docFlags')
            if (flags.get('pagesInitialized') === 'true') return

            const pageOrder = ydoc.getArray<string>('pageOrder')
            if (pageOrder.length > 0) {
                ydoc.transact(() => flags.set('pagesInitialized', 'true'))
                return
            }

            // Legacy document detection: if 'main' already has sections it was created before
            // pageOrder existed — just register 'main' without adding new default pages.
            const mainSections = ydoc.getArray<string>('sectionOrder')
            if (mainSections.length > 0) {
                ydoc.transact(() => {
                    if (!pageOrder.toArray().includes('main')) pageOrder.push(['main'])
                    flags.set('pagesInitialized', 'true')
                })
                return
            }

            // Brand-new document — insert the standard default page set.
            const intelId = Math.random().toString(36).slice(2, 10)
            const zeusId  = Math.random().toString(36).slice(2, 10)
            const ocapId  = Math.random().toString(36).slice(2, 10)
            ydoc.transact(() => {
                flags.set('pagesInitialized', 'true')
                pageOrder.push([intelId])
                const intelM = ydoc.getMap<string>('pmeta-' + intelId)
                intelM.set('title', 'Intel Package')
                intelM.set('isMain', 'false')
                intelM.set('pageType', 'intel')
                intelM.set('pageColor', '#f59e0b')
                if (!pageOrder.toArray().includes('main')) {
                    pageOrder.push(['main'])
                }
                ydoc.getMap<string>('pmeta-main').set('title', 'CHQ Orders')
                pageOrder.push([zeusId])
                const zeusM = ydoc.getMap<string>('pmeta-' + zeusId)
                zeusM.set('title', 'Zeus Notes')
                zeusM.set('isMain', 'false')
                zeusM.set('pageType', 'zeus')
                pageOrder.push([ocapId])
                const ocapM = ydoc.getMap<string>('pmeta-' + ocapId)
                ocapM.set('title', 'OCAP')
                ocapM.set('isMain', 'false')
                ocapM.set('pageType', 'ocap')
                ocapM.set('pageColor', '#10b981')
            })
        }, 500)

        return () => clearTimeout(timer)
    }, [synced, ydoc])

    useEffect(() => {
        const pageOrder = ydoc.getArray<string>('pageOrder')
        const metaObservers = new Map<string, () => void>()

        function rebuild() {
            const ids = pageOrder.length > 0 ? pageOrder.toArray() : ['main']
            setPages(ids
                .map(id => {
                    const pmeta = ydoc.getMap<string>('pmeta-' + id)
                    const fallback = id === 'main' ? 'Main' : 'Untitled'
                    return { id, title: pmeta.get('title') || fallback, isMain: id === 'main', pageType: pmeta.get('pageType') || 'orders', pageColor: pmeta.get('pageColor') || '', parentId: pmeta.get('parentId') || undefined }
                })
                .filter(p => !hiddenTypes?.includes(p.pageType ?? 'orders')))
        }

        function observePageMeta(id: string) {
            if (metaObservers.has(id)) return
            const pmeta = ydoc.getMap<string>('pmeta-' + id)
            const handler = () => rebuild()
            pmeta.observe(handler)
            metaObservers.set(id, () => pmeta.unobserve(handler))
        }

        const orderHandler = () => {
            // If real data just arrived from server sync, cancel any pending default init
            if (pageOrder.length > 0) defaultInitRef.current = true
            pageOrder.toArray().forEach(observePageMeta)
            observePageMeta('main')
            rebuild()
        }
        pageOrder.observe(orderHandler)
        observePageMeta('main')
        pageOrder.toArray().forEach(observePageMeta)
        rebuild()

        return () => {
            pageOrder.unobserve(orderHandler)
            metaObservers.forEach(unsub => unsub())
        }
    // `hiddenTypes` arrives a beat after mount (its permission is fetched), so
    // it has to be a dependency — otherwise the list is built once without it.
    }, [ydoc, hiddenTypes])

    useEffect(() => {
        if (renamingId) renameInputRef.current?.focus()
    }, [renamingId])

    function addPage(type: 'orders' | 'zeus' | 'staff_orders' | 'separator', title?: string) {
        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
        const defaultTitle = type === 'zeus' ? 'Zeus Notes'
            : type === 'separator' ? '──────────'
            : type === 'staff_orders' ? (title ?? 'Staff Orders')
            : 'New Page'
        ydoc.transact(() => {
            const pageOrder = ydoc.getArray<string>('pageOrder')
            if (pageOrder.length === 0) {
                pageOrder.push(['main'])
                ydoc.getMap<string>('pmeta-main').set('title', 'CHQ Orders')
            }
            pageOrder.push([id])
            const pmeta = ydoc.getMap<string>('pmeta-' + id)
            pmeta.set('title', defaultTitle)
            pmeta.set('isMain', 'false')
            pmeta.set('pageType', type)
        })
        closeTypeModal()
        if (type !== 'separator') {
            setTimeout(() => {
                onSelectPage(id)
                if (type === 'orders') {
                    setRenameValue(defaultTitle)
                    setRenamingId(id)
                }
            }, 0)
        }
    }

    function closeTypeModal() {
        setShowTypeModal(false)
        setTypeModalStep('type')
        setStaffSectionCustom('')
    }

    function startRename(id: string, currentTitle: string) {
        setRenameValue(currentTitle)
        setRenamingId(id)
    }

    function commitRename() {
        if (!renamingId) return
        const fallback = renamingId === 'main' ? 'CHQ Orders' : 'Untitled'
        const trimmed = renameValue.trim() || fallback
        const pmeta = ydoc.getMap<string>('pmeta-' + renamingId)
        pmeta.set('title', trimmed)
        setRenamingId(null)
    }

    function deletePage(id: string) {
        const pageOrder = ydoc.getArray<string>('pageOrder')
        const arr = pageOrder.toArray()
        const idx = arr.indexOf(id)
        if (idx !== -1) {
            ydoc.transact(() => { pageOrder.delete(idx, 1) })
        }
        if (activePage === id) {
            const remaining = arr.filter(p => p !== id)
            onSelectPage(remaining[0] ?? 'main')
        }
        setConfirmingDeleteId(null)
    }

    function movePage(fromIdx: number, toIdx: number) {
        if (fromIdx === toIdx) return
        const pageOrder = ydoc.getArray<string>('pageOrder')
        if (pageOrder.length === 0) return
        const arr = pageOrder.toArray()
        const item = arr[fromIdx]
        if (item === undefined) return
        ydoc.transact(() => {
            pageOrder.delete(fromIdx, 1)
            pageOrder.insert(toIdx, [item])
        })
    }

    function nestPage(pageId: string, targetId: string) {
        if (pageId === targetId) return
        const pmeta = ydoc.getMap<string>('pmeta-' + pageId)
        // Prevent circular nesting
        const targetPmeta = ydoc.getMap<string>('pmeta-' + targetId)
        if (targetPmeta.get('parentId') === pageId) return
        ydoc.transact(() => { pmeta.set('parentId', targetId) })
    }

    function unnestPage(pageId: string) {
        const pmeta = ydoc.getMap<string>('pmeta-' + pageId)
        ydoc.transact(() => { pmeta.delete('parentId') })
    }

    // ── Dragging a document to a new place ────────────────────────────────────
    //
    // Two things made this unusable, and both were about the *feedback* rather
    // than the maths:
    //
    // 1. The insert line was a real element in the flow, so showing it pushed
    //    the row under the cursor down by its own height. That moved the row
    //    out from under the pointer, which recomputed the position, which
    //    hid the line, which moved the row back — a loop that reads as the
    //    indicator flickering between above and below and never settling.
    //    It is absolutely positioned now and costs no layout.
    //
    // 2. `onDragLeave` on each row cleared the state, and a dragleave fires on
    //    the row every time the pointer crosses into one of its own children
    //    (the grip, the dot, the label). So the indicator blinked out several
    //    times while crossing a single row. Only leaving the whole list clears
    //    it now.
    //
    // The before/after split is a plain half-and-half; the middle band is the
    // nest gesture and only exists on rows that can actually take a child.

    function clearDrag() {
        setDragSrcId(null)
        setDragInsertIdx(null)
        setDragNestTargetId(null)
    }

    function commitDrop() {
        const srcId = dragSrcId
        if (!srcId) { clearDrag(); return }

        if (dragNestTargetId && dragNestTargetId !== srcId) {
            nestPage(srcId, dragNestTargetId)
        } else if (dragInsertIdx !== null) {
            const from = pages.findIndex(p => p.id === srcId)
            if (from !== -1) {
                // The insert index counts positions in the list as it stands;
                // movePage removes first, so everything after the source shifts
                // up by one.
                const to = from < dragInsertIdx ? dragInsertIdx - 1 : dragInsertIdx
                // Dropping onto the top-level insert line is also how a nested
                // page gets out again — the line is drawn at the top level, so
                // that is where it lands. It was otherwise a one-way trip:
                // nothing else in this rail ever called unnestPage.
                if (pages[from].parentId) unnestPage(srcId)
                movePage(from, Math.max(0, to))
            }
        }
        clearDrag()
    }

    /** Drag handlers for one row. `canNest` is false for separators, which
     * cannot own children. */
    function dragPropsFor(idx: number, page: PageEntry, canNest: boolean) {
        return {
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
                setDragSrcId(page.id)
                e.dataTransfer.effectAllowed = 'move'
                // Firefox will not start a drag at all without data on the transfer.
                e.dataTransfer.setData('text/plain', page.id)
            },
            onDragOver: (e: React.DragEvent) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const rect = e.currentTarget.getBoundingClientRect()
                const yRel = (e.clientY - rect.top) / rect.height
                // One level of nesting only, which is all the rail renders: a
                // row that is already a child cannot take one of its own.
                const nestable = canNest && !!dragSrcId && dragSrcId !== page.id && !page.parentId
                if (nestable && yRel > 0.35 && yRel < 0.65) {
                    setDragNestTargetId(page.id)
                    setDragInsertIdx(null)
                } else {
                    setDragNestTargetId(null)
                    setDragInsertIdx(yRel < 0.5 ? idx : idx + 1)
                }
            },
            onDrop: (e: React.DragEvent) => { e.preventDefault(); commitDrop() },
            onDragEnd: clearDrag,
        }
    }

    /** Whether to draw the insert line before position `idx`. A line at either
     * end of the row being dragged means "stay exactly where you are", so it is
     * left out rather than promising a move that will not happen. */
    function showInsertAt(idx: number) {
        if (dragInsertIdx !== idx) return false
        const from = pages.findIndex(p => p.id === dragSrcId)
        return from === -1 || (idx !== from && idx !== from + 1)
    }

    function insertLine(edge: 'top' | 'bottom') {
        return (
            <div style={{
                position: 'absolute', left: 10, right: 10, height: 2, zIndex: 2,
                [edge]: -1, background: 'var(--acc)', borderRadius: 1, pointerEvents: 'none',
            }} />
        )
    }

    // Sync section list when import source changes
    React.useEffect(() => {
        if (!importSourceId) { setImportSectionList([]); return }
        const sectionOrder = ydoc.getArray<string>('sectionOrder-' + importSourceId)
        const ids = sectionOrder.toArray()
        setImportSectionList(ids.map(id => {
            const meta = ydoc.getMap<string>(`smeta-${importSourceId}-${id}`)
            return { id, title: meta.get('title') || 'Untitled' }
        }))
        setImportSelected(new Set())
    }, [importSourceId, ydoc])

    function doImportSections() {
        if (!importTargetId || !importSourceId || importSelected.size === 0) return
        setImporting(true)
        try {
            const selectedIds = Array.from(importSelected)
            ydoc.transact(() => {
                const targetOrder = ydoc.getArray<string>('sectionOrder-' + importTargetId)
                for (const srcSecId of selectedIds) {
                    const newSecId = Math.random().toString(36).slice(2, 10)
                    targetOrder.push([newSecId])
                    const srcMeta = ydoc.getMap<string>(`smeta-${importSourceId}-${srcSecId}`)
                    const dstMeta = ydoc.getMap<string>(`smeta-${importTargetId}-${newSecId}`)
                    srcMeta.forEach((v, k) => dstMeta.set(k, v))
                    try {
                        const srcFrag = ydoc.getXmlFragment(`scontent-${importSourceId}-${srcSecId}`)
                        const dstFrag = ydoc.getXmlFragment(`scontent-${importTargetId}-${newSecId}`)
                        const items = srcFrag.toArray()
                        if (items.length > 0) dstFrag.insert(0, items.map((item: any) => item.clone()))
                    } catch { /* content copy failed */ }
                }
            })
        } finally {
            setImporting(false)
            setImportTargetId(null)
            setImportSourceId('')
            setImportSelected(new Set())
        }
    }

    function duplicatePage(sourceId: string) {
        const newId = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
        const srcPmeta = ydoc.getMap<string>('pmeta-' + sourceId)
        const srcTitle = srcPmeta.get('title') || 'Untitled'
        const srcType = srcPmeta.get('pageType') || 'orders'
        const srcColor = srcPmeta.get('pageColor') || ''

        const srcOrder = ydoc.getArray<string>('sectionOrder-' + sourceId)
        const srcSectionIds = srcOrder.toArray()

        ydoc.transact(() => {
            const pageOrder = ydoc.getArray<string>('pageOrder')
            pageOrder.push([newId])
            const dstPmeta = ydoc.getMap<string>('pmeta-' + newId)
            dstPmeta.set('title', `${srcTitle} (Copy)`)
            dstPmeta.set('isMain', 'false')
            dstPmeta.set('pageType', srcType)
            if (srcColor) dstPmeta.set('pageColor', srcColor)

            const dstOrder = ydoc.getArray<string>('sectionOrder-' + newId)

            for (const srcSectionId of srcSectionIds) {
                const newSectionId = Math.random().toString(36).slice(2, 10)
                dstOrder.push([newSectionId])

                // Copy section metadata
                const srcMeta = ydoc.getMap<string>(`smeta-${sourceId}-${srcSectionId}`)
                const dstMeta = ydoc.getMap<string>(`smeta-${newId}-${newSectionId}`)
                srcMeta.forEach((v, k) => dstMeta.set(k, v))

                // Copy section content (Y.XmlFragment)
                try {
                    const srcFrag = ydoc.getXmlFragment(`scontent-${sourceId}-${srcSectionId}`)
                    const dstFrag = ydoc.getXmlFragment(`scontent-${newId}-${newSectionId}`)
                    const items = srcFrag.toArray()
                    if (items.length > 0) {
                        dstFrag.insert(0, items.map((item: any) => item.clone()))
                    }
                } catch {
                    // content copy failed — new section starts empty
                }
            }
        })

        setTimeout(() => onSelectPage(newId), 0)
    }

    // ── Top (mobile) orientation ──────────────────────────────────────────────
    if (orientation === 'top') {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                overflowX: 'auto',
                padding: '0 0 10px 0',
                borderBottom: `1px solid rgba(255,255,255,0.07)`,
                marginBottom: 12,
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
            }}>
                {pages.map(page => {
                    const isActive = page.id === activePage
                    const isRenaming = renamingId === page.id
                    const isConfirmingDelete = confirmingDeleteId === page.id

                    return (
                        <div
                            key={page.id}
                            style={{
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '5px 10px',
                                background: isActive ? c(0.12) : 'transparent',
                                border: isActive ? `1px solid ${c(0.3)}` : '1px solid rgba(255,255,255,0.07)',
                                borderRadius: 3,
                                cursor: 'pointer',
                            }}
                            onClick={() => { if (!isRenaming) onSelectPage(page.id) }}
                        >
                            {isRenaming ? (
                                <input
                                    ref={renameInputRef}
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') commitRename()
                                        if (e.key === 'Escape') setRenamingId(null)
                                        e.stopPropagation()
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        width: 120,
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: `1px solid ${c(0.5)}`,
                                        outline: 'none',
                                        color: 'rgba(237,237,237,0.9)',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        padding: '1px 2px',
                                    }}
                                />
                            ) : (
                                <span
                                    style={{
                                        fontSize: '0.68rem',
                                        fontWeight: isActive ? 700 : 500,
                                        color: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.45)',
                                        whiteSpace: 'nowrap',
                                        letterSpacing: '0.03em',
                                    }}
                                    onDoubleClick={e => { e.stopPropagation(); startRename(page.id, page.title) }}
                                >
                                    {page.title}
                                </span>
                            )}
                            {isActive && !isRenaming && (
                                isConfirmingDelete ? (
                                    <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                                        <button type='button' onClick={() => deletePage(page.id)}
                                            style={{ padding: '1px 5px', fontSize: '0.58rem', fontWeight: 700, background: 'rgba(200,40,40,0.7)', border: '1px solid rgba(200,40,40,0.9)', color: '#fff', cursor: 'pointer', borderRadius: 2 }}>
                                            Del
                                        </button>
                                        <button type='button' onClick={() => setConfirmingDeleteId(null)}
                                            style={{ padding: '1px 5px', fontSize: '0.58rem', fontWeight: 700, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer', borderRadius: 2 }}>
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <button type='button' onClick={e => { e.stopPropagation(); setConfirmingDeleteId(page.id) }}
                                        style={{ background: 'transparent', border: 'none', padding: 1, cursor: 'pointer', color: 'rgba(237,237,237,0.3)', display: 'flex', alignItems: 'center' }}>
                                        <Delete style={{ fontSize: 12 }} />
                                    </button>
                                )
                            )}
                        </div>
                    )
                })}
                <button
                    type='button'
                    onClick={() => setShowTypeModal(true)}
                    style={{
                        flexShrink: 0,
                        padding: '5px 10px',
                        background: 'transparent',
                        border: `1px dashed ${c(0.25)}`,
                        color: c(0.45),
                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap',
                    }}
                >
                    + Add
                </button>
            </div>
        )
    }

    // ── Sidebar (desktop) orientation ─────────────────────────────────────────
    return (
        <div style={{
            width: 208,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--line)',
            background: 'linear-gradient(180deg, var(--s1), var(--bg))',
            position: 'sticky',
            top: 0,
            // Flex-driven, not viewport maths (visual-fixes FIX 3): this row's
            // parent (CollabEditor's ActiveEditor root) sets `height: '100%'`
            // — a real `height`, not `minHeight` — resolved against
            // EditorShell's own definite wrapper. That's what lets this
            // `height: '100%'` here resolve to an actual pixel value instead
            // of falling back to this element's own (short) content height;
            // an ancestor whose only sizing is `min-height` never counts as
            // "definite" for a percentage-height descendant to resolve
            // against, which is what made the rail stop a quarter of the way
            // What keeps the rail on screen through a long document is not
            // this `sticky` but the fact that CollabEditor confines the
            // scroll to the editor column beside it, so this row never
            // scrolls at all - see that file's comment on the column div.
            // Sticky is kept only as a harmless backstop should an ancestor
            // ever scroll again; on its own it could not do the job, because
            // a sticky box may only travel within its containing block and
            // that block is exactly one viewport tall.
            height: '100%',
        }}>
            <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: 'var(--ink)', padding: '14px 18px',
                borderBottom: '1px solid var(--line)', flexShrink: 0,
            }}>
                Documents
            </div>

            <div
                ref={listFadeRef}
                className='thin-scroll'
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}
                onDragLeave={e => {
                    // Only when the pointer leaves the list itself. A dragleave
                    // also fires every time it crosses into a child element,
                    // and clearing on those made the insert line blink out
                    // repeatedly while crossing a single row.
                    const to = e.relatedTarget as Node | null
                    if (!to || !e.currentTarget.contains(to)) {
                        setDragInsertIdx(null)
                        setDragNestTargetId(null)
                    }
                }}
            >
            {pages.map((page, idx) => {
                const isActive = page.id === activePage
                const isRenaming = renamingId === page.id
                const isConfirmingDelete = confirmingDeleteId === page.id
                const isRowHovered = hoveredRowId === page.id
                const showRowActions = isRowHovered || isConfirmingDelete || confirmingDuplicateId === page.id

                // ── Separator ─────────────────────────────────────────────────
                if (page.pageType === 'separator') {
                    return (
                        <div key={page.id} style={{ position: 'relative' }}>
                        {showInsertAt(idx) && insertLine('top')}
                        {idx === pages.length - 1 && showInsertAt(pages.length) && insertLine('bottom')}
                        <div
                            {...dragPropsFor(idx, page, false)}
                            onMouseEnter={() => setHoveredRowId(page.id)}
                            onMouseLeave={() => setHoveredRowId(null)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', cursor: 'default',
                                opacity: dragSrcId === page.id ? 0.4 : 1,
                            }}
                        >
                            <DragIndicator style={{ fontSize: 12, color: 'var(--ink-3)', opacity: isRowHovered ? 0.6 : 0, cursor: 'grab', flexShrink: 0, transition: 'opacity 0.12s' }} />
                            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                            {isRenaming ? (
                                <input
                                    ref={renameInputRef}
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: 80, background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-2)', outline: 'none', color: 'var(--ink-2)', fontSize: '0.6rem', fontWeight: 600, padding: '1px 2px', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                                />
                            ) : page.title && page.title !== '──────────' ? (
                                <span
                                    style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}
                                    onDoubleClick={e => { e.stopPropagation(); startRename(page.id, page.title === '──────────' ? '' : page.title) }}
                                    title='Double-click to add label'
                                >
                                    {page.title}
                                </span>
                            ) : (
                                <span
                                    style={{ fontSize: '0.58rem', color: 'var(--ink-3)', opacity: 0.4, cursor: 'default', flexShrink: 0 }}
                                    onDoubleClick={e => { e.stopPropagation(); startRename(page.id, '') }}
                                    title='Double-click to add label'
                                >
                                    ···
                                </span>
                            )}
                            {!isRenaming && (
                                isConfirmingDelete ? (
                                    <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                        <button type='button' onClick={() => deletePage(page.id)} style={{ padding: '1px 5px', fontSize: '0.55rem', fontWeight: 700, background: 'var(--crit)', border: '1px solid var(--crit)', color: '#fff', cursor: 'pointer', borderRadius: 'var(--r)' }}>Del</button>
                                        <button type='button' onClick={() => setConfirmingDeleteId(null)} style={{ padding: '1px 5px', fontSize: '0.55rem', fontWeight: 700, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink-3)', cursor: 'pointer', borderRadius: 'var(--r)' }}>✕</button>
                                    </div>
                                ) : (
                                    <button type='button' onClick={e => { e.stopPropagation(); setConfirmingDeleteId(page.id) }}
                                        style={{ background: 'transparent', border: 'none', padding: 1, cursor: 'pointer', color: 'var(--ink-3)', opacity: showRowActions ? 0.7 : 0, display: 'flex', alignItems: 'center', borderRadius: 2, flexShrink: 0, transition: 'opacity 0.12s, color 0.12s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--crit)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3)' }}
                                    >
                                        <Delete style={{ fontSize: 11 }} />
                                    </button>
                                )
                            )}
                        </div>
                        </div>
                    )
                }

                // Per-page-type dot colour — a functional legend (document kind),
                // not a themeable surface, so these stay literal hex rather than
                // design tokens; 'orders'/'main' (the common case) uses the
                // operation's own accent instead of a fixed colour.
                const dotColor = page.pageType === 'zeus' ? '#00c3ff'
                    : page.pageType === 'ocap' ? '#10b981'
                    : page.pageType === 'staff_orders' ? (page.pageColor || '#22c55e')
                    : 'var(--acc)'

                const isNestTarget = dragNestTargetId === page.id

                return (
                    <div
                        key={page.id}
                        style={{
                            position: 'relative',
                            ...(page.parentId ? { paddingLeft: 14, marginLeft: 10, borderLeft: '1px solid var(--line)' } : null),
                        }}
                    >
                    {/* Absolutely positioned, so drawing it never moves the row
                        out from under the cursor - see the note by clearDrag. */}
                    {showInsertAt(idx) && insertLine('top')}
                    {idx === pages.length - 1 && showInsertAt(pages.length) && insertLine('bottom')}
                    <div
                        {...dragPropsFor(idx, page, true)}
                        onClick={() => { if (!isRenaming) onSelectPage(page.id) }}
                        onMouseEnter={() => setHoveredRowId(page.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '8px 10px',
                            background: isNestTarget ? 'var(--s3)' : isActive ? 'var(--s2)' : 'transparent',
                            borderLeft: (isNestTarget || isActive) ? '2px solid var(--acc)' : '2px solid transparent',
                            opacity: dragSrcId === page.id ? 0.4 : 1,
                            cursor: 'pointer',
                            transition: 'background 0.1s, opacity 0.1s',
                        }}
                    >
                        <DragIndicator style={{ fontSize: 13, flexShrink: 0, color: 'var(--ink-3)', opacity: isRowHovered ? 0.5 : 0, cursor: 'grab', transition: 'opacity 0.12s' }} />
                        <span style={{ width: 5, height: 5, flexShrink: 0, background: dotColor }} />

                        {isRenaming ? (
                            <input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') commitRename()
                                    if (e.key === 'Escape') setRenamingId(null)
                                    e.stopPropagation()
                                }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                    flex: 1, minWidth: 0,
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: '1px solid var(--line-2)',
                                    outline: 'none',
                                    color: 'var(--ink)',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '1px 2px',
                                }}
                            />
                        ) : (
                            <span
                                style={{
                                    flex: 1, minWidth: 0,
                                    fontSize: 12.5, fontWeight: isActive ? 700 : 500,
                                    color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}
                                onDoubleClick={e => { e.stopPropagation(); startRename(page.id, page.title) }}
                                title={`${page.title}${page.pageType === 'intel' ? ' (Intel Package)' : page.pageType === 'zeus' ? ' (Zeus Notes — J6 only)' : page.pageType === 'ocap' ? ' (OCAP)' : page.pageType === 'staff_orders' ? ' (Staff Orders)' : ''} (double-click to rename)`}
                            >
                                {page.title}
                            </span>
                        )}

                        {!isRenaming && (
                            isConfirmingDelete ? (
                                <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                                    <button type='button' onClick={() => deletePage(page.id)}
                                        style={{ padding: '1px 5px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', background: 'var(--crit)', border: '1px solid var(--crit)', color: '#fff', cursor: 'pointer', borderRadius: 'var(--r)' }}>
                                        Del
                                    </button>
                                    <button type='button' onClick={() => setConfirmingDeleteId(null)}
                                        style={{ padding: '1px 5px', fontSize: '0.6rem', fontWeight: 700, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink-3)', cursor: 'pointer', borderRadius: 'var(--r)' }}>
                                        ✕
                                    </button>
                                </div>
                            ) : confirmingDuplicateId === page.id ? (
                                <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                    <button type='button' onClick={() => { duplicatePage(page.id); setConfirmingDuplicateId(null) }}
                                        style={{ padding: '1px 5px', fontSize: '0.55rem', fontWeight: 700, background: 'var(--s3)', border: '1px solid var(--line-2)', color: 'var(--ink)', cursor: 'pointer', borderRadius: 'var(--r)' }}>Dup</button>
                                    <button type='button' onClick={() => setConfirmingDuplicateId(null)}
                                        style={{ padding: '1px 5px', fontSize: '0.55rem', fontWeight: 700, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink-3)', cursor: 'pointer', borderRadius: 'var(--r)' }}>✕</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 1, opacity: showRowActions ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}>
                                    {page.pageType === 'staff_orders' ? (
                                        <button type='button' title='Import sections from another document'
                                            onClick={e => { e.stopPropagation(); setImportTargetId(page.id); setImportSourceId(''); setImportSelected(new Set()) }}
                                            style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', borderRadius: 2, transition: 'color 0.12s' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--warn)' }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3)' }}
                                        >
                                            <ContentCopy style={{ fontSize: 11 }} />
                                        </button>
                                    ) : (
                                    <button type='button' title='Duplicate page'
                                        onClick={e => { e.stopPropagation(); duplicatePage(page.id) }}
                                        style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', borderRadius: 2, transition: 'color 0.12s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3)' }}
                                    >
                                        <ContentCopy style={{ fontSize: 11 }} />
                                    </button>
                                    )}
                                    <button type='button' title='Delete page'
                                        onClick={e => { e.stopPropagation(); setConfirmingDeleteId(page.id) }}
                                        style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', borderRadius: 2, transition: 'color 0.12s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--crit)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3)' }}
                                    >
                                        <Delete style={{ fontSize: 13 }} />
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                    </div>
                )
            })}

            <button type='button' onClick={() => { setShowTypeModal(true); setTypeModalStep('type') }}
                style={{
                    display: 'block', margin: '6px 10px 4px', padding: '6px 8px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ink-3)',
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'color 0.15s', textAlign: 'left',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-3)' }}
            >
                + Add Document
            </button>
            </div>

            {/* Footer — collaborator presence (visual-fixes FIX 3). Replaces the
                old current-user-only footer; the "EDITING" indicator that used
                to float at the top-right of the editor column now lives here
                instead, reusing the same `presenceUser`/`presencePeers` identity
                ActiveEditor already derives from the Hocuspocus awareness state
                for the collaborative cursors — no second presence channel. */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                padding: '10px 14px',
                borderTop: '1px solid var(--line)',
            }}>
                {presenceUser && (() => {
                    const shown = [presenceUser, ...presencePeers].slice(0, 6)
                    const overflowCount = presenceUser ? 1 + presencePeers.length - shown.length : 0
                    return (
                        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                            {shown.map((p, i) => (
                                <div key={p.id} title={p.name} style={{
                                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                                    background: p.color, border: '1.5px solid var(--bg)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 8.5, fontWeight: 700, color: '#fff', textTransform: 'uppercase',
                                    marginLeft: i === 0 ? 0 : -6, position: 'relative', zIndex: shown.length - i,
                                }}>
                                    {p.avatar ? <img src={p.avatar} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : p.name.charAt(0)}
                                </div>
                            ))}
                            {overflowCount > 0 && (
                                <div style={{
                                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                    background: 'var(--s3)', border: '1.5px solid var(--bg)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 8, fontWeight: 700, color: 'var(--ink-2)',
                                    marginLeft: -6, position: 'relative', zIndex: 0,
                                }}>
                                    +{overflowCount}
                                </div>
                            )}
                        </div>
                    )
                })()}
                <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {!presenceUser ? 'Connecting…' : presencePeers.length === 0 ? 'Only you' : readOnly ? 'Viewing' : 'Editing'}
                </span>
            </div>

            {/* Section import modal */}
            {importTargetId && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) { setImportTargetId(null); setImportSourceId('') } }}
                >
                    <div style={{ background: '#0f0f10', border: '1px solid rgba(245,158,11,0.35)', borderTop: '2px solid rgba(245,158,11,0.8)', padding: '24px 28px', maxWidth: 420, width: '90%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(245,158,11,0.5)', fontFamily: 'monospace' }}>{'// IMPORT SECTIONS'}</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Import from Document</div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>
                            Select a source document, then choose which sections to copy into this page.
                        </div>

                        {/* Source page selector */}
                        <select
                            value={importSourceId}
                            onChange={e => setImportSourceId(e.target.value)}
                            style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: importSourceId ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.35)', fontSize: '0.8rem', outline: 'none' }}
                        >
                            <option value=''>— Select a source document —</option>
                            {pages.filter(p => p.id !== importTargetId && p.pageType !== 'separator').map(p => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                        </select>

                        {/* Section checklist */}
                        {importSourceId && (
                            <div className='thin-scroll' style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', padding: '4px 0' }}>
                                {importSectionList.length === 0 ? (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>No sections found in this document.</div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                            <button type='button' onClick={() => setImportSelected(new Set(importSectionList.map(s => s.id)))}
                                                style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'rgba(245,158,11,0.8)', cursor: 'pointer' }}
                                            >All</button>
                                            <button type='button' onClick={() => setImportSelected(new Set())}
                                                style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                                            >None</button>
                                        </div>
                                        {importSectionList.map(s => (
                                            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', background: importSelected.has(s.id) ? 'rgba(245,158,11,0.06)' : 'transparent', border: `1px solid ${importSelected.has(s.id) ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.05)'}`, transition: 'all 0.1s' }}>
                                                <input type='checkbox' checked={importSelected.has(s.id)}
                                                    onChange={() => setImportSelected(prev => {
                                                        const next = new Set(prev)
                                                        next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                                                        return next
                                                    })}
                                                    style={{ accentColor: 'rgba(245,158,11,0.8)', flexShrink: 0 }}
                                                />
                                                <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                                            </label>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button type='button' onClick={() => { setImportTargetId(null); setImportSourceId('') }}
                                style={{ padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer' }}
                            >CANCEL</button>
                            <button type='button' onClick={doImportSections} disabled={importing || !importSourceId || importSelected.size === 0}
                                style={{ padding: '6px 16px', fontSize: '0.7rem', fontWeight: 700, background: importing || !importSourceId || importSelected.size === 0 ? 'rgba(245,158,11,0.05)' : 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: importing || !importSourceId || importSelected.size === 0 ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.9)', cursor: importing || !importSourceId || importSelected.size === 0 ? 'not-allowed' : 'pointer' }}
                            >{importing ? 'Importing…' : `Import ${importSelected.size > 0 ? importSelected.size + ' ' : ''}Section${importSelected.size !== 1 ? 's' : ''}`}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document type selection modal — rendered via portal so it sits above all stacking contexts */}
            {showTypeModal && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}
                    onClick={e => { if (e.target === e.currentTarget) closeTypeModal() }}
                >
                    <div style={{ background: '#0f0f10', border: `1px solid ${c(0.35)}`, borderTop: `2px solid ${c(0.8)}`, padding: '24px 28px', maxWidth: 400, width: '90%', display: 'flex', flexDirection: 'column', gap: 14, cursor: 'default' }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: c(0.5), fontFamily: 'monospace' }}>{'// ADD DOCUMENT'}</div>

                        {typeModalStep === 'type' && (() => {
                            const allowed = (type: string) => !allowedTypes || allowedTypes.includes(type)
                            return <>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Choose Document Type</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {allowed('orders') && (
                                <button type='button' onClick={() => addPage('orders')}
                                    style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, background: `${c(0.06)}`, border: `1px solid ${c(0.3)}`, color: c(0.85), cursor: 'pointer' }}
                                >
                                    Document Page
                                    <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(237,237,237,0.4)', marginTop: 3 }}>Standard operation orders, briefings, and planning content.</div>
                                </button>
                                )}
                                {allowed('staff_orders') && (
                                <button type='button' onClick={() => setTypeModalStep('staff_section')}
                                    style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', color: 'rgba(245,185,11,0.9)', cursor: 'pointer' }}
                                >
                                    Staff Orders Page
                                    <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(245,158,11,0.45)', marginTop: 3 }}>Section-specific mission orders for platoon leaders and section commanders.</div>
                                </button>
                                )}
                                {allowed('zeus') && (
                                <button type='button' onClick={() => addPage('zeus')}
                                    style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, background: 'rgba(0,195,255,0.06)', border: '1px solid rgba(0,195,255,0.3)', color: 'rgba(0,195,255,0.85)', cursor: 'pointer' }}
                                >
                                    Zeus Notes Page
                                    <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(0,195,255,0.45)', marginTop: 3 }}>J6-only notes and gamemaster planning. Visible to J6 staff only.</div>
                                </button>
                                )}
                                {allowed('separator') && (
                                <button type='button' onClick={() => addPage('separator')}
                                    style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                    <HorizontalRule style={{ fontSize: 16, color: 'rgba(237,237,237,0.3)' }} />
                                    <div>
                                        Separator
                                        <div style={{ fontSize: '0.62rem', fontWeight: 400, color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>Visual divider to group documents. Double-click to add a label.</div>
                                    </div>
                                </button>
                                )}
                            </div>
                            </>
                        })()}

                        {typeModalStep === 'staff_section' && <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button type='button' onClick={() => setTypeModalStep('type')}
                                    style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                                >← Back</button>
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(245,185,11,0.9)' }}>Select Section</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {STAFF_SECTION_PRESETS.map(section => (
                                    <button key={section} type='button' onClick={() => addPage('staff_orders', section)}
                                        style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: 'rgba(245,185,11,0.85)', cursor: 'pointer' }}
                                    >
                                        {section}
                                    </button>
                                ))}
                                <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                                    <input
                                        type='text'
                                        value={staffSectionCustom}
                                        onChange={e => setStaffSectionCustom(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && staffSectionCustom.trim()) addPage('staff_orders', staffSectionCustom.trim()) }}
                                        placeholder='Custom section name…'
                                        style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem', padding: '7px 10px', outline: 'none' }}
                                    />
                                    <button type='button'
                                        onClick={() => { if (staffSectionCustom.trim()) addPage('staff_orders', staffSectionCustom.trim()) }}
                                        disabled={!staffSectionCustom.trim()}
                                        style={{ padding: '7px 14px', fontSize: '0.7rem', fontWeight: 700, background: staffSectionCustom.trim() ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,158,11,0.3)', color: staffSectionCustom.trim() ? 'rgba(245,185,11,0.9)' : 'rgba(237,237,237,0.25)', cursor: staffSectionCustom.trim() ? 'pointer' : 'not-allowed' }}
                                    >Add</button>
                                </div>
                            </div>
                        </>}

                        <button type='button' onClick={closeTypeModal}
                            style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer' }}
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            , document.body)}
        </div>
    )
}
