'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Delete, Description } from '@mui/icons-material'

interface PageEntry {
    id: string
    title: string
    isMain: boolean
}

interface Props {
    ydoc: Y.Doc
    activePage: string
    onSelectPage: (id: string) => void
    themeColor: string
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

export default function PageSidebar({ ydoc, activePage, onSelectPage, themeColor }: Props) {
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const [pages, setPages] = useState<PageEntry[]>([{ id: 'main', title: 'Main', isMain: true }])
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
    const renameInputRef = useRef<HTMLInputElement>(null)

    // Observe pageOrder and pmeta maps
    useEffect(() => {
        const pageOrder = ydoc.getArray<string>('pageOrder')

        function rebuild() {
            const ids = pageOrder.length > 0 ? pageOrder.toArray() : ['main']
            setPages(ids.map(id => {
                if (id === 'main') return { id: 'main', title: 'Main', isMain: true }
                const pmeta = ydoc.getMap<string>('pmeta-' + id)
                return { id, title: pmeta.get('title') || 'Untitled', isMain: false }
            }))
        }

        // Deep observe: also watch pmeta maps for title changes
        const metaObservers = new Map<string, () => void>()

        function observePageMeta(id: string) {
            if (id === 'main' || metaObservers.has(id)) return
            const pmeta = ydoc.getMap<string>('pmeta-' + id)
            const handler = () => rebuild()
            pmeta.observe(handler)
            metaObservers.set(id, () => pmeta.unobserve(handler))
        }

        const orderHandler = () => {
            pageOrder.toArray().forEach(observePageMeta)
            rebuild()
        }
        pageOrder.observe(orderHandler)
        pageOrder.toArray().forEach(observePageMeta)
        rebuild()

        return () => {
            pageOrder.unobserve(orderHandler)
            metaObservers.forEach(unsub => unsub())
        }
    }, [ydoc])

    // Focus rename input when it appears
    useEffect(() => {
        if (renamingId) renameInputRef.current?.focus()
    }, [renamingId])

    function addPage() {
        const id = Math.random().toString(36).slice(2, 10)
        ydoc.transact(() => {
            const pageOrder = ydoc.getArray<string>('pageOrder')
            if (pageOrder.length === 0) pageOrder.push(['main'])
            pageOrder.push([id])
            const pmeta = ydoc.getMap<string>('pmeta-' + id)
            pmeta.set('title', 'New Page')
            pmeta.set('isMain', 'false')
        })
        // Switch to the new page and start renaming it
        setTimeout(() => {
            onSelectPage(id)
            setRenameValue('New Page')
            setRenamingId(id)
        }, 0)
    }

    function startRename(id: string, currentTitle: string) {
        setRenameValue(currentTitle)
        setRenamingId(id)
    }

    function commitRename() {
        if (!renamingId) return
        const trimmed = renameValue.trim() || 'Untitled'
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
                Pages
            </div>

            {pages.map(page => {
                const isActive = page.id === activePage
                const isRenaming = renamingId === page.id
                const isConfirmingDelete = confirmingDeleteId === page.id

                return (
                    <div
                        key={page.id}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 8px',
                            borderRadius: 4,
                            background: isActive ? c(0.12) : 'transparent',
                            border: isActive ? `1px solid ${c(0.3)}` : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.12s',
                            position: 'relative',
                        }}
                        onClick={() => { if (!isRenaming) onSelectPage(page.id) }}
                        onMouseEnter={e => {
                            if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
                        }}
                        onMouseLeave={e => {
                            if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                        }}
                    >
                        <Description style={{ fontSize: 14, color: isActive ? c(0.85) : 'rgba(237,237,237,0.3)', flexShrink: 0 }} />

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
                                    color: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.5)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    letterSpacing: '0.02em',
                                }}
                                onDoubleClick={e => { e.stopPropagation(); if (!page.isMain) startRename(page.id, page.title) }}
                                title={page.isMain ? page.title : `${page.title} (double-click to rename)`}
                            >
                                {page.title}
                            </span>
                        )}

                        {!page.isMain && !isRenaming && (
                            isConfirmingDelete ? (
                                <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                                    <button
                                        type='button'
                                        onClick={() => deletePage(page.id)}
                                        style={{
                                            padding: '1px 5px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em',
                                            background: 'rgba(200,40,40,0.7)', border: '1px solid rgba(200,40,40,0.9)',
                                            color: '#fff', cursor: 'pointer', borderRadius: 3,
                                        }}
                                    >
                                        Del
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() => setConfirmingDeleteId(null)}
                                        style={{
                                            padding: '1px 5px', fontSize: '0.6rem', fontWeight: 700,
                                            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                                            color: 'rgba(237,237,237,0.5)', cursor: 'pointer', borderRadius: 3,
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type='button'
                                    title='Delete page'
                                    onClick={e => { e.stopPropagation(); setConfirmingDeleteId(page.id) }}
                                    style={{
                                        background: 'transparent', border: 'none', padding: 2, cursor: 'pointer',
                                        color: 'rgba(237,237,237,0.2)', display: 'flex', alignItems: 'center',
                                        borderRadius: 3, transition: 'color 0.12s',
                                        opacity: isActive ? 1 : 0,
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(220,60,60,0.8)'; (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.2)'; (e.currentTarget as HTMLButtonElement).style.opacity = isActive ? '1' : '0' }}
                                >
                                    <Delete style={{ fontSize: 13 }} />
                                </button>
                            )
                        )}
                    </div>
                )
            })}

            <button
                type='button'
                onClick={addPage}
                style={{
                    marginTop: 8, padding: '6px 8px',
                    background: 'transparent',
                    border: `1px dashed ${c(0.25)}`,
                    color: c(0.45),
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'all 0.15s', borderRadius: 4,
                    width: '100%',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = c(0.6); e.currentTarget.style.color = c(0.85) }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = c(0.25); e.currentTarget.style.color = c(0.45) }}
            >
                + Add Page
            </button>
        </div>
    )
}
