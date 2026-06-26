'use client'

import React, { useContext, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import Collaboration from '@tiptap/extension-collaboration'
import { Extension } from '@tiptap/core'
import { yCursorPlugin, defaultSelectionBuilder } from '@tiptap/y-tiptap'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import PageSidebar from './PageSidebar'
import {
    Undo, Redo,
    FormatBold, FormatItalic, FormatUnderlined, StrikethroughS,
    FormatListBulleted, FormatListNumbered,
    FormatAlignLeft, FormatAlignCenter, FormatAlignRight,
    FormatQuote, HorizontalRule, AddPhotoAlternate, FormatClear, FormatColorFill,
    InsertLink, LinkOff, Delete, Lock, LockOpen,
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
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

const FontSize = Extension.create({
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
}: Props) {
    const [ydoc] = useState(() => new Y.Doc())
    const [ready, setReady] = useState<ReadyState | null>(null)
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
                    },
                    onStatus: ({ status }) => {
                        if (status === 'connecting') setTimeout(() => onSaveStatusChange?.('saving'), 0)
                        if (status === 'connected') setTimeout(() => onSaveStatusChange?.('saved'), 0)
                        if (status === 'disconnected') setTimeout(() => onSaveStatusChange?.('unsaved'), 0)
                    },
                })
                if (!destroyed) setReady({ provider: p, ydoc, user })
            })

        return () => {
            destroyed = true
            p?.destroy()
            setReady(null)
            meta.unobserve(onObserve)
            if (metaHandleRef) metaHandleRef.current = null
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId, ydoc])

    if (!ready) {
        const { r: sr, g: sg, b: sb } = hexToRgb(themeColor)
        const sc = (a: number) => `rgba(${sr},${sg},${sb},${a})`
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <style>{`@keyframes op-pulse{0%,100%{opacity:.35}50%{opacity:.75}}.op-pulse{animation:op-pulse 1.8s ease-in-out infinite}`}</style>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: sc(0.28), textAlign: 'center', paddingBottom: 4 }}>
                    Connecting to collaboration server…
                </div>
                {[1, 0.6].map((opacity, i) => (
                    <div key={i} style={{ border: `1px solid ${sc(0.1)}`, borderTop: `2px solid ${sc(0.25)}`, opacity }}>
                        <div style={{ background: 'rgba(0,0,0,0.35)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className='op-pulse' style={{ width: 6, height: 6, background: sc(0.35), flexShrink: 0 }} />
                                <div className='op-pulse' style={{ height: 7, width: 110 + i * 30, background: sc(0.18), borderRadius: 2 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[28, 28, 28, 28, 28].map((w, j) => (
                                    <div key={j} className='op-pulse' style={{ width: w, height: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
                                ))}
                            </div>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                            {[88, 72, 80, 52].map((w, j) => (
                                <div key={j} className='op-pulse' style={{ height: 8, width: `${w}%`, background: 'rgba(237,237,237,0.055)', borderRadius: 2, animationDelay: `${j * 0.12}s` }} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <ActiveEditor
            ydoc={ready.ydoc}
            provider={ready.provider}
            user={ready.user}
            uploadUrl={uploadUrl}
            defaultSectionTitle={defaultSectionTitle}
            initialContent={initialContent}
            onSaveStatusChange={onSaveStatusChange}
            themeColor={themeColor}
            readOnly={readOnly}
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
    uploadUrl: string
    defaultSectionTitle: string
    initialContent?: any
    onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void
    themeColor?: string
    readOnly?: boolean
}

function ActiveEditor({ ydoc, provider, user, uploadUrl, defaultSectionTitle, initialContent, onSaveStatusChange, themeColor = '#db001d', readOnly = false }: ActiveEditorProps) {
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const [activePage, setActivePage] = useState<string>('main')
    const [sectionIds, setSectionIds] = useState<string[]>([])
    const [seedSectionId, setSeedSectionId] = useState<string | null>(null)
    const [peers, setPeers] = useState<Peer[]>([])
    const [isMobile, setIsMobile] = useState(false)

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
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20, alignItems: 'flex-start' }}>
                <PageSidebar
                    ydoc={ydoc}
                    activePage={activePage}
                    onSelectPage={setActivePage}
                    themeColor={themeColor}
                    orientation={isMobile ? 'top' : 'sidebar'}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', marginRight: 2 }}>
                            {readOnly ? 'Viewing' : 'Editing'}
                        </span>
                        <PresenceAvatar key='self' peer={{ clientId: -1, ...user }} self />
                        {peers.map(peer => (
                            <PresenceAvatar key={peer.clientId} peer={peer} />
                        ))}
                    </div>
                    {sectionIds.map((id, idx) => (
                        <SectionEditor
                            key={`${activePage}-${id}`}
                            ydoc={ydoc}
                            sectionId={id}
                            pageId={activePage}
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
                        />
                    ))}
                    {!readOnly && (
                        <button type='button' onClick={addSection}
                            style={{ alignSelf: 'flex-start', padding: '7px 16px', background: 'transparent', border: `1px dashed ${c(0.3)}`, color: c(0.55), fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = c(0.7); e.currentTarget.style.color = c(0.9) }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = c(0.3); e.currentTarget.style.color = c(0.55) }}
                        >
                            + Add Section
                        </button>
                    )}
                </div>
            </div>
        </ThemeContext.Provider>
    )
}

// ─── Section Editor ────────────────────────────────────────────────────────────

interface SectionEditorProps {
    ydoc: Y.Doc
    sectionId: string
    pageId?: string
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
}

function SectionEditor({ ydoc, sectionId, pageId, provider, user, uploadUrl, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown, themeColor = '#db001d', readOnly = false, seedContent }: SectionEditorProps) {
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const isNonMain = pageId && pageId !== 'main'
    const metaKey = isNonMain ? `smeta-${pageId}-${sectionId}` : `smeta-${sectionId}`
    const contentKey = isNonMain ? `scontent-${pageId}-${sectionId}` : `scontent-${sectionId}`

    const [title, setTitle] = useState('')
    const [isPublic, setIsPublic] = useState(true)
    const [sectionBorderColor, setSectionBorderColor] = useState<string | null>(null)
    const [sectionMinHeight, setSectionMinHeight] = useState(80)

    const effectiveBorderColor = sectionBorderColor || themeColor
    const themeCSS = `
        .op-editor-${sectionId} { min-height: ${sectionMinHeight}px; }
        .op-editor-${sectionId} h1 { border-left-color: ${c(0.75)}; background: ${c(0.045)}; }
        .op-editor-${sectionId} h2 { color: ${c(0.88)}; }
        .op-editor-${sectionId} h2::before { color: ${c(0.65)}; }
        .op-editor-${sectionId} ul li::marker { color: ${c(0.6)}; }
        .op-editor-${sectionId} ol li::marker { color: ${c(0.6)}; }
        .op-editor-${sectionId} blockquote { border-left-color: ${c(0.5)}; background: ${c(0.04)}; }
        .op-editor-${sectionId} hr { border-top-color: ${c(0.2)}; }
        .op-editor-${sectionId} mark { background: ${c(0.2)}; }
        .op-editor-${sectionId} a { color: ${c(0.85)}; }
    `
    const [confirmingRemove, setConfirmingRemove] = useState(false)
    const seededRef = useRef(false)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const borderColorInputRef = useRef<HTMLInputElement>(null)
    const [uploadingImage, setUploadingImage] = useState(false)
    const uploadingImageRef = useRef(false)
    const pasteUploadRef = useRef<(file: File) => void>(() => {})
    const [linkPopover, setLinkPopover] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [linkText, setLinkText] = useState('')
    const linkUrlInputRef = useRef<HTMLInputElement>(null)
    const linkTextInputRef = useRef<HTMLInputElement>(null)
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

    const editor = useEditor({
        immediatelyRender: false,
        editable: !readOnly,
        extensions: [
            StarterKit.configure({ undoRedo: false }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Highlight.configure({ multicolor: false }),
            Underline,
            TextStyle,
            FontSize,
            Placeholder.configure({ placeholder: 'Begin writing this section…' }),
            ResizableImage,
            Link.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
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

    useEffect(() => {
        if (!linkPopover) return
        const close = (e: MouseEvent) => {
            if (!(e.target as Element).closest(`[data-link-popover-${sectionId}]`)) setLinkPopover(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [linkPopover, sectionId])

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
        setUploadingImage(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch(uploadUrl, { method: 'POST', body: formData })
            const json = await res.json()
            if (json.url) editor.chain().focus().setImage({ src: json.url }).run()
            else alert(json.error || 'Upload failed')
        } finally {
            uploadingImageRef.current = false
            setUploadingImage(false)
        }
    }
    pasteUploadRef.current = handleImageUpload

    if (!editor) return null

    return (
        <div style={{ border: `1px solid ${c(0.15)}`, borderTop: `3px solid ${effectiveBorderColor}`, background: 'rgba(255,255,255,0.01)', position: 'relative' }}>
            <style>{themeCSS}</style>

            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.25)' }}>
                {readOnly ? (
                    <span style={{ flex: 1, color: 'rgba(237,237,237,0.7)', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
                ) : (
                    <input
                        value={title}
                        onChange={e => updateMeta({ title: e.target.value })}
                        placeholder='Section Title'
                        style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', outline: 'none', padding: '2px 0' }}
                    />
                )}
                {!readOnly && (<>
                    {/* Border color picker */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <input ref={borderColorInputRef} type='color'
                            value={sectionBorderColor || themeColor}
                            onChange={e => updateMeta({ borderColor: e.target.value })}
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                        />
                        <button type='button' title='Section border colour' onClick={() => borderColorInputRef.current?.click()}
                            style={{ width: 16, height: 16, borderRadius: 2, background: effectiveBorderColor, border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'block', flexShrink: 0 }}
                        />
                    </div>
                    <button type='button'
                        title={isPublic ? 'Publicly visible — click to make private' : 'Members only — click to make public'}
                        onClick={() => updateMeta({ isPublic: !isPublic })}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: isPublic ? 'rgba(100,220,100,0.07)' : 'rgba(219,180,0,0.07)', border: `1px solid ${isPublic ? 'rgba(100,220,100,0.25)' : 'rgba(219,180,0,0.3)'}`, color: isPublic ? 'rgba(100,220,100,0.8)' : 'rgba(219,180,0,0.8)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
                    >
                        {isPublic ? <><LockOpen style={{ fontSize: 12 }} /> Public</> : <><Lock style={{ fontSize: 12 }} /> Members Only</>}
                    </button>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button type='button' title='Move section up' onClick={onMoveUp} disabled={!canMoveUp}
                            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: canMoveUp ? 'rgba(237,237,237,0.3)' : 'rgba(237,237,237,0.08)', cursor: canMoveUp ? 'pointer' : 'default', padding: '2px 4px', fontSize: '0.75rem', lineHeight: 1, transition: 'color 0.15s' }}
                            onMouseEnter={e => { if (canMoveUp) e.currentTarget.style.color = 'rgba(237,237,237,0.8)' }}
                            onMouseLeave={e => { if (canMoveUp) e.currentTarget.style.color = 'rgba(237,237,237,0.3)' }}
                        >▲</button>
                        <button type='button' title='Move section down' onClick={onMoveDown} disabled={!canMoveDown}
                            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: canMoveDown ? 'rgba(237,237,237,0.3)' : 'rgba(237,237,237,0.08)', cursor: canMoveDown ? 'pointer' : 'default', padding: '2px 4px', fontSize: '0.75rem', lineHeight: 1, transition: 'color 0.15s' }}
                            onMouseEnter={e => { if (canMoveDown) e.currentTarget.style.color = 'rgba(237,237,237,0.8)' }}
                            onMouseLeave={e => { if (canMoveDown) e.currentTarget.style.color = 'rgba(237,237,237,0.3)' }}
                        >▼</button>
                    </div>
                    {confirmingRemove ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.7)', letterSpacing: '0.08em' }}>Remove section?</span>
                            <button type='button' onClick={onRemove} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.9)', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', padding: '3px 8px', cursor: 'pointer' }}>Yes</button>
                            <button type='button' onClick={() => setConfirmingRemove(false)} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px', cursor: 'pointer' }}>No</button>
                        </div>
                    ) : (
                        <button type='button' title='Remove section' onClick={() => setConfirmingRemove(true)}
                            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: 'rgba(237,237,237,0.2)', cursor: 'pointer', padding: 4, flexShrink: 0, transition: 'color 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.7)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.2)')}
                        >
                            <Delete style={{ fontSize: 16 }} />
                        </button>
                    )}
                </>)}
            </div>

            {/* Toolbar */}
            <div style={{ display: readOnly ? 'none' : 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: '7px 10px', background: 'rgb(10,10,10)', borderBottom: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.6)', position: 'sticky', top: 0, zIndex: 20 }}>
                <TBtn title='Undo' onClick={() => editor.chain().focus().undo().run()}><Undo style={{ fontSize: 16 }} /></TBtn>
                <TBtn title='Redo' onClick={() => editor.chain().focus().redo().run()}><Redo style={{ fontSize: 16 }} /></TBtn>
                <TDivider />
                {([1, 2, 3] as const).map(level => (
                    <TBtn key={level} title={`Heading ${level}`} active={editor.isActive('heading', { level })} onClick={() => editor.chain().focus().toggleHeading({ level }).run()}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em' }}>H{level}</span>
                    </TBtn>
                ))}
                <select
                    value={(editor.getAttributes('textStyle').fontSize as string | undefined) || ''}
                    onChange={e => {
                        if (e.target.value) (editor.chain().focus() as any).setFontSize(e.target.value).run()
                        else (editor.chain().focus() as any).unsetFontSize().run()
                    }}
                    title='Font size'
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.6)', fontSize: '0.65rem', padding: '0 4px', cursor: 'pointer', height: 28, outline: 'none', minWidth: 52 }}>
                    <option value=''>Size</option>
                    {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => (
                        <option key={s} value={`${s}px`}>{s}</option>
                    ))}
                </select>
                <TDivider />
                <TBtn title='Bold' active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><FormatBold style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Italic' active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><FormatItalic style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Underline' active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><FormatUnderlined style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Strikethrough' active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughS style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Highlight' active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}><FormatColorFill style={{ fontSize: 17 }} /></TBtn>
                <TDivider />
                <TBtn title='Align Left' active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><FormatAlignLeft style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Align Centre' active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><FormatAlignCenter style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Align Right' active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><FormatAlignRight style={{ fontSize: 17 }} /></TBtn>
                <TDivider />
                <TBtn title='Bullet List' active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><FormatListBulleted style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Numbered List' active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><FormatListNumbered style={{ fontSize: 17 }} /></TBtn>
                <TDivider />
                <TBtn title='Quote' active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><FormatQuote style={{ fontSize: 17 }} /></TBtn>
                <TBtn title='Section Divider' onClick={() => editor.chain().focus().setHorizontalRule().run()}><HorizontalRule style={{ fontSize: 17 }} /></TBtn>
                <TDivider />
                <TBtn title={uploadingImage ? 'Uploading...' : 'Insert Image'} onClick={() => imageInputRef.current?.click()} active={uploadingImage}>
                    <AddPhotoAlternate style={{ fontSize: 17, opacity: uploadingImage ? 0.4 : 1 }} />
                </TBtn>
                <div style={{ position: 'relative' }}>
                    <TBtn title={editor.isActive('link') ? 'Edit Link' : 'Insert Link'} active={editor.isActive('link')}
                        onClick={() => {
                            const existing = editor.getAttributes('link').href || ''
                            setLinkUrl(existing)
                            setLinkText('')
                            setLinkPopover(v => !v)
                            const noSel = editor.state.selection.empty
                            setTimeout(() => (noSel ? linkTextInputRef.current : linkUrlInputRef.current)?.focus(), 40)
                        }}
                    >
                        <InsertLink style={{ fontSize: 17 }} />
                    </TBtn>
                    {linkPopover && (
                        <div {...{ [`data-link-popover-${sectionId}`]: true }} onMouseDown={e => e.stopPropagation()}
                            style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'rgba(14,14,14,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 280, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                        >
                            {editor.state.selection.empty && (
                                <input ref={linkTextInputRef} value={linkText} onChange={e => setLinkText(e.target.value)} placeholder='Display text'
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); linkUrlInputRef.current?.focus() } if (e.key === 'Escape') setLinkPopover(false) }}
                                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', letterSpacing: '0.02em', outline: 'none', padding: '3px 2px' }}
                                />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input ref={linkUrlInputRef} value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder='https://…'
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                                        if (e.key === 'Escape') setLinkPopover(false)
                                    }}
                                    style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', letterSpacing: '0.02em', outline: 'none', padding: '3px 2px' }}
                                />
                                <button type='button' onClick={applyLink}
                                    style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(${r},${g},${b},0.85)`, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                                >Apply</button>
                            </div>
                        </div>
                    )}
                </div>
                <TBtn title='Remove Link' onClick={() => { editor.chain().focus().unsetLink().run(); setLinkPopover(false) }}>
                    <LinkOff style={{ fontSize: 17 }} />
                </TBtn>
                <TDivider />
                <TBtn title='Clear Formatting' onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
                    <FormatClear style={{ fontSize: 17 }} />
                </TBtn>
            </div>

            <EditorContent editor={editor} />

            {!readOnly && (
                <div onMouseDown={onHeightDragStart}
                    style={{ height: 8, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                    title='Drag to set minimum height'>
                    <div style={{ width: 28, height: 2, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }} />
                </div>
            )}

            <input ref={imageInputRef} type='file' accept='image/*' style={{ display: 'none' }}
                onChange={e => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); e.target.value = '' }}
            />
        </div>
    )
}

function PresenceAvatar({ peer, self }: { peer: Peer; self?: boolean }) {
    const [hovered, setHovered] = useState(false)
    return (
        <div style={{ position: 'relative', flexShrink: 0 }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: peer.color, border: `2px solid ${self ? 'rgba(255,255,255,0.5)' : peer.color}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', cursor: 'default', flexShrink: 0, opacity: self ? 0.85 : 1 }}>
                {peer.avatar ? <img src={peer.avatar} alt={peer.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : peer.name.charAt(0)}
            </div>
            {hovered && (
                <div style={{ position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)', background: peer.color, color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 100 }}>
                    {self ? `${peer.name} (you)` : peer.name}
                </div>
            )}
        </div>
    )
}

function TBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
    const themeColor = useContext(ThemeContext)
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    return (
        <button type='button' title={title} onClick={onClick}
            style={{ padding: '4px 7px', background: active ? c(0.15) : 'transparent', border: active ? `1px solid ${c(0.3)}` : '1px solid transparent', color: active ? c(0.9) : 'rgba(237,237,237,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, transition: 'all 0.15s', minWidth: 28, height: 28 }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'rgba(237,237,237,0.9)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'rgba(237,237,237,0.5)'; e.currentTarget.style.background = 'transparent' } }}
        >
            {children}
        </button>
    )
}

function TDivider() {
    return <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 3px' }} />
}
