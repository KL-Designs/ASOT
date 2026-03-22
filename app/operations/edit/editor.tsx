'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import { useRef, useState } from 'react'

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

export default function OperationEditor({ operationId, initialContent, onSaveStatusChange }: Props) {
    const saveTimer = useRef<ReturnType<typeof setTimeout>>()
    const imageInputRef = useRef<HTMLInputElement>(null)
    const [uploadingImage, setUploadingImage] = useState(false)

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Highlight.configure({ multicolor: false }),
            Placeholder.configure({ placeholder: 'Begin writing the operation document...' }),
            Image.configure({ inline: false, allowBase64: false }),
            GlobalDragHandle.configure({ dragHandleWidth: 20 }),
        ],
        content: initialContent || null,
        editorProps: { attributes: { class: 'op-editor' } },
        onUpdate: ({ editor }) => {
            onSaveStatusChange?.('unsaved')
            clearTimeout(saveTimer.current)
            saveTimer.current = setTimeout(async () => {
                onSaveStatusChange?.('saving')
                try {
                    await fetch('/api/operations/content', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: operationId, content: editor.getJSON() }),
                    })
                    onSaveStatusChange?.('saved')
                } catch {
                    onSaveStatusChange?.('unsaved')
                }
            }, 1500)
        },
    })

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
