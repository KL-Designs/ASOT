'use client'

import React, { useContext, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { contentExtensions, FontSize } from './content-extensions'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import Collaboration from '@tiptap/extension-collaboration'
import { Extension } from '@tiptap/core'
import { yCursorPlugin, defaultSelectionBuilder } from '@tiptap/y-tiptap'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import PageSidebar from './PageSidebar'
import IntelPackageEditor from './intel-package/IntelPackageEditor'
import ImageLibraryModal from './ImageLibraryModal'
import { useThinScrollFade } from './useThinScrollFade'
import {
    FormatAlignLeft, FormatAlignCenter, FormatAlignRight,
    Delete, Lock, LockOpen,
} from '@mui/icons-material'


const ThemeContext = React.createContext('#db001d')

interface Props {
    documentId: string
    uploadUrl?: string
    defaultSectionTitle?: string
    initialContent?: any
    initialMeta?: Record<string, string>
    onMetaChange?: (fields: Record<string, string>) => void
    metaHandleRef?: React.MutableRefObject<{ set: (key: string, value: string) => void } | null>
    onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void
    themeColor?: string
    readOnly?: boolean
    allowedTypes?: string[]
    /** Fired once the Hocuspocus provider exists, so a caller (the status bar's
     * presence/connection state) can reach it without this component needing
     * to expose anything else. See task-12's ruling: this is the only prop
     * CollabEditor may gain. */
    onProviderReady?: (provider: HocuspocusProvider) => void
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

interface PresenceUser {
    name: string
    color: string
    avatar: string | null
}

interface Peer extends PresenceUser {
    clientId: number
}

interface ReadyState {
    provider: HocuspocusProvider
    ydoc: Y.Doc
    user: PresenceUser
}

const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:3000/collab'

// ─── Outer shell ─────────────────────────────────────────────────────────────

export default function CollabEditor({
    documentId,
    uploadUrl = '/api/upload',
    defaultSectionTitle = 'Section',
    initialContent,
    initialMeta,
    onMetaChange,
    metaHandleRef,
    onSaveStatusChange,
    themeColor = '#db001d',
    readOnly = false,
    allowedTypes,
    onProviderReady,
}: Props) {
    const [ydoc] = useState(() => new Y.Doc())
    const [ready, setReady] = useState<ReadyState | null>(null)
    const [isSynced, setIsSynced] = useState(false)
    const onMetaChangeRef = useRef(onMetaChange)
    useEffect(() => { onMetaChangeRef.current = onMetaChange }, [onMetaChange])

    useEffect(() => {
        let destroyed = false
        let p: HocuspocusProvider | null = null

        const meta = ydoc.getMap<string>('meta')
        const onObserve = () => {
            const fields: Record<string, string> = {}
            meta.forEach((v, k) => { fields[k] = v })
            onMetaChangeRef.current?.(fields)
        }
        meta.observe(onObserve)
        if (metaHandleRef) metaHandleRef.current = { set: (key, value) => meta.set(key, value) }

        fetch('/api/me/token')
            .then(r => r.json())
            .then(({ token, name, color, avatar }) => {
                if (destroyed || !token) return
                const user: PresenceUser = { name: name || 'Unknown', color: color || '#db001d', avatar: avatar || null }
                p = new HocuspocusProvider({
                    url: COLLAB_WS_URL,
                    name: documentId,
                    document: ydoc,
                    token,
                    onSynced: () => {
                        setTimeout(() => onSaveStatusChange?.('saved'), 0)
                        if (meta.size === 0 && initialMeta) {
                            ydoc.transact(() => {
                                Object.entries(initialMeta).forEach(([k, v]) => {
                                    if (v) meta.set(k, v)
                                })
                            })
                        }
                        setIsSynced(true)
                    },
                    onStatus: ({ status }) => {
                        if (status === 'connecting') setTimeout(() => onSaveStatusChange?.('saving'), 0)
                        if (status === 'connected') setTimeout(() => onSaveStatusChange?.('saved'), 0)
                        if (status === 'disconnected') setTimeout(() => onSaveStatusChange?.('unsaved'), 0)
                    },
                })
                if (!destroyed) {
                    setReady({ provider: p, ydoc, user })
                    onProviderReady?.(p)
                }
            })

        return () => {
            destroyed = true
            p?.destroy()
            setReady(null)
            setIsSynced(false)
            meta.unobserve(onObserve)
            if (metaHandleRef) metaHandleRef.current = null
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId, ydoc])

    if (!ready) {
        // Token-only, full-bleed "connecting" state (visual-fixes FIX 5) —
        // fills CollabEditor's own root exactly the way the ready-state
        // editor column does (EditorShell's wrapper around `brief` already
        // gives this a definite `height: 100%` to fill), centred both axes,
        // no red. The skeleton lines echo the real document's own shape —
        // eyebrow, title, three body lines — rather than arbitrary bars.
        return (
            <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
                <style>{`
                    @keyframes op-conn-pulse { 0%, 100% { opacity: .4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
                    @keyframes op-conn-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
                    .op-conn-dot { animation: op-conn-pulse 1.4s ease-in-out infinite; }
                    .op-conn-skel {
                        background-image: linear-gradient(90deg, var(--s1) 0%, var(--s2) 50%, var(--s1) 100%);
                        background-size: 240px 100%;
                        background-repeat: no-repeat;
                        animation: op-conn-shimmer 1.6s ease-in-out infinite;
                    }
                `}</style>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: 'min(360px, 80%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className='op-conn-dot' style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--acc)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                            Connecting to collaboration server
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                        {/* Eyebrow */}
                        <div className='op-conn-skel' style={{ height: 7, width: '32%', borderRadius: 2 }} />
                        {/* Title */}
                        <div className='op-conn-skel' style={{ height: 15, width: '68%', borderRadius: 2, marginTop: 2, animationDelay: '0.1s' }} />
                        {/* Body lines */}
                        <div className='op-conn-skel' style={{ height: 9, width: '100%', borderRadius: 2, marginTop: 12, animationDelay: '0.2s' }} />
                        <div className='op-conn-skel' style={{ height: 9, width: '91%', borderRadius: 2, animationDelay: '0.3s' }} />
                        <div className='op-conn-skel' style={{ height: 9, width: '76%', borderRadius: 2, animationDelay: '0.4s' }} />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <ActiveEditor
            ydoc={ready.ydoc}
            provider={ready.provider}
            user={ready.user}
            operationId={documentId}
            uploadUrl={uploadUrl}
            defaultSectionTitle={defaultSectionTitle}
            initialContent={initialContent}
            onSaveStatusChange={onSaveStatusChange}
            themeColor={themeColor}
            readOnly={readOnly}
            synced={isSynced}
            allowedTypes={allowedTypes}
        />
    )
}

function buildCursorExtension(provider: HocuspocusProvider, user: PresenceUser) {
    return Extension.create({
        name: 'collaborationCursor',
        addProseMirrorPlugins() {
            return [
                yCursorPlugin(
                    (() => {
                        const awareness = provider.awareness!
                        awareness.setLocalStateField('user', user)
                        return awareness
                    })(),
                    {
                        cursorBuilder: (u: any) => {
                            const el = document.createElement('span')
                            el.classList.add('collaboration-cursor__caret')
                            el.setAttribute('style', `border-color: ${u.color}`)
                            const label = document.createElement('div')
                            label.classList.add('collaboration-cursor__label')
                            label.setAttribute('style', `background-color: ${u.color}`)
                            label.textContent = u.name
                            el.appendChild(label)
                            return el
                        },
                        selectionBuilder: defaultSelectionBuilder,
                    }
                ),
            ]
        },
    })
}

// ─── Resizable image node view ────────────────────────────────────────────────

type ImgPosition = 'break' | 'wrap-left' | 'wrap-right' | 'inline'

function ResizableImageView({ node, selected, updateAttributes }: {
    node: any; selected: boolean; updateAttributes: (attrs: Record<string, any>) => void
}) {
    const themeColor = useContext(ThemeContext)
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    const { src, alt, title, width, align, position, borderStyle, borderColor: imgBorderColor, borderWidth } = node.attrs as { src: string; alt: string; title: string; width: number | null; align: string; position: ImgPosition; borderStyle: string; borderColor: string; borderWidth: number }
    const containerRef = useRef<HTMLDivElement>(null)
    const startXRef = useRef(0)
    const startWRef = useRef(0)

    function onResizeStart(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        startXRef.current = e.clientX
        startWRef.current = containerRef.current?.offsetWidth || 300
        const onMove = (ev: MouseEvent) => {
            const newWidth = Math.max(80, startWRef.current + (ev.clientX - startXRef.current))
            updateAttributes({ width: Math.round(newWidth) })
        }
        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    const justifyMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

    const wrapperStyle: React.CSSProperties = position === 'wrap-left'
        ? { display: 'block', float: 'left', margin: '0 1.2em 0.6em 0', lineHeight: 0, clear: 'left' }
        : position === 'wrap-right'
        ? { display: 'block', float: 'right', margin: '0 0 0.6em 1.2em', lineHeight: 0, clear: 'right' }
        : position === 'inline'
        ? { display: 'inline-flex', margin: '0 4px', verticalAlign: 'middle', lineHeight: 0 }
        : { display: 'flex', justifyContent: justifyMap[align] || 'center', margin: '1.5em 0', lineHeight: 0 }

    const POSITION_OPTS: { key: ImgPosition; label: string; title: string }[] = [
        { key: 'break',      label: 'BRK', title: 'Block — full line break'     },
        { key: 'wrap-left',  label: '⇐W',  title: 'Wrap Left — text wraps right' },
        { key: 'wrap-right', label: 'W⇒',  title: 'Wrap Right — text wraps left' },
        { key: 'inline',     label: 'INL', title: 'Inline — flows with text'     },
    ]

    return (
        <NodeViewWrapper style={wrapperStyle as any}>
            <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: width ? `${width}px` : (position === 'break' ? '100%' : undefined), maxWidth: '100%' }}>
                {selected && (
                    <div
                        onMouseDown={e => e.preventDefault()}
                        style={{ position: 'absolute', top: -38, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(10,10,10,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 5px', zIndex: 20, whiteSpace: 'nowrap', flexWrap: 'wrap', maxWidth: 400 }}
                    >
                        {/* Alignment (break mode only) */}
                        {position !== 'inline' && position !== 'wrap-left' && position !== 'wrap-right' && (['left', 'center', 'right'] as const).map(a => (
                            <button key={a} type='button' title={`Align ${a}`}
                                onMouseDown={e => { e.preventDefault(); updateAttributes({ align: a }) }}
                                style={{ padding: '3px 5px', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', background: align === a ? c(0.2) : 'transparent', border: align === a ? `1px solid ${c(0.4)}` : '1px solid transparent', color: align === a ? c(0.9) : 'rgba(237,237,237,0.5)' }}
                            >
                                {a === 'left' && <FormatAlignLeft style={{ fontSize: 14 }} />}
                                {a === 'center' && <FormatAlignCenter style={{ fontSize: 14 }} />}
                                {a === 'right' && <FormatAlignRight style={{ fontSize: 14 }} />}
                            </button>
                        ))}
                        {position === 'break' && <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />}
                        {/* FIT button */}
                        <button type='button' title='Reset to full width'
                            onMouseDown={e => { e.preventDefault(); updateAttributes({ width: null }) }}
                            style={{ padding: '3px 6px', borderRadius: 2, cursor: 'pointer', background: !width ? c(0.2) : 'transparent', border: !width ? `1px solid ${c(0.4)}` : '1px solid transparent', color: 'rgba(237,237,237,0.5)', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em' }}
                        >
                            FIT
                        </button>
                        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
                        {/* Position buttons */}
                        {POSITION_OPTS.map(p => (
                            <button key={p.key} type='button' title={p.title}
                                onMouseDown={e => { e.preventDefault(); updateAttributes({ position: p.key }) }}
                                style={{ padding: '3px 5px', borderRadius: 2, cursor: 'pointer', background: position === p.key ? 'rgba(245,158,11,0.2)' : 'transparent', border: position === p.key ? '1px solid rgba(245,158,11,0.5)' : '1px solid transparent', color: position === p.key ? 'rgba(245,185,11,0.9)' : 'rgba(237,237,237,0.45)', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em' }}
                            >
                                {p.label}
                            </button>
                        ))}
                        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
                        {/* Border controls */}
                        {(['none', 'solid', 'dashed', 'dotted'] as const).map(bs => (
                            <button key={bs} type='button' title={`Border: ${bs}`}
                                onMouseDown={e => { e.preventDefault(); updateAttributes({ borderStyle: bs }) }}
                                style={{ padding: '3px 5px', borderRadius: 2, cursor: 'pointer', background: borderStyle === bs ? 'rgba(80,200,120,0.2)' : 'transparent', border: borderStyle === bs ? '1px solid rgba(80,200,120,0.5)' : '1px solid transparent', color: borderStyle === bs ? 'rgba(80,200,120,0.9)' : 'rgba(237,237,237,0.45)', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em' }}
                            >
                                {bs === 'none' ? 'NO BDR' : bs.toUpperCase().slice(0, 4)}
                            </button>
                        ))}
                        {borderStyle !== 'none' && (<>
                            {([1, 2, 3, 4] as const).map(w => (
                                <button key={w} type='button' title={`Border width ${w}px`}
                                    onMouseDown={e => { e.preventDefault(); updateAttributes({ borderWidth: w }) }}
                                    style={{ padding: '3px 5px', borderRadius: 2, cursor: 'pointer', background: borderWidth === w ? 'rgba(80,200,120,0.15)' : 'transparent', border: borderWidth === w ? '1px solid rgba(80,200,120,0.4)' : '1px solid transparent', color: 'rgba(237,237,237,0.5)', fontSize: 9, fontWeight: 800 }}
                                >{w}px</button>
                            ))}
                            <input type='color' value={imgBorderColor}
                                onMouseDown={e => e.stopPropagation()}
                                onChange={e => updateAttributes({ borderColor: e.target.value })}
                                style={{ width: 18, height: 18, padding: 0, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 2, cursor: 'pointer', background: 'none' }}
                            />
                        </>)}
                    </div>
                )}
                <img src={src} alt={alt || ''} title={title || ''} draggable={false}
                    style={{ display: 'block', width: width ? `${width}px` : '100%', maxWidth: '100%', height: 'auto', border: borderStyle !== 'none' ? `${borderWidth}px ${borderStyle} ${imgBorderColor}` : selected ? `2px solid ${c(0.6)}` : '1px solid rgba(255,255,255,0.06)' }}
                />
                {selected && (
                    <div onMouseDown={onResizeStart}
                        style={{ position: 'absolute', bottom: 4, right: 4, width: 12, height: 12, background: c(0.85), border: '2px solid rgba(255,255,255,0.7)', borderRadius: 2, cursor: 'se-resize', zIndex: 10 }}
                    />
                )}
            </div>
        </NodeViewWrapper>
    )
}

const ResizableImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: el => {
                    const w = el.getAttribute('width') || el.style.width
                    return w ? (parseInt(w, 10) || null) : null
                },
                renderHTML: attrs => attrs.width ? { style: `width:${attrs.width}px`, width: attrs.width } : {},
            },
            align: {
                default: 'center',
                parseHTML: el => el.getAttribute('data-align') || 'center',
                renderHTML: attrs => ({ 'data-align': attrs.align || 'center' }),
            },
            position: {
                default: 'break',
                parseHTML: el => (el.getAttribute('data-position') as ImgPosition) || 'break',
                renderHTML: attrs => ({ 'data-position': attrs.position || 'break' }),
            },
            borderStyle: {
                default: 'none',
                parseHTML: el => el.getAttribute('data-border-style') || 'none',
                renderHTML: attrs => ({ 'data-border-style': attrs.borderStyle || 'none' }),
            },
            borderColor: {
                default: '#ffffff',
                parseHTML: el => el.getAttribute('data-border-color') || '#ffffff',
                renderHTML: attrs => ({ 'data-border-color': attrs.borderColor || '#ffffff' }),
            },
            borderWidth: {
                default: 2,
                parseHTML: el => parseInt(el.getAttribute('data-border-width') || '2'),
                renderHTML: attrs => ({ 'data-border-width': String(attrs.borderWidth ?? 2) }),
            },
        }
    },
    addNodeView() {
        return ReactNodeViewRenderer(ResizableImageView)
    },
})

// ─── Active Editor ────────────────────────────────────────────────────────────

interface ActiveEditorProps {
    ydoc: Y.Doc
    provider: HocuspocusProvider
    user: PresenceUser
    operationId: string
    uploadUrl: string
    defaultSectionTitle: string
    initialContent?: any
    onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void
    themeColor?: string
    readOnly?: boolean
    synced?: boolean
    allowedTypes?: string[]
}

function ActiveEditor({ ydoc, provider, user, operationId, uploadUrl, defaultSectionTitle, initialContent, onSaveStatusChange, themeColor = '#db001d', readOnly = false, synced = false, allowedTypes }: ActiveEditorProps) {
    const [activePage, setActivePage] = useState<string>('main')
    const [activePageType, setActivePageType] = useState<string>('orders')
    const [activePageTitle, setActivePageTitle] = useState<string>('')
    const [sectionIds, setSectionIds] = useState<string[]>([])
    const [seedSectionId, setSeedSectionId] = useState<string | null>(null)
    const [peers, setPeers] = useState<Peer[]>([])
    const [isMobile, setIsMobile] = useState(false)
    // The one shared formatting toolbar (visual-fixes spec §1) dispatches to
    // whichever section's editor last reported focus — set/cleared by each
    // SectionEditor's own onFocus/onBlur below. null means "nothing focused",
    // which the toolbar renders as disabled rather than guessing a target.
    // `activeSectionId` drives each section's own focus ring (spec §3);
    // kept separate from `activeEditor` because SectionEditor only knows its
    // own id, not its own Editor instance, until useEditor() returns it.
    const [activeEditor, setActiveEditor] = useState<Editor | null>(null)
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
    // Lets the blur handler below tell "focus moved into the toolbar itself"
    // (a button, a select, a popover — keep the target) apart from "focus
    // left the document entirely" (clear it), via the blur event's
    // relatedTarget. Without this, mousedown on a toolbar button blurs the
    // editor and clears activeEditor before the button's own onClick (which
    // reads activeEditor via the `editor` prop closure) ever runs.
    const toolbarRef = useRef<HTMLDivElement>(null)

    // The editor column is its own scroll container on desktop (see the
    // `overflowY` note on the column div below), so it gets the same thin
    // fading overlay scrollbar treatment `.mainScroll` has.
    const columnScrollRef = useThinScrollFade<HTMLDivElement>()

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    function getPageKeys(pageId: string) {
        if (pageId === 'main') return {
            orderKey: 'sectionOrder',
            metaPrefix: (id: string) => `smeta-${id}`,
        }
        return {
            orderKey: `sectionOrder-${pageId}`,
            metaPrefix: (id: string) => `smeta-${pageId}-${id}`,
        }
    }

    useEffect(() => {
        const pmeta = ydoc.getMap<string>('pmeta-' + activePage)
        const read = () => {
            setActivePageType(pmeta.get('pageType') || (activePage === 'main' ? 'orders' : 'orders'))
            // Section eyebrow (visual-fixes spec §2) — the document's own
            // title, read straight off the same pmeta map PageSidebar uses,
            // not a new field.
            setActivePageTitle(pmeta.get('title') || (activePage === 'main' ? 'CHQ Orders' : 'Untitled'))
        }
        pmeta.observe(read)
        read()
        return () => pmeta.unobserve(read)
    }, [ydoc, activePage])

    useEffect(() => {
        const { orderKey } = getPageKeys(activePage)
        const order = ydoc.getArray<string>(orderKey)
        const handler = () => setSectionIds([...order.toArray()])
        order.observe(handler)
        setSectionIds([...order.toArray()])
        return () => order.unobserve(handler)
    }, [ydoc, activePage])

    useEffect(() => {
        const onSynced = () => {
            const order = ydoc.getArray<string>('sectionOrder')
            if (order.length === 0) {
                const id = Math.random().toString(36).slice(2, 10)
                ydoc.transact(() => {
                    order.push([id])
                    const smeta = ydoc.getMap<string>('smeta-' + id)
                    smeta.set('title', defaultSectionTitle)
                    smeta.set('isPublic', 'true')
                })
                setSeedSectionId(id)
            }
        }
        provider.on('synced', onSynced)
        return () => { provider.off('synced', onSynced) }
    }, [ydoc, provider, defaultSectionTitle])

    useEffect(() => {
        const awareness = provider.awareness
        if (!awareness) return
        const localId = awareness.clientID
        const update = () => {
            const states = Array.from(awareness.getStates().entries()) as [number, any][]
            setPeers(
                states
                    .filter(([clientId]) => clientId !== localId)
                    .flatMap(([clientId, state]) =>
                        state.user ? [{ clientId, ...(state.user as PresenceUser) }] : []
                    )
            )
        }
        awareness.on('update', update)
        update()
        return () => { awareness.off('update', update) }
    }, [provider])

    function addSection() {
        const id = Math.random().toString(36).slice(2, 10)
        const { orderKey, metaPrefix } = getPageKeys(activePage)
        ydoc.transact(() => {
            ydoc.getArray<string>(orderKey).push([id])
            const smeta = ydoc.getMap<string>(metaPrefix(id))
            smeta.set('title', 'New Section')
            smeta.set('isPublic', 'true')
        })
    }

    function removeSection(id: string) {
        const { orderKey } = getPageKeys(activePage)
        const order = ydoc.getArray<string>(orderKey)
        const idx = order.toArray().indexOf(id)
        if (idx !== -1) order.delete(idx, 1)
    }

    function moveSection(id: string, direction: 'up' | 'down') {
        const { orderKey } = getPageKeys(activePage)
        const order = ydoc.getArray<string>(orderKey)
        const arr = order.toArray()
        const idx = arr.indexOf(id)
        if (idx === -1) return
        const newIdx = direction === 'up' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= arr.length) return
        ydoc.transact(() => {
            order.delete(idx, 1)
            order.insert(newIdx, [id])
        })
    }

    return (
        <ThemeContext.Provider value={themeColor}>
            <div style={{
                display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                // `height`, not `minHeight` (visual-fixes FIX 3 regression fix):
                // a box whose own `height` CSS property is unset (only
                // `min-height` was) never counts as a "definite" containing
                // block for a descendant's percentage height, even once the
                // min-height constraint has forced its rendered box to fill
                // the parent — so PageSidebar's own `height: 100%` a few
                // levels down was resolving to `auto` (its own content
                // height) instead of this row's height, which is why the
                // rail stopped a quarter of the way down the viewport. Only
                // an explicit `height` here — resolved against EditorShell's
                // own definite wrapper — makes that chain actually definite.
                // A long document still scrolls: nothing here clips
                // overflow, so content taller than this row's own box still
                // extends past it and is picked up by `.mainScroll`'s own
                // `overflow-y: auto` exactly as before.
                height: '100%',
                // The rail (PageSidebar, orientation='sidebar') must sit flush
                // against the shell's own left edge with no gap beside it
                // (visual-fixes spec §1) — so no padding/gap here on desktop.
                // Mobile's 'top' orientation never had that flush-rail
                // requirement, so it keeps the old padded/gapped treatment.
                padding: isMobile ? 'clamp(1.5rem, 2.5vw, 2.5rem)' : 0,
                gap: isMobile ? 16 : 0,
            }}>
                <PageSidebar
                    ydoc={ydoc}
                    activePage={activePage}
                    onSelectPage={setActivePage}
                    themeColor={themeColor}
                    orientation={isMobile ? 'top' : 'sidebar'}
                    synced={synced}
                    allowedTypes={allowedTypes}
                    readOnly={readOnly}
                    // The rail's own footer now carries the "EDITING" presence
                    // indicator (visual-fixes FIX 3) that used to float at the
                    // top-right of the editor column — same `user`/`peers`
                    // this component already derives from the Hocuspocus
                    // awareness state for the collaborative cursors, just
                    // handed down instead of a second channel.
                    presenceUser={{ id: 'self', ...user }}
                    presencePeers={peers.map(p => ({ id: p.clientId, name: p.name, color: p.color, avatar: p.avatar }))}
                />
                {/*
                 * The editor column, not `.mainScroll`, is what actually
                 * scrolls on desktop. The rail beside it is `position:
                 * sticky`, and a sticky box can only travel inside its own
                 * containing block — which here is this row, exactly one
                 * viewport tall. A three-screen document scrolling in an
                 * ancestor therefore gave the rail nowhere to stick to and
                 * it simply scrolled away with the content. Confining the
                 * overflow to this column instead means the row never
                 * scrolls at all, so the rail (and the sticky toolbar just
                 * inside here, which had the same containing-block problem)
                 * stay put by construction rather than by viewport maths.
                 * `minHeight: 0` is the usual flex-child override without
                 * which this box refuses to shrink below its content and
                 * never overflows in the first place.
                 *
                 * Mobile keeps scrolling in `.mainScroll`: there the rail is
                 * `orientation='top'` and this is a column, so there's no
                 * sticky side rail to preserve.
                 */}
                <div
                    ref={columnScrollRef}
                    className={isMobile ? undefined : 'thin-scroll'}
                    style={{
                        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                        minHeight: isMobile ? undefined : 0,
                        overflowY: isMobile ? undefined : 'auto',
                    }}
                >
                    {/* One persistent formatting toolbar, owned by the column rather
                        than any section (visual-fixes spec §1) — pinned above all
                        document content and, via `position: sticky`, staying put as
                        the content beneath it scrolls in this column. It always
                        targets `activeEditor`, the last section to report focus. */}
                    {!readOnly && activePageType !== 'intel' && (
                        <EditorToolbar editor={activeEditor} uploadUrl={uploadUrl} containerRef={toolbarRef} />
                    )}
                    <div style={{ flex: 1, padding: isMobile ? 0 : '24px 48px 40px' }}>
                        {/* Widened measure (visual-fixes spec §2): ~1100-1200px rather
                            than the old ~740px cap, so the document reads as a real
                            writing surface instead of a phone-width column. */}
                        <div style={{ maxWidth: 1160, margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* The "EDITING" presence indicator that used to float here
                                (top-right of the editor column) now lives in the rail's
                                own footer instead (visual-fixes FIX 3) — see the
                                `presenceUser`/`presencePeers` props passed to
                                PageSidebar above. */}

                            {activePageType === 'intel' ? (
                                <IntelPackageEditor
                                    key={activePage}
                                    operationId={operationId}
                                    readOnly={readOnly}
                                    themeColor={themeColor}
                                />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 56 }}>
                                    {sectionIds.map((id, idx) => (
                                        <SectionEditor
                                            key={`${activePage}-${id}`}
                                            ydoc={ydoc}
                                            sectionId={id}
                                            pageId={activePage}
                                            pageTitle={activePageTitle}
                                            provider={provider}
                                            user={user}
                                            uploadUrl={uploadUrl}
                                            onRemove={() => removeSection(id)}
                                            onMoveUp={() => moveSection(id, 'up')}
                                            onMoveDown={() => moveSection(id, 'down')}
                                            canMoveUp={idx > 0}
                                            canMoveDown={idx < sectionIds.length - 1}
                                            themeColor={themeColor}
                                            readOnly={readOnly}
                                            seedContent={activePage === 'main' && id === seedSectionId ? initialContent : undefined}
                                            isFirst={idx === 0}
                                            isLast={idx === sectionIds.length - 1}
                                            focused={activeSectionId === id}
                                            onFocusEditor={editor => { setActiveEditor(editor); setActiveSectionId(id) }}
                                            onBlurEditor={(editor, event) => {
                                                // Focus landing anywhere inside the toolbar (a button,
                                                // a select, an open popover) isn't "nothing focused" —
                                                // keep dispatching to this section until focus actually
                                                // leaves both the document and the toolbar.
                                                const related = event.relatedTarget as Node | null
                                                if (related && toolbarRef.current?.contains(related)) return
                                                setActiveEditor(prev => (prev === editor ? null : prev))
                                                setActiveSectionId(prev => (prev === id ? null : prev))
                                            }}
                                        />
                                    ))}
                                    {!readOnly && (
                                        <button type='button' onClick={addSection}
                                            style={{ alignSelf: 'flex-start', marginTop: 8, padding: '6px 2px', background: 'transparent', border: 'none', color: 'var(--ink-3)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', transition: 'color 0.15s' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)' }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-3)' }}
                                        >
                                            + Add Section
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ThemeContext.Provider>
    )
}

// ─── Editor Toolbar ────────────────────────────────────────────────────────────

interface EditorToolbarProps {
    /** Whichever section's editor last reported focus, or null when nothing
     * in the document is focused — the toolbar renders every control
     * disabled rather than guess a target (visual-fixes spec §1). */
    editor: Editor | null
    uploadUrl: string
    /** ActiveEditor's own ref to this toolbar's root DOM node, so its blur
     * handler can tell "focus moved into the toolbar" (keep the target)
     * apart from "focus left the document entirely" (clear it) — see the
     * `relatedTarget` check in ActiveEditor's onBlurEditor. */
    containerRef: React.RefObject<HTMLDivElement>
}

// Fixed sizes baked into the group-fit math below — not "hardcoded viewport
// maths" in the sense FIX 2 warns against (those approximated an *unrelated*
// layout region via vh arithmetic that drifted out of sync); these are a
// component measuring its own children's own fixed CSS, values that only
// change if TDivider's or TIconBtn's own inline styles do, right next to
// this file's other toolbar controls.
const TOOLBAR_DIVIDER_WIDTH = 9        // TDivider: 1px bar + 4px margin each side
const TOOLBAR_OVERFLOW_BTN_WIDTH = 26  // matches TIconBtn's fixed 26×26 box

/**
 * Measurement-driven toolbar overflow (visual-fixes FIX 1): decides how many
 * leading groups of `groupKeys` (already in the toolbar's fixed display
 * order) fit inside the container's own observed width before the rest have
 * to move into the "⋯" popover. Reacts only to the container's own
 * ResizeObserver'd width — not to *why* it changed — so deck collapse,
 * window resize, and sidebar collapse all correct it the same way, with no
 * per-cause breakpoint list to keep in sync.
 *
 * A group is measured (via `setGroupRef`) only while it's actually rendered
 * on the bar; one currently sitting in the overflow popover keeps its last
 * known width in `widthsRef` rather than being treated as 0-width, so it
 * doesn't flicker in and out on every render once it's been pushed off.
 * Every group here is fixed-width (icon buttons) except the block-style/
 * size dropdowns, whose label text shifts slightly with the cursor's
 * position — that group sits early enough in the fixed order that it's the
 * last one ever pushed into overflow, so a briefly stale cached width for
 * it in practice never happens.
 */
function useToolbarOverflow(groupKeys: readonly string[], containerRef: React.RefObject<HTMLDivElement>) {
    const [containerWidth, setContainerWidth] = useState<number | null>(null)
    const groupRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const widthsRef = useRef<Record<string, number>>({})
    const [visibleCount, setVisibleCount] = useState(groupKeys.length)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width
            if (width != null) setContainerWidth(width)
        })
        observer.observe(el)
        return () => observer.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // No dependency array: this needs to re-measure/re-decide after *any*
    // render that might have changed a visible group's rendered width (e.g.
    // the block-style dropdown's label text) as well as after containerWidth
    // itself changes — cheaper to just always check than to enumerate every
    // input that can move a group's width. Can't loop: `setVisibleCount`
    // below only actually updates state (and so only triggers the re-render
    // that re-runs this effect) when the computed value differs from the
    // last one, so it converges instead of chaining forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        for (const key of groupKeys) {
            const node = groupRefs.current[key]
            if (node) widthsRef.current[key] = node.offsetWidth
        }
        if (containerWidth == null) return

        const widths = groupKeys.map(k => widthsRef.current[k] ?? 0)
        const totalWidth = widths.reduce((a, b) => a + b, 0) + TOOLBAR_DIVIDER_WIDTH * Math.max(groupKeys.length - 1, 0)

        let next = groupKeys.length
        if (totalWidth > containerWidth) {
            const reserved = TOOLBAR_OVERFLOW_BTN_WIDTH + TOOLBAR_DIVIDER_WIDTH
            let used = 0
            let count = 0
            for (let i = 0; i < groupKeys.length; i++) {
                const dividerBefore = i > 0 ? TOOLBAR_DIVIDER_WIDTH : 0
                if (used + dividerBefore + widths[i] + reserved <= containerWidth) {
                    used += dividerBefore + widths[i]
                    count++
                } else {
                    break
                }
            }
            next = count
        }
        setVisibleCount(prev => (prev === next ? prev : next))
    })

    const setGroupRef = (key: string) => (el: HTMLDivElement | null) => { groupRefs.current[key] = el }

    return { visibleCount, setGroupRef }
}

/**
 * The one persistent formatting toolbar (visual-fixes spec §1) — pinned
 * above all document content via `position: sticky`, owned by the editor
 * column rather than any one section. Every control dispatches to whichever
 * section last reported focus (the `editor` prop); when that's null every
 * control renders disabled instead of silently doing nothing or throwing.
 *
 * This also now owns the image/link insertion flows that used to live in
 * each section's own toolbar — they're text-formatting concerns, not
 * per-section chrome, so they moved here with everything else. Paste/drop
 * image upload stays in SectionEditor itself (it fires on whichever editor
 * the image actually lands in, independent of this toolbar's own state).
 *
 * Every group renders on the bar by default (visual-fixes FIX 1) — the "⋯"
 * overflow popover only ever takes the *trailing* groups that genuinely
 * don't fit, decided by `useToolbarOverflow` below from the container's own
 * measured width, never a fixed split. Group order and dividers are
 * unchanged: history | block type + size | inline marks | highlight |
 * alignment | lists | blocks | insert | clear.
 */
function EditorToolbar({ editor, uploadUrl, containerRef }: EditorToolbarProps) {
    const [imagePopoverOpen, setImagePopoverOpen] = useState(false)
    const [showImageLibrary, setShowImageLibrary] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)
    const [linkPopover, setLinkPopover] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [linkText, setLinkText] = useState('')
    const imageInputRef = useRef<HTMLInputElement>(null)
    const linkUrlInputRef = useRef<HTMLInputElement>(null)
    const linkTextInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!linkPopover) return
        const close = (e: MouseEvent) => {
            if (!(e.target as Element).closest('[data-shared-link-popover]')) setLinkPopover(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [linkPopover])

    async function handleImageUpload(file: File) {
        if (!editor || uploadingImage) return
        setUploadingImage(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch(uploadUrl, { method: 'POST', body: formData })
            const json = await res.json()
            if (json.url) editor.chain().focus().setImage({ src: json.url }).run()
            else alert(json.error || 'Upload failed')
        } finally {
            setUploadingImage(false)
        }
    }

    function applyLink() {
        if (!editor) return
        const hasSelection = !editor.state.selection.empty
        if (!hasSelection && linkText.trim() && linkUrl.trim()) {
            editor.chain().focus().insertContent(`<a href="${linkUrl.trim()}">${linkText.trim()}</a>`).run()
        } else if (linkUrl.trim()) {
            editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
        } else {
            editor.chain().focus().unsetLink().run()
        }
        setLinkPopover(false)
        setLinkText('')
        setLinkUrl('')
    }

    const disabled = !editor
    // 0 means "plain paragraph", matching whichever of H1/H2/H3 (if any) the
    // focused section's cursor is currently in.
    const currentHeadingLevel = editor ? (([1, 2, 3] as const).find(l => editor.isActive('heading', { level: l })) ?? 0) : 0
    const currentFontSize = (editor?.getAttributes('textStyle').fontSize as string | undefined) || ''

    // Same nine groups, same order, as the previous always-inline toolbar —
    // just named and grouped now so `useToolbarOverflow` can measure and
    // relocate them as units (visual-fixes FIX 1) instead of individual
    // buttons ending up orphaned on either side of a divider.
    const groups: { key: string; node: React.ReactNode }[] = [
        { key: 'history', node: (
            <>
                <TIconBtn title='Undo' disabled={disabled} onClick={() => editor?.chain().focus().undo().run()}><IconUndo /></TIconBtn>
                <TIconBtn title='Redo' disabled={disabled} onClick={() => editor?.chain().focus().redo().run()}><IconRedo /></TIconBtn>
            </>
        ) },
        { key: 'block', node: (
            <>
                <ToolbarDropdown title='Block style' disabled={disabled} minWidth={92}
                    value={String(currentHeadingLevel)} options={HEADING_OPTIONS}
                    onSelect={v => {
                        if (!editor) return
                        const lvl = Number(v)
                        if (lvl === 0) editor.chain().focus().setParagraph().run()
                        else editor.chain().focus().setHeading({ level: lvl as 1 | 2 | 3 }).run()
                    }}
                />
                <ToolbarDropdown title='Text size' disabled={disabled} minWidth={52}
                    value={currentFontSize} options={FONT_SIZE_OPTIONS}
                    onSelect={v => {
                        if (!editor) return
                        if (v) (editor.chain().focus() as any).setFontSize(v).run()
                        else (editor.chain().focus() as any).unsetFontSize().run()
                    }}
                />
            </>
        ) },
        { key: 'marks', node: (
            <>
                <TLabel title='Bold' disabled={disabled} active={!!editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>B</TLabel>
                <TLabel title='Italic' disabled={disabled} active={!!editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>I</TLabel>
                <TLabel title='Underline' disabled={disabled} active={!!editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>U</TLabel>
                <TIconBtn title='Strikethrough' disabled={disabled} active={!!editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><IconStrikethrough /></TIconBtn>
            </>
        ) },
        { key: 'highlight', node: (
            <TIconBtn title='Highlight' disabled={disabled} active={!!editor?.isActive('highlight')} onClick={() => editor?.chain().focus().toggleHighlight().run()}><IconHighlight /></TIconBtn>
        ) },
        { key: 'align', node: (
            <>
                <TIconBtn title='Align Left' disabled={disabled} active={!!editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()}><IconAlignLeft /></TIconBtn>
                <TIconBtn title='Align Centre' disabled={disabled} active={!!editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()}><IconAlignCenter /></TIconBtn>
                <TIconBtn title='Align Right' disabled={disabled} active={!!editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()}><IconAlignRight /></TIconBtn>
            </>
        ) },
        { key: 'lists', node: (
            <>
                <TIconBtn title='Bullet List' disabled={disabled} active={!!editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><IconListBullet /></TIconBtn>
                <TIconBtn title='Numbered List' disabled={disabled} active={!!editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><IconListNumber /></TIconBtn>
            </>
        ) },
        { key: 'blocks', node: (
            <>
                <TIconBtn title='Quote' disabled={disabled} active={!!editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><IconQuote /></TIconBtn>
                <TIconBtn title='Section Divider' disabled={disabled} onClick={() => editor?.chain().focus().setHorizontalRule().run()}><IconRule /></TIconBtn>
            </>
        ) },
        { key: 'insert', node: (
            <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <TIconBtn title={uploadingImage ? 'Uploading…' : 'Insert Image'} disabled={disabled} active={uploadingImage || imagePopoverOpen}
                        onClick={() => { if (!uploadingImage) setImagePopoverOpen(v => !v) }}
                    >
                        <IconImage />
                    </TIconBtn>
                    {imagePopoverOpen && !uploadingImage && (
                        <div
                            onMouseDown={e => e.stopPropagation()}
                            style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', padding: '4px 0', display: 'flex', flexDirection: 'column', minWidth: 190, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                        >
                            <button type='button'
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { setImagePopoverOpen(false); imageInputRef.current?.click() }}
                                style={{ padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--ink-2)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--s3)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >Upload from Computer</button>
                            <button type='button'
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { setImagePopoverOpen(false); setShowImageLibrary(true) }}
                                style={{ padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--ink-2)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--s3)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >Select from Library</button>
                        </div>
                    )}
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <TIconBtn title={editor?.isActive('link') ? 'Edit Link' : 'Insert Link'} disabled={disabled} active={!!editor?.isActive('link')}
                        onClick={() => {
                            if (!editor) return
                            const existing = editor.getAttributes('link').href || ''
                            setLinkUrl(existing)
                            setLinkText('')
                            setLinkPopover(v => !v)
                            const noSel = editor.state.selection.empty
                            setTimeout(() => (noSel ? linkTextInputRef.current : linkUrlInputRef.current)?.focus(), 40)
                        }}
                    >
                        <IconLink />
                    </TIconBtn>
                    {linkPopover && editor && (
                        <div data-shared-link-popover onMouseDown={e => e.stopPropagation()}
                            style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 280, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                        >
                            {editor.state.selection.empty && (
                                <input ref={linkTextInputRef} value={linkText} onChange={e => setLinkText(e.target.value)} placeholder='Display text'
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); linkUrlInputRef.current?.focus() } if (e.key === 'Escape') setLinkPopover(false) }}
                                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: '0.78rem', letterSpacing: '0.02em', outline: 'none', padding: '3px 2px' }}
                                />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input ref={linkUrlInputRef} value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder='https://…'
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                                        if (e.key === 'Escape') setLinkPopover(false)
                                    }}
                                    style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: '0.78rem', letterSpacing: '0.02em', outline: 'none', padding: '3px 2px' }}
                                />
                                <button type='button' onMouseDown={e => e.preventDefault()} onClick={applyLink}
                                    style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                                >Apply</button>
                            </div>
                        </div>
                    )}
                </div>
                <TIconBtn title='Remove Link' disabled={disabled} onClick={() => { editor?.chain().focus().unsetLink().run(); setLinkPopover(false) }}><IconUnlink /></TIconBtn>
            </>
        ) },
        { key: 'clear', node: (
            <TIconBtn title='Clear Formatting' disabled={disabled} onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}><IconClear /></TIconBtn>
        ) },
    ]

    const { visibleCount, setGroupRef } = useToolbarOverflow(groups.map(g => g.key), containerRef)
    const visibleGroups = groups.slice(0, visibleCount)
    const overflowGroups = groups.slice(visibleCount)

    return (
        <div ref={containerRef} style={{
            display: 'flex', alignItems: 'center', gap: 2, height: 44, flexShrink: 0,
            borderBottom: '1px solid var(--line)', background: 'var(--bg)', padding: '0 16px',
            position: 'sticky', top: 0, zIndex: 20,
            opacity: disabled ? 0.45 : 1, transition: 'opacity 0.15s',
        }}>
            {visibleGroups.map((g, i) => (
                <React.Fragment key={g.key}>
                    {i > 0 && <TDivider />}
                    <div ref={setGroupRef(g.key)} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        {g.node}
                    </div>
                </React.Fragment>
            ))}

            {/* "⋯" only ever appears once genuinely needed (visual-fixes FIX
                1) — useToolbarOverflow returns the full group count, and this
                stays unrendered, whenever everything already fits. */}
            {overflowGroups.length > 0 && (
                <>
                    <TDivider />
                    <ToolbarOverflowMenu groups={overflowGroups} />
                </>
            )}

            <input ref={imageInputRef} type='file' accept='image/*' style={{ display: 'none' }}
                onChange={e => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); e.target.value = '' }}
            />
            {showImageLibrary && (
                <ImageLibraryModal
                    onSelect={url => { editor?.chain().focus().setImage({ src: url }).run(); setShowImageLibrary(false) }}
                    onClose={() => setShowImageLibrary(false)}
                />
            )}
        </div>
    )
}

/**
 * Shared positioning for every portalled toolbar menu (visual-fixes FIX 1
 * regression fix): the TEXT/SIZE dropdowns and the "⋯" overflow popover used
 * to render as a `position: absolute` child right next to their trigger,
 * which worked until the toolbar picked up overflow handling — whatever
 * ancestor now clips that overflow also clips an absolutely-positioned
 * descendant, so the menus were getting cut off at the toolbar's own bottom
 * edge and forcing an inner scrollbar onto the 44px bar itself.
 *
 * The fix is to portal the menu to `document.body` and position it with
 * `position: fixed` computed from the trigger's own `getBoundingClientRect()`
 * — nothing above `document.body` can clip it. This hook owns exactly that:
 * measuring the trigger (and, once mounted, the menu itself, to decide
 * whether to flip above when there's no room below), re-measuring on scroll
 * (capture-phase, so `.mainScroll` scrolling underneath still repositions
 * it) and window resize, and closing on outside click / Escape.
 */
function usePortalMenuPosition(
    open: boolean,
    triggerRef: React.RefObject<HTMLElement | null>,
    menuRef: React.RefObject<HTMLElement | null>,
    onClose: () => void,
    align: 'left' | 'right' = 'left',
) {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    const recompute = useCallback(() => {
        const trigger = triggerRef.current
        if (!trigger) return
        const rect = trigger.getBoundingClientRect()
        const menuEl = menuRef.current
        const menuW = menuEl?.offsetWidth ?? 0
        const menuH = menuEl?.offsetHeight ?? 0
        const spaceBelow = window.innerHeight - rect.bottom
        // Flip above the trigger only when there's genuinely more room up
        // there — never flip into negative space just because below is tight.
        const flip = menuH > 0 && spaceBelow < menuH + 8 && rect.top > menuH + 8
        const top = flip ? rect.top - 4 - menuH : rect.bottom + 4
        let left = align === 'right' ? rect.right - menuW : rect.left
        left = Math.min(Math.max(4, left), window.innerWidth - menuW - 4)
        setPos({ top, left })
    }, [triggerRef, menuRef, align])

    // Runs after the portalled menu is committed to the DOM but before the
    // browser paints, so `menuRef.current.offsetHeight` is already real by
    // the time `recompute` reads it — no visible flash at the wrong spot.
    useLayoutEffect(() => {
        if (!open) { setPos(null); return }
        recompute()
    }, [open, recompute])

    useEffect(() => {
        if (!open) return
        const onScroll = () => recompute()
        const onResize = () => recompute()
        window.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('scroll', onScroll, true)
            window.removeEventListener('resize', onResize)
        }
    }, [open, recompute])

    useEffect(() => {
        if (!open) return
        const closeOnOutside = (e: MouseEvent) => {
            const target = e.target as Node
            if (triggerRef.current?.contains(target)) return
            if (menuRef.current?.contains(target)) return
            onClose()
        }
        const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('mousedown', closeOnOutside)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('mousedown', closeOnOutside)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [open, onClose, triggerRef, menuRef])

    return pos
}

/**
 * Portal wrapper shared by `ToolbarDropdown` and `ToolbarOverflowMenu` — see
 * `usePortalMenuPosition` above for why this exists. `onMouseDown` on the
 * portalled root still stops propagation (belt-and-suspenders alongside the
 * containment check in the hook's outside-click listener), and every actual
 * control rendered inside (`children`) is still responsible for its own
 * `onMouseDown={e => e.preventDefault()}` — this wrapper doesn't add or
 * remove any of that, it only relocates the DOM.
 */
function PortalMenu({ open, onClose, triggerRef, align = 'left', minWidth, children }: {
    open: boolean
    onClose: () => void
    triggerRef: React.RefObject<HTMLElement | null>
    align?: 'left' | 'right'
    minWidth?: number
    children: React.ReactNode
}) {
    const menuRef = useRef<HTMLDivElement>(null)
    const pos = usePortalMenuPosition(open, triggerRef, menuRef, onClose, align)

    if (!open) return null

    return createPortal(
        <div
            ref={menuRef}
            onMouseDown={e => e.stopPropagation()}
            style={{
                position: 'fixed',
                top: pos ? pos.top : -9999,
                left: pos ? pos.left : -9999,
                visibility: pos ? 'visible' : 'hidden',
                zIndex: 10000,
                minWidth,
                background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
        >
            {children}
        </div>,
        document.body,
    )
}

/**
 * The "⋯" overflow trigger + popover (visual-fixes FIX 1) — holds whichever
 * trailing groups `useToolbarOverflow` decided don't fit on the bar, in the
 * same fixed order they'd otherwise appear in. Every control inside still
 * goes through TIconBtn/TLabel/ToolbarDropdown, so the mousedown
 * preventDefault that keeps focus in the document (and this trigger button
 * itself, via TIconBtn) is never reintroduced as a regression here. The
 * popover itself is portalled (see `PortalMenu`) — it used to render as a
 * `position: absolute` sibling of the trigger, which is what let it get
 * clipped once the toolbar picked up overflow handling.
 */
function ToolbarOverflowMenu({ groups }: { groups: { key: string; node: React.ReactNode }[] }) {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLDivElement>(null)

    return (
        <div ref={triggerRef} style={{ position: 'relative', flexShrink: 0 }}>
            <TIconBtn title='More formatting options' active={open} onClick={() => setOpen(v => !v)}>
                <IconMoreHoriz />
            </TIconBtn>
            <PortalMenu open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} align='right' minWidth={160}>
                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {groups.map((g, i) => (
                        <React.Fragment key={g.key}>
                            {i > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                {g.node}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </PortalMenu>
        </div>
    )
}

const HEADING_OPTIONS = [
    { value: '0', label: 'Text' },
    { value: '1', label: 'Heading 1' },
    { value: '2', label: 'Heading 2' },
    { value: '3', label: 'Heading 3' },
]

const FONT_SIZE_OPTIONS = [
    { value: '', label: 'Size' },
    ...[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => ({ value: `${s}px`, label: String(s) })),
]

/**
 * Custom button + menu standing in for a native `<select>` in the shared
 * toolbar (visual-fixes-report FIX 1). A native `<select>`'s own dropdown
 * needs its mousedown, so it can't take the `preventDefault` treatment every
 * other control here gets — converting it to this component instead keeps
 * the block-type and text-size controls on the same interaction model (and
 * the same token-based styling) as everything else, rather than carving out
 * a focus-and-reapply special case just for these two. The option list is
 * portalled (see `PortalMenu`) so it's never clipped by the toolbar's own
 * box regardless of how many groups have been measured into the "⋯" popover.
 */
function ToolbarDropdown({ value, options, onSelect, disabled, title, minWidth = 80 }: {
    value: string
    options: { value: string; label: string }[]
    onSelect: (value: string) => void
    disabled?: boolean
    title: string
    minWidth?: number
}) {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const current = options.find(o => o.value === value) || options[0]

    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            <button ref={triggerRef} type='button' title={title} disabled={disabled}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setOpen(v => !v)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                    padding: '5px 6px', minWidth, background: open ? 'var(--s2)' : 'transparent', border: 'none', borderRadius: 'var(--r)',
                    color: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                    cursor: disabled ? 'default' : 'pointer', transition: 'color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-2)' }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.label}</span>
                <IconChevronDown />
            </button>
            <PortalMenu open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} align='left' minWidth={Math.max(minWidth, 120)}>
                <div className='thin-scroll' style={{ padding: 4, display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto' }}>
                    {options.map(o => (
                        <button key={o.value} type='button'
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { onSelect(o.value); setOpen(false) }}
                            style={{
                                textAlign: 'left', padding: '6px 10px', background: o.value === value ? 'var(--s3)' : 'transparent',
                                border: 'none', borderRadius: 'var(--r)', color: o.value === value ? 'var(--acc)' : 'var(--ink-2)',
                                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = o.value === value ? 'var(--acc)' : 'var(--ink-2)' }}
                        >{o.label}</button>
                    ))}
                </div>
            </PortalMenu>
        </div>
    )
}

// ─── Section Editor ────────────────────────────────────────────────────────────

interface SectionEditorProps {
    ydoc: Y.Doc
    sectionId: string
    pageId?: string
    /** The active document's own title — the section's eyebrow label (visual-
     * fixes spec §2). Read once in ActiveEditor off the same `pmeta` map
     * PageSidebar already uses, not a new field. */
    pageTitle?: string
    provider: HocuspocusProvider
    user: PresenceUser
    uploadUrl: string
    onRemove: () => void
    onMoveUp: () => void
    onMoveDown: () => void
    canMoveUp: boolean
    canMoveDown: boolean
    themeColor?: string
    readOnly?: boolean
    seedContent?: any
    /** First/last in the section list — `isFirst` skips the inter-section
     * hairline rule (visual-fixes spec §3), `isLast` lets the editable area
     * grow to fill any leftover column height (spec §2) rather than
     * collapsing to its content's own height. */
    isFirst?: boolean
    isLast?: boolean
    /** True while ActiveEditor's `activeSectionId` names this section —
     * drives the focus ring (visual-fixes spec §3). Lives in the parent
     * (not local state here) so it reflects "this is the shared toolbar's
     * current target" rather than raw ProseMirror DOM focus, which would
     * flicker off the instant a toolbar button is clicked. */
    focused?: boolean
    /** Reports this section's own editor to ActiveEditor's `activeEditor`
     * state whenever it gains/loses browser focus, so the one shared
     * toolbar (rendered above all sections) always dispatches to whichever
     * section the caret is actually in (visual-fixes spec §1). */
    onFocusEditor?: (editor: Editor) => void
    onBlurEditor?: (editor: Editor, event: FocusEvent) => void
}

function SectionEditor({ ydoc, sectionId, pageId, pageTitle, provider, user, uploadUrl, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown, themeColor = '#db001d', readOnly = false, seedContent, isFirst = false, isLast = false, focused = false, onFocusEditor, onBlurEditor }: SectionEditorProps) {
    const isNonMain = pageId && pageId !== 'main'
    const metaKey = isNonMain ? `smeta-${pageId}-${sectionId}` : `smeta-${sectionId}`
    const contentKey = isNonMain ? `scontent-${pageId}-${sectionId}` : `scontent-${sectionId}`

    const [title, setTitle] = useState('')
    const [isPublic, setIsPublic] = useState(true)
    const [sectionBorderColor, setSectionBorderColor] = useState<string | null>(null)
    const [sectionMinHeight, setSectionMinHeight] = useState(80)
    // Eyebrow rename (visual-fixes FIX 4) — click to edit, commit on blur/
    // Enter, cancel on Escape. Writes through the exact same field
    // PageSidebar's own rename (`commitRename`) does: `pmeta-{pageId}`'s
    // `title` key. No second write path — PageSidebar's rail and this
    // eyebrow both end up reading/writing the one Y.Map, so a rename from
    // either place shows up in the other via the normal Yjs observer
    // ActiveEditor already has on that map (the `pageTitle` prop below is
    // that same state, just handed down).
    const [editingEyebrow, setEditingEyebrow] = useState(false)
    const [eyebrowValue, setEyebrowValue] = useState('')

    const effectiveBorderColor = sectionBorderColor || themeColor
    // Accent tint via the operation's own --acc/--acc-rgb tokens (set on the
    // shell root — EditorShell.tsx) rather than a themeColor-derived rgba()
    // helper: same colour, token-backed per the visual-fixes design tokens
    // rule. blockquote/hr/mark/list-marker rules restyled for spec §2 (quote
    // → card-style callout with a corner tick, bullets → accent squares);
    // h1/h2/a keep the same tint treatment they always had. The editable
    // area's own ground/border/radius live on the shared `.op-editor` rule
    // in globals.css; this scoped block only layers the per-instance bits
    // that rule can't know — min-height, the focus ring, and (for the last
    // section) growing to fill the column (spec §2/§3).
    const themeCSS = `
        .op-editor-${sectionId} {
            min-height: ${sectionMinHeight}px;
            box-shadow: ${focused ? '0 0 0 2px rgba(var(--acc-rgb), 0.4)' : 'none'};
            border-color: ${focused ? 'rgba(var(--acc-rgb), 0.5)' : 'var(--line)'};
            ${isLast ? 'flex: 1; display: flex; flex-direction: column;' : ''}
        }
        .op-editor-${sectionId} h1 { border-left-color: rgba(var(--acc-rgb), 0.75); background: rgba(var(--acc-rgb), 0.045); }
        .op-editor-${sectionId} h2 { color: rgba(var(--acc-rgb), 0.88); }
        .op-editor-${sectionId} h2::before { color: rgba(var(--acc-rgb), 0.65); }
        .op-editor-${sectionId} ul { list-style: none; padding-left: 1.2em; }
        .op-editor-${sectionId} ul li { position: relative; }
        .op-editor-${sectionId} ul li::before { content: ''; position: absolute; left: -1.1em; top: 0.6em; width: 5px; height: 5px; background: var(--acc); }
        .op-editor-${sectionId} ol li::marker { color: rgba(var(--acc-rgb), 0.6); }
        .op-editor-${sectionId} blockquote {
            position: relative; margin: 1.2em 0; padding: 14px 18px;
            border: 1px solid var(--line); border-radius: var(--r);
            background: linear-gradient(180deg, var(--s1), var(--bg));
        }
        .op-editor-${sectionId} blockquote::before {
            content: ''; position: absolute; top: 0; left: 0; width: 36px; height: 2px;
            background: var(--acc); opacity: 0.75;
        }
        .op-editor-${sectionId} hr { border-top-color: var(--line-2); }
        .op-editor-${sectionId} mark { background: rgba(var(--acc-rgb), 0.2); }
        .op-editor-${sectionId} a { color: rgba(var(--acc-rgb), 0.85); }
    `
    const [confirmingRemove, setConfirmingRemove] = useState(false)
    const [hovered, setHovered] = useState(false)
    const seededRef = useRef(false)
    const borderColorInputRef = useRef<HTMLInputElement>(null)
    // Paste/drop image upload stays local to each section — it fires on
    // whichever editor the image actually landed in, independent of the
    // shared toolbar's own (separately stateful) Image control.
    const uploadingImageRef = useRef(false)
    const pasteUploadRef = useRef<(file: File) => void>(() => {})
    const heightDragRef = useRef({ startY: 0, startH: 0 })

    useEffect(() => {
        const smeta = ydoc.getMap<string>(metaKey)
        const handler = () => {
            setTitle(smeta.get('title') || '')
            setIsPublic(smeta.get('isPublic') !== 'false')
            setSectionBorderColor(smeta.get('borderColor') || null)
            const mh = parseInt(smeta.get('minHeight') || '80')
            setSectionMinHeight(isNaN(mh) ? 80 : mh)
        }
        smeta.observe(handler)
        handler()
        return () => smeta.unobserve(handler)
    }, [ydoc, metaKey])

    function updateMeta(updates: { title?: string; isPublic?: boolean; borderColor?: string; minHeight?: string }) {
        const smeta = ydoc.getMap<string>(metaKey)
        ydoc.transact(() => {
            if (updates.title !== undefined) smeta.set('title', updates.title!)
            if (updates.isPublic !== undefined) smeta.set('isPublic', updates.isPublic ? 'true' : 'false')
            if (updates.borderColor !== undefined) smeta.set('borderColor', updates.borderColor)
            if (updates.minHeight !== undefined) smeta.set('minHeight', updates.minHeight)
        })
    }

    function startEyebrowEdit() {
        if (readOnly) return
        setEyebrowValue(pageTitle || '')
        setEditingEyebrow(true)
    }

    // Same write path as PageSidebar.commitRename: the `pmeta-{pageId}` map's
    // `title` key, same fallback rule for an emptied-out value.
    function commitEyebrow() {
        const docId = pageId || 'main'
        const fallback = docId === 'main' ? 'CHQ Orders' : 'Untitled'
        const trimmed = eyebrowValue.trim() || fallback
        ydoc.getMap<string>('pmeta-' + docId).set('title', trimmed)
        setEditingEyebrow(false)
    }

    const editor = useEditor({
        immediatelyRender: false,
        editable: !readOnly,
        onFocus: ({ editor: e }) => onFocusEditor?.(e),
        onBlur: ({ editor: e, event }) => onBlurEditor?.(e, event),
        extensions: [
            // Everything schema-defining except the image lives in
            // content-extensions.ts, so content generated elsewhere builds
            // against this exact schema instead of a lookalike.
            ...contentExtensions(),
            Placeholder.configure({ placeholder: 'Begin writing this section…' }),
            ResizableImage,
            GlobalDragHandle.configure({ dragHandleWidth: 20 }),
            Collaboration.configure({ document: ydoc, field: contentKey }),
            buildCursorExtension(provider, user),
        ],
        editorProps: {
            attributes: { class: `op-editor op-editor-${sectionId}` },
            handlePaste(_view, event) {
                const items = event.clipboardData?.items
                if (!items) return false
                for (const item of Array.from(items)) {
                    if (item.type.startsWith('image/')) {
                        const file = item.getAsFile()
                        if (file) {
                            event.preventDefault()
                            pasteUploadRef.current(file)
                            return true
                        }
                    }
                }
                return false
            },
            handleDrop(_view, event) {
                const files = (event as DragEvent).dataTransfer?.files
                if (!files?.length) return false
                for (const file of Array.from(files)) {
                    if (file.type.startsWith('image/')) {
                        event.preventDefault()
                        pasteUploadRef.current(file)
                        return true
                    }
                }
                return false
            },
        },
    })

    useEffect(() => {
        if (!editor || !seedContent || seededRef.current) return
        const trySeek = () => {
            if (!seededRef.current && editor.isEmpty) {
                editor.commands.setContent(seedContent)
                seededRef.current = true
            }
        }
        provider.on('synced', trySeek)
        trySeek()
        return () => { provider.off('synced', trySeek) }
    }, [editor, provider, seedContent])

    function onHeightDragStart(e: React.MouseEvent) {
        e.preventDefault()
        heightDragRef.current = { startY: e.clientY, startH: sectionMinHeight }
        const onMove = (ev: MouseEvent) => {
            const newH = Math.max(80, heightDragRef.current.startH + (ev.clientY - heightDragRef.current.startY))
            setSectionMinHeight(newH)
        }
        const onUp = (ev: MouseEvent) => {
            const newH = Math.max(80, heightDragRef.current.startH + (ev.clientY - heightDragRef.current.startY))
            updateMeta({ minHeight: String(Math.round(newH)) })
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    async function handleImageUpload(file: File) {
        if (!editor || uploadingImageRef.current) return
        uploadingImageRef.current = true
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch(uploadUrl, { method: 'POST', body: formData })
            const json = await res.json()
            if (json.url) editor.chain().focus().setImage({ src: json.url }).run()
            else alert(json.error || 'Upload failed')
        } finally {
            uploadingImageRef.current = false
        }
    }
    pasteUploadRef.current = handleImageUpload

    if (!editor) return null

    const chromeVisible = hovered || confirmingRemove

    return (
        <div style={{
            position: 'relative',
            display: isLast ? 'flex' : undefined,
            flexDirection: isLast ? 'column' : undefined,
            flex: isLast ? 1 : undefined,
            // Hairline + clear space between consecutive sections (visual-
            // fixes spec §3) — skipped on the first section, which already
            // sits right below the shared toolbar with its own breathing room.
            // The header band below adds its own full-width hairline under
            // the title+controls row; this borderTop is the separate rule
            // that actually falls *between* two sections, so both stay —
            // they're doing different jobs (visual-fixes header-band spec).
            borderTop: isFirst ? 'none' : '1px solid var(--line)',
            paddingTop: isFirst ? 0 : 40,
        }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <style>{themeCSS}</style>

            {/* Header band: title block (left) and section chrome (right)
                bound into one full-width row so the two pieces that used to
                float at opposite ends now read as a single unit, closed off
                by a full-width hairline that runs under both — the main
                structural cue separating this section's header from its
                body and from the next section (visual-fixes header-band
                spec). The short accent rule under the title is a separate,
                shorter rule doing a different job (the title's own
                underline) and stays as-is. The faint accent-tinted ground
                is deliberately quiet — just enough to read as "header" vs.
                body text, not a bordered card. */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                marginBottom: 18, padding: '6px 2px 14px', borderBottom: '1px solid var(--line)',
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {!readOnly && editingEyebrow ? (
                        <input
                            value={eyebrowValue}
                            onChange={e => setEyebrowValue(e.target.value)}
                            onBlur={commitEyebrow}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEyebrow() }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingEyebrow(false) }
                            }}
                            autoFocus
                            style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: 0, fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}
                        />
                    ) : (
                        <div
                            onClick={startEyebrowEdit}
                            title={readOnly ? undefined : 'Click to rename document'}
                            style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6, cursor: readOnly ? 'default' : 'text' }}
                        >
                            {pageTitle}
                        </div>
                    )}
                    {readOnly ? (
                        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink)' }}>{title}</div>
                    ) : (
                        <input
                            value={title}
                            onChange={e => updateMeta({ title: e.target.value })}
                            placeholder='Section Title'
                            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 26, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink)', padding: 0 }}
                        />
                    )}
                    <div style={{ width: 36, height: 2, background: 'var(--acc)', opacity: 0.75, marginTop: 10 }} />
                </div>

                {!readOnly && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                        opacity: chromeVisible ? 1 : 0, pointerEvents: chromeVisible ? 'auto' : 'none', transition: 'opacity 0.12s',
                    }}>
                        {/* Section accent colour picker */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <input ref={borderColorInputRef} type='color'
                                value={sectionBorderColor || themeColor}
                                onChange={e => updateMeta({ borderColor: e.target.value })}
                                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                            />
                            <button type='button' title='Section accent colour' onClick={() => borderColorInputRef.current?.click()}
                                style={{ width: 14, height: 14, borderRadius: 2, background: effectiveBorderColor, border: '1px solid var(--line-2)', cursor: 'pointer', display: 'block' }}
                            />
                        </div>
                        <button type='button'
                            title={isPublic ? 'Publicly visible — click to make private' : 'Members only — click to make public'}
                            onClick={() => updateMeta({ isPublic: !isPublic })}
                            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: isPublic ? 'var(--good)' : 'var(--warn)', cursor: 'pointer', padding: 3 }}
                        >
                            {isPublic ? <LockOpen style={{ fontSize: 13 }} /> : <Lock style={{ fontSize: 13 }} />}
                        </button>
                        <button type='button' title='Move section up' onClick={onMoveUp} disabled={!canMoveUp}
                            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: canMoveUp ? 'var(--ink-3)' : 'var(--line-2)', cursor: canMoveUp ? 'pointer' : 'default', padding: '3px 2px', fontSize: '0.7rem', lineHeight: 1 }}
                        >▲</button>
                        <button type='button' title='Move section down' onClick={onMoveDown} disabled={!canMoveDown}
                            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: canMoveDown ? 'var(--ink-3)' : 'var(--line-2)', cursor: canMoveDown ? 'pointer' : 'default', padding: '3px 2px', fontSize: '0.7rem', lineHeight: 1 }}
                        >▼</button>
                        {confirmingRemove ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button type='button' onClick={onRemove} style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', background: 'var(--crit)', border: '1px solid var(--crit)', padding: '2px 6px', cursor: 'pointer', borderRadius: 'var(--r)' }}>Yes</button>
                                <button type='button' onClick={() => setConfirmingRemove(false)} style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', background: 'none', border: '1px solid var(--line-2)', padding: '2px 6px', cursor: 'pointer', borderRadius: 'var(--r)' }}>No</button>
                            </div>
                        ) : (
                            <button type='button' title='Remove section' onClick={() => setConfirmingRemove(true)}
                                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 3 }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--crit)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                            >
                                <Delete style={{ fontSize: 14 }} />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* The formatting toolbar used to live here, per section — it's
                now the one shared instance ActiveEditor renders above all
                sections (visual-fixes spec §1). This is just the editable
                surface itself: `.op-editor`/`.op-editor-${sectionId}`
                (globals.css + themeCSS above) give it a distinct ground,
                border and — when focused — accent ring (spec §3), and, for
                the last section, `flex: 1` to fill any leftover column
                height (spec §2). */}
            <EditorContent editor={editor} style={isLast ? { flex: 1, display: 'flex', flexDirection: 'column' } : undefined} />

            {!readOnly && (
                <div onMouseDown={onHeightDragStart}
                    style={{ height: 8, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                    title='Drag to set minimum height'>
                    <div style={{ width: 28, height: 2, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }} />
                </div>
            )}
        </div>
    )
}

/** Compact icon control for the shared toolbar (visual-fixes-report FIX 2) —
 * every icon-bearing button in `EditorToolbar` routes through this so the
 * `onMouseDown` focus-retention fix (FIX 1) and the active/hover token
 * colours only need to live in one place. */
function TIconBtn({ onClick, active, title, disabled, children }: { onClick: () => void; active?: boolean; title: string; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type='button' title={title} disabled={disabled}
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                width: 26, height: 26, padding: 0,
                background: active ? 'rgba(var(--acc-rgb), 0.16)' : 'transparent',
                border: active ? '1px solid rgba(var(--acc-rgb), 0.35)' : '1px solid transparent',
                borderRadius: 'var(--r)',
                color: active ? 'var(--acc)' : 'var(--ink-2)',
                cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--ink-2)' }}
        >
            {children}
        </button>
    )
}

function TDivider() {
    return <div style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 4px', flexShrink: 0 }} />
}

/** Primary-toolbar text control (visual-fixes-report FIX 2) — a quiet mono
 * label rather than an icon, reserved for the few controls a label reads
 * more clearly than an icon would (B / I / U). */
function TLabel({ onClick, active, title, disabled, children }: { onClick: () => void; active?: boolean; title: string; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type='button' title={title} disabled={disabled}
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            style={{
                padding: '5px 8px', flexShrink: 0,
                background: active ? 'rgba(var(--acc-rgb), 0.14)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--r)',
                color: active ? 'var(--acc)' : 'var(--ink-2)',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--ink-2)' }}
        >
            {children}
        </button>
    )
}

// ─── Toolbar icons ─────────────────────────────────────────────────────────────
// Small stroke-based inline SVGs (visual-fixes-report FIX 2) rather than the
// MUI/Material glyph set used elsewhere in this file — kept to a single
// consistent stroke weight and size so the shared toolbar reads as one quiet
// row rather than a mix of icon styles. Scoped to `EditorToolbar`; the
// per-image floating toolbar in `ResizableImageView` is a separate control
// surface and keeps its existing MUI icons.
function Svg({ children, size = 15 }: { children: React.ReactNode; size?: number }) {
    return (
        <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.75} strokeLinecap='round' strokeLinejoin='round'>
            {children}
        </svg>
    )
}
const IconUndo = () => <Svg><path d='M3 7v6h6' /><path d='M21 17a9 9 0 0 0-9-9c-2.4 0-4.68.94-6.36 2.64L3 13' /></Svg>
const IconRedo = () => <Svg><path d='M21 7v6h-6' /><path d='M3 17a9 9 0 0 1 9-9c2.4 0 4.68.94 6.36 2.64L21 13' /></Svg>
const IconStrikethrough = () => <Svg><path d='M16 4H9.5A3.5 3.5 0 0 0 8 10.67' /><path d='M14 12a4 4 0 0 1 0 8H6' /><line x1='4' y1='12' x2='20' y2='12' /></Svg>
const IconHighlight = () => <Svg><path d='M4 20h4l10.5-10.5-4-4L4 16Z' /><path d='m13 6.5 4 4' /><path d='M8 20H4v-4' /></Svg>
const IconAlignLeft = () => <Svg><line x1='4' y1='6' x2='20' y2='6' /><line x1='4' y1='12' x2='13' y2='12' /><line x1='4' y1='18' x2='17' y2='18' /></Svg>
const IconAlignCenter = () => <Svg><line x1='4' y1='6' x2='20' y2='6' /><line x1='7.5' y1='12' x2='16.5' y2='12' /><line x1='6' y1='18' x2='18' y2='18' /></Svg>
const IconAlignRight = () => <Svg><line x1='4' y1='6' x2='20' y2='6' /><line x1='11' y1='12' x2='20' y2='12' /><line x1='7' y1='18' x2='20' y2='18' /></Svg>
const IconListBullet = () => <Svg><circle cx='4.5' cy='6' r='1' fill='currentColor' stroke='none' /><circle cx='4.5' cy='12' r='1' fill='currentColor' stroke='none' /><circle cx='4.5' cy='18' r='1' fill='currentColor' stroke='none' /><line x1='9' y1='6' x2='20' y2='6' /><line x1='9' y1='12' x2='20' y2='12' /><line x1='9' y1='18' x2='20' y2='18' /></Svg>
const IconListNumber = () => <Svg><path d='M4.5 5.5h1v3' /><path d='M4.5 14.3c0-.8.7-1.3 1.4-1.3.8 0 1.4.4 1.4 1.1 0 .5-.4.8-.9 1.3l-1.9 1.8h2.8' /><line x1='11' y1='6' x2='20' y2='6' /><line x1='11' y1='12' x2='20' y2='12' /><line x1='11' y1='18' x2='20' y2='18' /></Svg>
const IconQuote = () => <Svg><path d='M7 8a3 3 0 0 0-3 3v2a2 2 0 0 0 2 2h1v3l-3 2' /><path d='M17 8a3 3 0 0 0-3 3v2a2 2 0 0 0 2 2h1v3l-3 2' /></Svg>
const IconRule = () => <Svg><line x1='4' y1='12' x2='20' y2='12' /></Svg>
const IconImage = () => <Svg><rect x='3.5' y='4.5' width='17' height='15' rx='1.5' /><circle cx='9' cy='10' r='1.6' /><path d='m5 17 5-5 3.5 3.5L18 11l1.5 1.5' /></Svg>
const IconLink = () => <Svg><path d='M10 14a4.5 4.5 0 0 1 0-6.36l2-2a4.5 4.5 0 1 1 6.36 6.36l-1.1 1.1' /><path d='M14 10a4.5 4.5 0 0 1 0 6.36l-2 2a4.5 4.5 0 1 1-6.36-6.36l1.1-1.1' /></Svg>
const IconUnlink = () => <Svg><path d='M9.5 14.5a4.5 4.5 0 0 1-1.15-4.4' /><path d='M14.5 9.5a4.5 4.5 0 0 1 1.15 4.4' /><path d='m12.35 6.85 1.65-1.65a4.5 4.5 0 1 1 6.36 6.36l-1.65 1.65' /><path d='m11.65 17.15-1.65 1.65a4.5 4.5 0 1 1-6.36-6.36l1.65-1.65' /><line x1='4' y1='4' x2='20' y2='20' /></Svg>
const IconClear = () => <Svg><path d='M18 5H8.5L4 9.5 12.5 18H18' /><path d='m13.5 9.5-4.5 4.5' /><line x1='9' y1='21' x2='19' y2='21' /></Svg>
const IconChevronDown = () => <Svg size={11}><path d='M6 9l6 6 6-6' /></Svg>
const IconMoreHoriz = () => <Svg><circle cx='5' cy='12' r='1.6' fill='currentColor' stroke='none' /><circle cx='12' cy='12' r='1.6' fill='currentColor' stroke='none' /><circle cx='19' cy='12' r='1.6' fill='currentColor' stroke='none' /></Svg>
