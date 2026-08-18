'use client'

import React, { useContext, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
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
import IntelPackageEditor from './intel-package/IntelPackageEditor'
import ImageLibraryModal from './ImageLibraryModal'
import {
    Undo, Redo, StrikethroughS,
    FormatListNumbered,
    FormatAlignLeft, FormatAlignCenter, FormatAlignRight,
    FormatQuote, HorizontalRule, FormatClear, FormatColorFill,
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
                minHeight: '100%',
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
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    {/* One persistent formatting toolbar, owned by the column rather
                        than any section (visual-fixes spec §1) — pinned above all
                        document content and, via `position: sticky`, staying put as
                        the content beneath it scrolls inside .mainScroll. It always
                        targets `activeEditor`, the last section to report focus. */}
                    {!readOnly && activePageType !== 'intel' && (
                        <EditorToolbar editor={activeEditor} uploadUrl={uploadUrl} containerRef={toolbarRef} />
                    )}
                    <div style={{ flex: 1, padding: isMobile ? 0 : '24px 48px 40px' }}>
                        {/* Widened measure (visual-fixes spec §2): ~1100-1200px rather
                            than the old ~740px cap, so the document reads as a real
                            writing surface instead of a phone-width column. */}
                        <div style={{ maxWidth: 1160, margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {activePageType !== 'intel' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginRight: 2 }}>
                                        {readOnly ? 'Viewing' : 'Editing'}
                                    </span>
                                    <PresenceAvatar key='self' peer={{ clientId: -1, ...user }} self />
                                    {peers.map(peer => (
                                        <PresenceAvatar key={peer.clientId} peer={peer} />
                                    ))}
                                </div>
                            )}

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
 */
function EditorToolbar({ editor, uploadUrl, containerRef }: EditorToolbarProps) {
    const [toolbarOverflowOpen, setToolbarOverflowOpen] = useState(false)
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

    return (
        <div ref={containerRef} style={{
            display: 'flex', alignItems: 'center', gap: 2, height: 44, flexShrink: 0,
            borderBottom: '1px solid var(--line)', background: 'var(--bg)', padding: '0 20px',
            position: 'sticky', top: 0, zIndex: 20,
            opacity: disabled ? 0.45 : 1, transition: 'opacity 0.15s',
        }}>
            <select
                value={String(currentHeadingLevel)}
                disabled={disabled}
                onChange={e => {
                    if (!editor) return
                    const lvl = Number(e.target.value)
                    if (lvl === 0) editor.chain().focus().setParagraph().run()
                    else editor.chain().focus().setHeading({ level: lvl as 1 | 2 | 3 }).run()
                }}
                title='Block style'
                style={{ background: 'none', border: 'none', color: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '4px 6px', cursor: disabled ? 'default' : 'pointer', outline: 'none' }}
            >
                <option value='0'>Text</option>
                <option value='1'>Heading 1</option>
                <option value='2'>Heading 2</option>
                <option value='3'>Heading 3</option>
            </select>
            <TDivider />
            <TLabel title='Bold' disabled={disabled} active={!!editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>B</TLabel>
            <TLabel title='Italic' disabled={disabled} active={!!editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>I</TLabel>
            <TLabel title='Underline' disabled={disabled} active={!!editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>U</TLabel>
            <TDivider />
            <TLabel title='Bullet List' disabled={disabled} active={!!editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</TLabel>
            <div style={{ position: 'relative' }}>
                <TLabel title={uploadingImage ? 'Uploading…' : 'Insert Image'} disabled={disabled} active={uploadingImage || imagePopoverOpen}
                    onClick={() => { if (!uploadingImage) setImagePopoverOpen(v => !v) }}
                >
                    Image
                </TLabel>
                {imagePopoverOpen && !uploadingImage && (
                    <div
                        onMouseDown={e => e.stopPropagation()}
                        style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', padding: '4px 0', display: 'flex', flexDirection: 'column', minWidth: 190, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                    >
                        <button type='button'
                            onClick={() => { setImagePopoverOpen(false); imageInputRef.current?.click() }}
                            style={{ padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--ink-2)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >Upload from Computer</button>
                        <button type='button'
                            onClick={() => { setImagePopoverOpen(false); setShowImageLibrary(true) }}
                            style={{ padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--ink-2)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--s3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >Select from Library</button>
                    </div>
                )}
            </div>

            <div style={{ flex: 1 }} />

            {/* Overflow — undo/redo, font size, strike/highlight, align,
                numbered list, quote, divider, link, clear formatting. Same
                commands the old per-section overflow menu exposed; only the
                toolbar hosting them moved. */}
            <div style={{ position: 'relative' }}>
                <TLabel title='More formatting' disabled={disabled} active={toolbarOverflowOpen} onClick={() => setToolbarOverflowOpen(v => !v)}>⋯</TLabel>
                {toolbarOverflowOpen && editor && (
                    <div
                        onMouseDown={e => e.stopPropagation()}
                        style={{ position: 'absolute', top: '110%', right: 0, zIndex: 50, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', padding: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, width: 232, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                    >
                        <TBtn title='Undo' onClick={() => editor.chain().focus().undo().run()}><Undo style={{ fontSize: 16 }} /></TBtn>
                        <TBtn title='Redo' onClick={() => editor.chain().focus().redo().run()}><Redo style={{ fontSize: 16 }} /></TBtn>
                        <TDivider />
                        <TBtn title='Strikethrough' active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughS style={{ fontSize: 17 }} /></TBtn>
                        <TBtn title='Highlight' active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}><FormatColorFill style={{ fontSize: 17 }} /></TBtn>
                        <TDivider />
                        <TBtn title='Align Left' active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><FormatAlignLeft style={{ fontSize: 17 }} /></TBtn>
                        <TBtn title='Align Centre' active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><FormatAlignCenter style={{ fontSize: 17 }} /></TBtn>
                        <TBtn title='Align Right' active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><FormatAlignRight style={{ fontSize: 17 }} /></TBtn>
                        <TDivider />
                        <TBtn title='Numbered List' active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><FormatListNumbered style={{ fontSize: 17 }} /></TBtn>
                        <TBtn title='Quote' active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><FormatQuote style={{ fontSize: 17 }} /></TBtn>
                        <TBtn title='Section Divider' onClick={() => editor.chain().focus().setHorizontalRule().run()}><HorizontalRule style={{ fontSize: 17 }} /></TBtn>
                        <TDivider />
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
                                        <button type='button' onClick={applyLink}
                                            style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
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
                        <select
                            value={(editor.getAttributes('textStyle').fontSize as string | undefined) || ''}
                            onChange={e => {
                                if (e.target.value) (editor.chain().focus() as any).setFontSize(e.target.value).run()
                                else (editor.chain().focus() as any).unsetFontSize().run()
                            }}
                            title='Font size'
                            style={{ background: 'var(--s3)', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: '0.65rem', padding: '0 4px', cursor: 'pointer', height: 26, outline: 'none', minWidth: 52 }}>
                            <option value=''>Size</option>
                            {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => (
                                <option key={s} value={`${s}px`}>{s}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

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

    const editor = useEditor({
        immediatelyRender: false,
        editable: !readOnly,
        onFocus: ({ editor: e }) => onFocusEditor?.(e),
        onBlur: ({ editor: e, event }) => onBlurEditor?.(e, event),
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
                background: 'rgba(var(--acc-rgb), 0.02)',
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
                        {pageTitle}
                    </div>
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

/** Primary-toolbar control (visual-fixes spec §2): a quiet mono text label
 * rather than an MUI icon — used for the small set of controls that stay
 * visible on the slim main row (block style, B/I/U, list, image, the
 * overflow toggle). Everything else keeps the icon-based `TBtn` inside the
 * overflow panel. */
function TLabel({ onClick, active, title, disabled, children }: { onClick: () => void; active?: boolean; title: string; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type='button' title={title} onClick={onClick} disabled={disabled}
            style={{
                padding: '5px 8px',
                background: active ? 'var(--s2)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--r)',
                color: active ? 'var(--ink)' : 'var(--ink-2)',
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
