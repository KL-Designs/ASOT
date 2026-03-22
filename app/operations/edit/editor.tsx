'use client'

import { useEditor, EditorContent } from '@tiptap/react'
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
import { useEffect, useRef, useState } from 'react'

import {
    Undo, Redo,
    FormatBold, FormatItalic, FormatUnderlined, StrikethroughS,
    FormatListBulleted, FormatListNumbered,
    FormatAlignLeft, FormatAlignCenter, FormatAlignRight,
    FormatQuote, HorizontalRule, AddPhotoAlternate, FormatClear, FormatColorFill,
} from '@mui/icons-material'


interface Props {
    operationId: string
    initialContent?: any
    onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void
}

interface PresenceUser {
    name: string
    color: string
}

interface Peer extends PresenceUser {
    clientId: number
}

interface ReadyState {
    provider: HocuspocusProvider
    user: PresenceUser
}

const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:1234'

// ─── Outer shell ─────────────────────────────────────────────────────────────
// Handles the async token fetch + provider creation. Only renders the real
// editor once the provider is live, so CollaborationCursor always gets a
// valid provider at init time (avoids y-prosemirror "doc" crash).

export default function OperationEditor({ operationId, initialContent, onSaveStatusChange }: Props) {
    const [ydoc] = useState(() => new Y.Doc())
    const [ready, setReady] = useState<ReadyState | null>(null)

    useEffect(() => {
        let destroyed = false
        let p: HocuspocusProvider | null = null

        fetch('/api/me/token')
            .then(r => r.json())
            .then(({ token, name, color }) => {
                if (destroyed || !token) return
                const user: PresenceUser = { name: name || 'Unknown', color: color || '#db001d' }
                p = new HocuspocusProvider({
                    url: COLLAB_WS_URL,
                    name: operationId,
                    document: ydoc,
                    token,
                    onSynced: () => setTimeout(() => onSaveStatusChange?.('saved'), 0),
                    onStatus: ({ status }) => {
                        if (status === 'connecting') setTimeout(() => onSaveStatusChange?.('saving'), 0)
                    },
                })
                if (!destroyed) setReady({ provider: p, user })
            })

        return () => {
            destroyed = true
            p?.destroy()
            setReady(null)
        }
    }, [operationId, ydoc])

    if (!ready) {
        return (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(237,237,237,0.15)', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Connecting…
            </div>
        )
    }

    return (
        <ActiveEditor
            ydoc={ydoc}
            provider={ready.provider}
            user={ready.user}
            initialContent={initialContent}
            onSaveStatusChange={onSaveStatusChange}
        />
    )
}

// Build a cursor extension using @tiptap/y-tiptap's yCursorPlugin so it shares
// the same ySyncPluginKey as @tiptap/extension-collaboration (v3.x moved off
// y-prosemirror's key, so the stock CollaborationCursor@3 crashes at init).
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

// ─── Inner editor ─────────────────────────────────────────────────────────────
// Mounted once provider is ready. Editor is created once — no deps recreation.

interface ActiveEditorProps {
    ydoc: Y.Doc
    provider: HocuspocusProvider
    user: PresenceUser
    initialContent?: any
    onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void
}

function ActiveEditor({ ydoc, provider, user, initialContent, onSaveStatusChange }: ActiveEditorProps) {
    const imageInputRef = useRef<HTMLInputElement>(null)
    const [uploadingImage, setUploadingImage] = useState(false)
    const seededRef = useRef(false)
    const [peers, setPeers] = useState<Peer[]>([])

    // Track presence of other connected users
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

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({ undoRedo: false }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Highlight.configure({ multicolor: false }),
            Placeholder.configure({ placeholder: 'Begin writing the operation document...' }),
            Image.configure({ inline: false, allowBase64: false }),
            GlobalDragHandle.configure({ dragHandleWidth: 20 }),
            Collaboration.configure({ document: ydoc }),
            buildCursorExtension(provider, user),
        ],
        editorProps: { attributes: { class: 'op-editor' } },
    })

    // Seed the Yjs doc with existing content the first time it's opened collaboratively
    useEffect(() => {
        if (!editor || seededRef.current) return
        const onSynced = () => {
            if (editor.isEmpty && initialContent) {
                editor.commands.setContent(initialContent)
            }
            seededRef.current = true
        }
        provider.on('synced', onSynced)
        return () => { provider.off('synced', onSynced) }
    }, [editor, provider, initialContent])

    async function handleImageUpload(file: File) {
        if (!editor || uploadingImage) return
        setUploadingImage(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch('/api/operations/upload', { method: 'POST', body: formData })
            const json = await res.json()
            if (json.url) editor.chain().focus().setImage({ src: json.url }).run()
            else alert(json.error || 'Upload failed')
        } finally {
            setUploadingImage(false)
        }
    }

    if (!editor) return null

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

            {/* Toolbar */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2,
                padding: '7px 10px',
                background: 'rgba(0,0,0,0.4)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                position: 'sticky', top: 0, zIndex: 10,
            }}>

                <TBtn title='Undo' onClick={() => editor.chain().focus().undo().run()}>
                    <Undo style={{ fontSize: 16 }} />
                </TBtn>
                <TBtn title='Redo' onClick={() => editor.chain().focus().redo().run()}>
                    <Redo style={{ fontSize: 16 }} />
                </TBtn>

                <TDivider />

                {([1, 2, 3] as const).map(level => (
                    <TBtn
                        key={level}
                        title={`Heading ${level}`}
                        active={editor.isActive('heading', { level })}
                        onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                    >
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em' }}>H{level}</span>
                    </TBtn>
                ))}

                <TDivider />

                <TBtn title='Bold' active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
                    <FormatBold style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Italic' active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
                    <FormatItalic style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Underline' active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                    <FormatUnderlined style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Strikethrough' active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
                    <StrikethroughS style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Highlight' active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>
                    <FormatColorFill style={{ fontSize: 17 }} />
                </TBtn>

                <TDivider />

                <TBtn title='Align Left' active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
                    <FormatAlignLeft style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Align Centre' active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
                    <FormatAlignCenter style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Align Right' active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
                    <FormatAlignRight style={{ fontSize: 17 }} />
                </TBtn>

                <TDivider />

                <TBtn title='Bullet List' active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                    <FormatListBulleted style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Numbered List' active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                    <FormatListNumbered style={{ fontSize: 17 }} />
                </TBtn>

                <TDivider />

                <TBtn title='Quote' active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                    <FormatQuote style={{ fontSize: 17 }} />
                </TBtn>
                <TBtn title='Section Divider' onClick={() => editor.chain().focus().setHorizontalRule().run()}>
                    <HorizontalRule style={{ fontSize: 17 }} />
                </TBtn>

                <TDivider />

                <TBtn
                    title={uploadingImage ? 'Uploading...' : 'Insert Image'}
                    onClick={() => imageInputRef.current?.click()}
                    active={uploadingImage}
                >
                    <AddPhotoAlternate style={{ fontSize: 17, opacity: uploadingImage ? 0.4 : 1 }} />
                </TBtn>

                <TDivider />

                <TBtn title='Clear Formatting' onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
                    <FormatClear style={{ fontSize: 17 }} />
                </TBtn>

                {/* Presence avatars — right-aligned */}
                {peers.length > 0 && (
                    <>
                        <div style={{ flex: 1 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {peers.map(peer => (
                                <PresenceAvatar key={peer.clientId} peer={peer} />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Content area */}
            <EditorContent editor={editor} />

            {/* Hidden image input */}
            <input
                ref={imageInputRef}
                type='file'
                accept='image/*'
                style={{ display: 'none' }}
                onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(file)
                    e.target.value = ''
                }}
            />
        </div>
    )
}


function PresenceAvatar({ peer }: { peer: Peer }) {
    const [hovered, setHovered] = useState(false)
    return (
        <div
            style={{ position: 'relative', flexShrink: 0 }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={{
                width: 26, height: 26,
                borderRadius: '50%',
                background: peer.color,
                border: '2px solid rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff',
                textTransform: 'uppercase',
                cursor: 'default',
            }}>
                {peer.name.charAt(0)}
            </div>
            {hovered && (
                <div style={{
                    position: 'absolute',
                    bottom: '120%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: peer.color,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 3,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 100,
                }}>
                    {peer.name}
                </div>
            )}
        </div>
    )
}


function TBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
    return (
        <button
            type='button'
            title={title}
            onClick={onClick}
            style={{
                padding: '4px 7px',
                background: active ? 'rgba(219,0,29,0.15)' : 'transparent',
                border: active ? '1px solid rgba(219,0,29,0.3)' : '1px solid transparent',
                color: active ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.5)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 2,
                transition: 'all 0.15s',
                minWidth: 28, height: 28,
            }}
            onMouseEnter={e => {
                if (!active) {
                    e.currentTarget.style.color = 'rgba(237,237,237,0.9)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                }
            }}
            onMouseLeave={e => {
                if (!active) {
                    e.currentTarget.style.color = 'rgba(237,237,237,0.5)'
                    e.currentTarget.style.background = 'transparent'
                }
            }}
        >
            {children}
        </button>
    )
}

function TDivider() {
    return <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 3px' }} />
}
