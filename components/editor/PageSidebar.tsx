'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Delete, Description, DragIndicator, Article, HorizontalRule, ContentCopy } from '@mui/icons-material'

interface PageEntry {
    id: string
    title: string
    isMain: boolean
    pageType?: string  // 'orders' | 'zeus' | 'ocap' | 'staff_orders' | 'aar' | 'separator'
    pageColor?: string
    parentId?: string
}

interface StaffSection {
    label: string
    color: string
    children: readonly string[] | null
}

const STAFF_SECTIONS: StaffSection[] = [
    { label: 'HQ Orders', color: '#ef4444', children: null },
    { label: '1PL', color: '#f59e0b', children: ['1-1 Alpha', '1-1 Bravo', '1-1 Charlie'] },
    { label: '2PL', color: '#10b981', children: ['1-2 Alpha', '1-2 Bravo', '1-2 Charlie'] },
    { label: '3PL', color: '#3b82f6', children: ['1-3 Echo', '1-3 Golf', '1-3 Hotel', '1-3 Mike', '1-3 Victor'] },
]

interface Props {
    ydoc: Y.Doc
    activePage: string
    onSelectPage: (id: string) => void
    themeColor: string
    orientation?: 'sidebar' | 'top'
    allowedTypes?: string[]
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

function hexA(hex: string, alpha: number) {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r},${g},${b},${alpha})`
}

export default function PageSidebar({ ydoc, activePage, onSelectPage, themeColor, orientation = 'sidebar', allowedTypes }: Props) {
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const [pages, setPages] = useState<PageEntry[]>([{ id: 'main', title: 'Main', isMain: true }])
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
    const [showTypeModal, setShowTypeModal]               = useState(false)
    const [typeModalStep, setTypeModalStep]               = useState<'type' | 'staff_section' | 'staff_subsection'>('type')
    const [staffSectionCustom, setStaffSectionCustom]     = useState('')
    const [selectedStaffParent, setSelectedStaffParent]   = useState<StaffSection | null>(null)
    const [colorPickerPageId, setColorPickerPageId]       = useState<string | null>(null)
    const [dragOverIdx, setDragOverIdx]                   = useState<number | null>(null)
    const [dragNestTargetId, setDragNestTargetId]         = useState<string | null>(null)

    const PAGE_COLOR_PRESETS = ['', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']
    const dragSrcRef = useRef<number>(-1)
    const renameInputRef = useRef<HTMLInputElement>(null)
    const defaultInitRef = useRef(false)

    // Auto-create default Zeus Notes page for brand-new empty documents
    useEffect(() => {
        const timer = setTimeout(() => {
            if (defaultInitRef.current) return
            const pageOrder = ydoc.getArray<string>('pageOrder')
            if (pageOrder.length === 0) {
                defaultInitRef.current = true
                const zeusId = Math.random().toString(36).slice(2, 10)
                const ocapId = Math.random().toString(36).slice(2, 10)
                ydoc.transact(() => {
                    pageOrder.push(['main'])
                    ydoc.getMap<string>('pmeta-main').set('title', 'Main')
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
            } else {
                defaultInitRef.current = true
            }
        }, 900)
        return () => clearTimeout(timer)
    }, [ydoc])

    useEffect(() => {
        const pageOrder = ydoc.getArray<string>('pageOrder')
        const metaObservers = new Map<string, () => void>()

        function rebuild() {
            const ids = pageOrder.length > 0 ? pageOrder.toArray() : ['main']
            setPages(ids.map(id => {
                const pmeta = ydoc.getMap<string>('pmeta-' + id)
                const fallback = id === 'main' ? 'Main' : 'Untitled'
                return { id, title: pmeta.get('title') || fallback, isMain: id === 'main', pageType: pmeta.get('pageType') || 'orders', pageColor: pmeta.get('pageColor') || '', parentId: pmeta.get('parentId') || undefined }
            }))
        }

        function observePageMeta(id: string) {
            if (metaObservers.has(id)) return
            const pmeta = ydoc.getMap<string>('pmeta-' + id)
            const handler = () => rebuild()
            pmeta.observe(handler)
            metaObservers.set(id, () => pmeta.unobserve(handler))
        }

        const orderHandler = () => {
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
    }, [ydoc])

    useEffect(() => {
        if (renamingId) renameInputRef.current?.focus()
    }, [renamingId])

    function addPage(type: 'orders' | 'zeus' | 'staff_orders' | 'aar' | 'separator', title?: string, color?: string) {
        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
        const defaultTitle = type === 'zeus' ? 'Zeus Notes'
            : type === 'separator' ? '──────────'
            : type === 'staff_orders' ? (title ?? 'Staff Orders')
            : type === 'aar' ? 'After Action Review'
            : 'New Page'
        ydoc.transact(() => {
            const pageOrder = ydoc.getArray<string>('pageOrder')
            if (pageOrder.length === 0) {
                pageOrder.push(['main'])
                ydoc.getMap<string>('pmeta-main').set('title', 'Main')
            }
            pageOrder.push([id])
            const pmeta = ydoc.getMap<string>('pmeta-' + id)
            pmeta.set('title', defaultTitle)
            pmeta.set('isMain', 'false')
            pmeta.set('pageType', type)
            if (color) pmeta.set('pageColor', color)
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
        setSelectedStaffParent(null)
    }

    function startRename(id: string, currentTitle: string) {
        setRenameValue(currentTitle)
        setRenamingId(id)
    }

    function commitRename() {
        if (!renamingId) return
        const fallback = renamingId === 'main' ? 'Main' : 'Untitled'
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
        if (activePage === id) onSelectPage('main')
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
                            {!page.isMain && isActive && !isRenaming && (
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
            width: 200,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            paddingRight: 12,
            borderRight: `1px solid rgba(255,255,255,0.07)`,
            marginRight: 8,
            position: 'sticky',
            top: 24,
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
        }}>
            <div style={{
                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'rgba(237,237,237,0.25)', marginBottom: 6, paddingLeft: 2,
            }}>
                Documents
            </div>

            {pages.map((page, idx) => {
                const isActive = page.id === activePage
                const isRenaming = renamingId === page.id
                const isConfirmingDelete = confirmingDeleteId === page.id
                const isDragOver = dragOverIdx === idx

                // ── Separator ─────────────────────────────────────────────────
                if (page.pageType === 'separator') {
                    return (
                        <div
                            key={page.id}
                            draggable
                            onDragStart={() => { dragSrcRef.current = idx }}
                            onDragOver={e => { e.preventDefault(); setDragOverIdx(idx) }}
                            onDragLeave={() => setDragOverIdx(null)}
                            onDrop={() => { movePage(dragSrcRef.current, idx); setDragOverIdx(null) }}
                            onDragEnd={() => setDragOverIdx(null)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', cursor: 'default', marginTop: 4 }}
                        >
                            <DragIndicator style={{ fontSize: 12, color: 'rgba(237,237,237,0.12)', cursor: 'grab', flexShrink: 0 }} />
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.09)' }} />
                            {isRenaming ? (
                                <input
                                    ref={renameInputRef}
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); e.stopPropagation() }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: 80, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)', outline: 'none', color: 'rgba(237,237,237,0.5)', fontSize: '0.55rem', fontWeight: 600, padding: '1px 2px', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                                />
                            ) : page.title && page.title !== '──────────' ? (
                                <span
                                    style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', whiteSpace: 'nowrap', flexShrink: 0 }}
                                    onDoubleClick={e => { e.stopPropagation(); startRename(page.id, page.title === '──────────' ? '' : page.title) }}
                                    title='Double-click to add label'
                                >
                                    {page.title}
                                </span>
                            ) : (
                                <span
                                    style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.08)', cursor: 'default', flexShrink: 0 }}
                                    onDoubleClick={e => { e.stopPropagation(); startRename(page.id, '') }}
                                    title='Double-click to add label'
                                >
                                    ···
                                </span>
                            )}
                            {!isRenaming && (
                                isConfirmingDelete ? (
                                    <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                        <button type='button' onClick={() => deletePage(page.id)} style={{ padding: '1px 5px', fontSize: '0.55rem', fontWeight: 700, background: 'rgba(200,40,40,0.7)', border: '1px solid rgba(200,40,40,0.9)', color: '#fff', cursor: 'pointer', borderRadius: 3 }}>Del</button>
                                        <button type='button' onClick={() => setConfirmingDeleteId(null)} style={{ padding: '1px 5px', fontSize: '0.55rem', fontWeight: 700, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer', borderRadius: 3 }}>✕</button>
                                    </div>
                                ) : (
                                    <button type='button' onClick={e => { e.stopPropagation(); setConfirmingDeleteId(page.id) }}
                                        style={{ background: 'transparent', border: 'none', padding: 1, cursor: 'pointer', color: 'rgba(237,237,237,0.15)', display: 'flex', alignItems: 'center', borderRadius: 2, flexShrink: 0 }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(220,60,60,0.7)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.15)' }}
                                    >
                                        <Delete style={{ fontSize: 11 }} />
                                    </button>
                                )
                            )}
                        </div>
                    )
                }

                // Per-page-type accent colors (only applied when active)
                const staffColor = page.pageType === 'staff_orders' && page.pageColor ? page.pageColor : null
                const accent = page.pageType === 'zeus'
                    ? { bg: 'rgba(0,195,255,0.08)', border: 'rgba(0,195,255,0.25)', left: '2px solid rgba(0,195,255,0.7)', icon: isActive ? 'rgba(0,195,255,0.85)' : 'rgba(0,195,255,0.4)', text: isActive ? 'rgba(0,195,255,0.9)' : 'rgba(0,195,255,0.5)' }
                    : page.pageType === 'ocap'
                    ? { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', left: '2px solid rgba(16,185,129,0.7)', icon: isActive ? 'rgba(16,185,129,0.85)' : 'rgba(16,185,129,0.4)', text: isActive ? 'rgba(16,185,129,0.9)' : 'rgba(16,185,129,0.5)' }
                    : staffColor
                    ? { bg: hexA(staffColor, 0.08), border: hexA(staffColor, 0.25), left: `2px solid ${hexA(staffColor, 0.7)}`, icon: isActive ? hexA(staffColor, 0.85) : hexA(staffColor, 0.4), text: isActive ? hexA(staffColor, 0.95) : hexA(staffColor, 0.55) }
                    : page.pageType === 'staff_orders'
                    ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', left: '2px solid rgba(245,158,11,0.7)', icon: isActive ? 'rgba(245,158,11,0.85)' : 'rgba(245,158,11,0.4)', text: isActive ? 'rgba(245,185,11,0.95)' : 'rgba(245,158,11,0.55)' }
                    : page.pageType === 'aar'
                    ? { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', left: '2px solid rgba(99,102,241,0.7)', icon: isActive ? 'rgba(99,102,241,0.85)' : 'rgba(99,102,241,0.4)', text: isActive ? 'rgba(139,140,255,0.95)' : 'rgba(99,102,241,0.55)' }
                    : { bg: c(0.12), border: c(0.3), left: `2px solid ${c(0.85)}`, icon: isActive ? c(0.85) : 'rgba(237,237,237,0.3)', text: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.5)' }

                const pageIcon = page.pageType === 'staff_orders'
                    ? <Article style={{ fontSize: 13, color: accent.icon, flexShrink: 0 }} />
                    : <Description style={{ fontSize: 13, color: accent.icon, flexShrink: 0 }} />

                const isNestTarget = dragNestTargetId === page.id

                return (
                    <div
                        key={page.id}
                        style={{ paddingLeft: page.parentId ? 16 : 0 }}
                    >
                    <div
                        draggable
                        onDragStart={() => { dragSrcRef.current = idx }}
                        onDragOver={e => {
                            e.preventDefault()
                            const rect = e.currentTarget.getBoundingClientRect()
                            const yRel = (e.clientY - rect.top) / rect.height
                            if (yRel < 0.35 || yRel > 0.65) {
                                setDragOverIdx(idx)
                                setDragNestTargetId(null)
                            } else {
                                setDragNestTargetId(page.id)
                                setDragOverIdx(null)
                            }
                        }}
                        onDragLeave={() => { setDragOverIdx(null); setDragNestTargetId(null) }}
                        onDrop={() => {
                            if (dragNestTargetId === page.id) {
                                const srcPage = pages[dragSrcRef.current]
                                if (srcPage) nestPage(srcPage.id, page.id)
                            } else {
                                movePage(dragSrcRef.current, idx)
                            }
                            setDragOverIdx(null)
                            setDragNestTargetId(null)
                        }}
                        onDragEnd={() => { setDragOverIdx(null); setDragNestTargetId(null) }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '6px 8px',
                            borderRadius: 4,
                            background: isNestTarget ? 'rgba(255,255,255,0.07)' : isDragOver ? c(0.08) : isActive ? accent.bg : 'transparent',
                            borderTop: isActive ? `1px solid ${accent.border}` : isDragOver ? `2px solid ${c(0.5)}` : isNestTarget ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                            borderRight: isActive ? `1px solid ${accent.border}` : isNestTarget ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                            borderBottom: isActive ? `1px solid ${accent.border}` : isNestTarget ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                            borderLeft: isActive ? accent.left : isNestTarget ? '2px solid rgba(255,255,255,0.4)' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.1s',
                            position: 'relative',
                        }}
                        onClick={() => { if (!isRenaming) onSelectPage(page.id) }}
                        onMouseEnter={e => {
                            if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
                        }}
                        onMouseLeave={e => {
                            if (!isActive) (e.currentTarget as HTMLDivElement).style.background = isNestTarget ? 'rgba(255,255,255,0.07)' : isDragOver ? c(0.08) : 'transparent'
                        }}
                    >
                        <DragIndicator style={{ fontSize: 14, flexShrink: 0, color: 'rgba(237,237,237,0.15)', cursor: 'grab' }} />
                        {pageIcon}

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
                                    flex: 1, minWidth: 0,
                                    fontSize: '0.72rem', fontWeight: isActive ? 700 : 500,
                                    color: accent.text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    letterSpacing: '0.02em',
                                }}
                                onDoubleClick={e => { e.stopPropagation(); startRename(page.id, page.title) }}
                                title={`${page.title}${page.pageType === 'zeus' ? ' (Zeus Notes — J6 only)' : page.pageType === 'ocap' ? ' (OCAP)' : page.pageType === 'staff_orders' ? ' (Staff Orders)' : page.pageType === 'aar' ? ' (After Action Review)' : ''} (double-click to rename)`}
                            >
                                {page.title}
                            </span>
                        )}

                        {!page.isMain && !isRenaming && (
                            isConfirmingDelete ? (
                                <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                                    <button type='button' onClick={() => deletePage(page.id)}
                                        style={{ padding: '1px 5px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(200,40,40,0.7)', border: '1px solid rgba(200,40,40,0.9)', color: '#fff', cursor: 'pointer', borderRadius: 3 }}>
                                        Del
                                    </button>
                                    <button type='button' onClick={() => setConfirmingDeleteId(null)}
                                        style={{ padding: '1px 5px', fontSize: '0.6rem', fontWeight: 700, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer', borderRadius: 3 }}>
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 1, opacity: isActive ? 1 : 0, transition: 'opacity 0.12s' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = isActive ? '1' : '0' }}
                                >
                                    <button type='button' title='Duplicate page'
                                        onClick={e => { e.stopPropagation(); duplicatePage(page.id) }}
                                        style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'rgba(237,237,237,0.2)', display: 'flex', alignItems: 'center', borderRadius: 3, transition: 'color 0.12s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(100,180,237,0.8)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.2)' }}
                                    >
                                        <ContentCopy style={{ fontSize: 11 }} />
                                    </button>
                                    <button type='button' title='Delete page'
                                        onClick={e => { e.stopPropagation(); setConfirmingDeleteId(page.id) }}
                                        style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'rgba(237,237,237,0.2)', display: 'flex', alignItems: 'center', borderRadius: 3, transition: 'color 0.12s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(220,60,60,0.8)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.2)' }}
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
                    marginTop: 8, padding: '6px 8px',
                    background: 'transparent',
                    border: `1px dashed ${c(0.25)}`,
                    color: c(0.45),
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'all 0.15s', borderRadius: 4, width: '100%',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = c(0.6); e.currentTarget.style.color = c(0.85) }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = c(0.25); e.currentTarget.style.color = c(0.45) }}
            >
                + Add Document
            </button>

            {/* Document type selection modal */}
            {showTypeModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) closeTypeModal() }}
                >
                    <div style={{ background: '#0f0f10', border: `1px solid ${c(0.35)}`, borderTop: `2px solid ${c(0.8)}`, padding: '24px 28px', maxWidth: 400, width: '90%', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                                    {allowed('aar') && (
                                        <button type='button' onClick={() => addPage('aar')}
                                            style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.3)', color: 'rgba(139,140,255,0.9)', cursor: 'pointer' }}
                                        >
                                            After Action Review
                                            <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(99,102,241,0.45)', marginTop: 3 }}>Post-operation review and lessons learned. Added after the mission completes.</div>
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
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Select Unit</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {STAFF_SECTIONS.map(section => {
                                    const ra = (a: number) => hexA(section.color, a)
                                    return (
                                        <button key={section.label} type='button'
                                            onClick={() => {
                                                if (section.children) {
                                                    setSelectedStaffParent(section)
                                                    setTypeModalStep('staff_subsection')
                                                } else {
                                                    addPage('staff_orders', section.label, section.color)
                                                }
                                            }}
                                            style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, background: ra(0.06), border: `1px solid ${ra(0.3)}`, color: ra(0.9), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <span>{section.label}</span>
                                            {section.children && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>›</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        </>}

                        {typeModalStep === 'staff_subsection' && selectedStaffParent && (() => {
                            const parent = selectedStaffParent
                            const ra = (a: number) => hexA(parent.color, a)
                            return <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <button type='button' onClick={() => { setTypeModalStep('staff_section'); setSelectedStaffParent(null) }}
                                        style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                                    >← Back</button>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: ra(0.9) }}>{parent.label}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {parent.children?.map(child => (
                                        <button key={child} type='button'
                                            onClick={() => addPage('staff_orders', child, parent.color)}
                                            style={{ padding: '9px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, background: ra(0.05), border: `1px solid ${ra(0.25)}`, color: ra(0.85), cursor: 'pointer' }}
                                        >
                                            {child}
                                        </button>
                                    ))}
                                    <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                                        <input
                                            type='text'
                                            value={staffSectionCustom}
                                            onChange={e => setStaffSectionCustom(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && staffSectionCustom.trim()) addPage('staff_orders', staffSectionCustom.trim(), parent.color) }}
                                            placeholder='Custom callsign…'
                                            style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem', padding: '7px 10px', outline: 'none' }}
                                        />
                                        <button type='button'
                                            onClick={() => { if (staffSectionCustom.trim()) addPage('staff_orders', staffSectionCustom.trim(), parent.color) }}
                                            disabled={!staffSectionCustom.trim()}
                                            style={{ padding: '7px 14px', fontSize: '0.7rem', fontWeight: 700, background: staffSectionCustom.trim() ? ra(0.18) : 'rgba(255,255,255,0.04)', border: `1px solid ${ra(0.3)}`, color: staffSectionCustom.trim() ? ra(0.9) : 'rgba(237,237,237,0.25)', cursor: staffSectionCustom.trim() ? 'pointer' : 'not-allowed' }}
                                        >Add</button>
                                    </div>
                                </div>
                            </>
                        })()}

                        <button type='button' onClick={closeTypeModal}
                            style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer' }}
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
