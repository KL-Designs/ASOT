'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension, ReactNodeViewRenderer } from '@tiptap/react'
import ImageNodeView from './ImageNodeView'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import ImageExt from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import {
    FormatBold, FormatItalic, FormatUnderlined, StrikethroughS,
    FormatAlignLeft, FormatAlignCenter, FormatAlignRight, FormatAlignJustify,
    FormatListBulleted, FormatListNumbered, HorizontalRule,
    Undo, Redo,
    BorderColor as TextColorIcon,
    Highlight as HighlightIcon,
    TableChart, ViewColumn, TableRows, DeleteSweep,
} from '@mui/icons-material'

// ── Preserve margin-left (Google Docs indentation) on paragraphs/headings/lists
const MarginLeftExtension = Extension.create({
    name: 'marginLeft',
    addGlobalAttributes() {
        return [{
            types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'],
            attributes: {
                marginLeft: {
                    default: null,
                    parseHTML: el => (el as HTMLElement).style.marginLeft || null,
                    renderHTML: attrs => attrs.marginLeft ? { style: `margin-left:${attrs.marginLeft}` } : {},
                },
            },
        }]
    },
})

// ── Preserve lst-kix_* class attributes on list nodes (for Google Docs custom bullets)
const ListClassExtension = Extension.create({
    name: 'listClass',
    addGlobalAttributes() {
        return [{
            types: ['bulletList', 'orderedList', 'listItem'],
            attributes: {
                class: {
                    default: null,
                    parseHTML: el => el.getAttribute('class') || null,
                    renderHTML: attrs => attrs.class ? { class: attrs.class } : {},
                },
            },
        }]
    },
})

// ── Preserve id attributes on headings (needed for TOC anchor links)
const HeadingIdExtension = Extension.create({
    name: 'headingId',
    addGlobalAttributes() {
        return [{
            types: ['heading'],
            attributes: {
                id: {
                    default: null,
                    parseHTML: el => el.getAttribute('id') || null,
                    renderHTML: attrs => attrs.id ? { id: attrs.id } : {},
                },
            },
        }]
    },
})

// ── Tab key: indent list items or increase margin-left on block nodes
const TabIndentExtension = Extension.create({
    name: 'tabIndent',
    addKeyboardShortcuts() {
        return {
            'Tab': ({ editor }) => {
                if (editor.isActive('listItem')) return editor.commands.sinkListItem('listItem')
                const { $from } = editor.state.selection
                const nodeType = $from.node().type.name
                if (nodeType === 'paragraph' || nodeType === 'heading') {
                    const current = parseFloat($from.node().attrs.marginLeft ?? '0') || 0
                    return editor.commands.updateAttributes(nodeType, { marginLeft: `${current + 36}pt` })
                }
                return false
            },
            'Shift-Tab': ({ editor }) => {
                if (editor.isActive('listItem')) return editor.commands.liftListItem('listItem')
                const { $from } = editor.state.selection
                const nodeType = $from.node().type.name
                if (nodeType === 'paragraph' || nodeType === 'heading') {
                    const current = parseFloat($from.node().attrs.marginLeft ?? '0') || 0
                    const next = Math.max(0, current - 36)
                    return editor.commands.updateAttributes(nodeType, { marginLeft: next > 0 ? `${next}pt` : null })
                }
                return false
            },
            // At the start of an indented block, Backspace removes one indent level
            // instead of merging the line with the paragraph above
            'Backspace': ({ editor }) => {
                const { selection } = editor.state
                if (!selection.empty) return false
                const { $from } = selection
                if ($from.parentOffset !== 0) return false
                const nodeType = $from.node().type.name
                if (nodeType !== 'paragraph' && nodeType !== 'heading') return false
                const current = parseFloat($from.node().attrs.marginLeft ?? '0') || 0
                if (current <= 0) return false
                const next = Math.max(0, current - 36)
                return editor.commands.updateAttributes(nodeType, { marginLeft: next > 0 ? `${next}pt` : null })
            },
        }
    },
})

// ── Custom image node: block-level, with resize / alignment / crop attributes
const CustomImage = ImageExt.extend({
    inline: false,
    group: 'block',
    addAttributes() {
        return {
            ...this.parent?.(),
            // Display width in px (null = auto)
            width: {
                default: null,
                parseHTML: el => parseInt(el.style.width ?? '') || parseInt(el.getAttribute('width') ?? '') || null,
                renderHTML: attrs => attrs.width ? { style: `width:${attrs.width}px` } : {},
            },
            // Horizontal alignment: null | 'center' | 'right' | 'wrap-left' | 'wrap-right' | 'free'
            'data-align': {
                default: null,
                parseHTML: el => el.getAttribute('data-align') || null,
                renderHTML: attrs => {
                    if (!attrs['data-align']) return {}
                    if (attrs['data-align'] === 'free') {
                        return { 'data-align': 'free', style: 'position:absolute;z-index:5' }
                    }
                    return { 'data-align': attrs['data-align'] }
                },
            },
            // Free-position coordinates (px from top-left of editor/viewer container)
            'data-pos-x': {
                default: null,
                parseHTML: el => parseInt(el.getAttribute('data-pos-x') ?? '') || null,
                renderHTML: attrs => attrs['data-pos-x'] != null && attrs['data-align'] === 'free'
                    ? { 'data-pos-x': String(attrs['data-pos-x']), style: `left:${attrs['data-pos-x']}px` }
                    : {},
            },
            'data-pos-y': {
                default: null,
                parseHTML: el => parseInt(el.getAttribute('data-pos-y') ?? '') || null,
                renderHTML: attrs => attrs['data-pos-y'] != null && attrs['data-align'] === 'free'
                    ? { 'data-pos-y': String(attrs['data-pos-y']), style: `top:${attrs['data-pos-y']}px` }
                    : {},
            },
            // CSS clip-path crop string, e.g. "inset(10% 5% 0% 5%)"
            'data-crop': {
                default: null,
                parseHTML: el => el.getAttribute('data-crop') || (el.style.clipPath ? el.style.clipPath : null),
                renderHTML: attrs => attrs['data-crop']
                    ? { 'data-crop': attrs['data-crop'], style: `clip-path:${attrs['data-crop']}` }
                    : {},
            },
        }
    },
    addNodeView() {
        return ReactNodeViewRenderer(ImageNodeView)
    },
})

// ── Split HTML: extract leading <style> block (Google Docs list CSS) from body
function splitStyleBlock(html: string): { styleInner: string; body: string } {
    const m = html.match(/^<style>([\s\S]*?)<\/style>/)
    if (!m) return { styleInner: '', body: html }
    return { styleInner: m[1], body: html.slice(m[0].length) }
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
    initialContent?: string
    onChange?: (html: string) => void
    readOnly?: boolean
    minHeight?: number
}

export default function SimpleEditor({ initialContent = '', onChange, readOnly = false, minHeight = 300 }: Props) {
    const colorInputRef    = useRef<HTMLInputElement>(null)
    const containerRef     = useRef<HTMLDivElement>(null)
    const styleElRef       = useRef<HTMLStyleElement | null>(null)
    const styleInnerRef    = useRef('')   // preserved style block, re-prepended on save
    const [inTable, setInTable] = useState(false)

    // Inject / update the Google Docs list CSS into the editor container's DOM
    // so custom bullet :before rules fire while editing, without being part of the TipTap doc.
    function applyStyleBlock(css: string) {
        styleInnerRef.current = css
        if (!containerRef.current) return
        if (!styleElRef.current) {
            const el = document.createElement('style')
            containerRef.current.prepend(el)
            styleElRef.current = el
        }
        // The stored CSS is scoped to .training-doc-body (read view); remap to .simple-editor-content for the editor view
        styleElRef.current.textContent = css.replace(/\.training-doc-body\s/g, '.simple-editor-content ')
    }

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Underline,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
            Link.configure({ openOnClick: false }),
            CustomImage.configure({ allowBase64: false }),
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
            MarginLeftExtension,
            ListClassExtension,
            TabIndentExtension,
            HeadingIdExtension,
        ],
        content: (() => {
            const { styleInner, body } = splitStyleBlock(initialContent)
            styleInnerRef.current = styleInner
            return body
        })(),
        editable: !readOnly,
        onUpdate: ({ editor }) => {
            setInTable(editor.isActive('table'))
            onChange?.(
                (styleInnerRef.current ? `<style>${styleInnerRef.current}</style>` : '') +
                editor.getHTML()
            )
        },
        onSelectionUpdate: ({ editor }) => {
            setInTable(editor.isActive('table'))
        },
        editorProps: {
            attributes: { class: 'simple-editor-content' },
        },
    })

    // Inject style block once editor container mounts
    useEffect(() => {
        if (styleInnerRef.current) applyStyleBlock(styleInnerRef.current)
    }, [])

    // Sync readOnly
    useEffect(() => { editor?.setEditable(!readOnly) }, [readOnly, editor])

    // Sync content when initialContent changes externally (doc switch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!editor) return
        const { styleInner, body } = splitStyleBlock(initialContent)
        applyStyleBlock(styleInner)
        if (editor.getHTML() !== body) {
            editor.commands.setContent(body, { emitUpdate: false })
        }
    }, [initialContent])

    if (!editor) return null

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.08)' }}>
            <style>{editorCss}</style>

            {!readOnly && (
                <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0e0e0e' }}>
                    {/* ── Main toolbar ──────────────────────────────────────── */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

                        <ToolGroup>
                            <ToolBtn onClick={() => editor.chain().focus().undo().run()} title='Undo'><Undo sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().redo().run()} title='Redo'><Redo sx={{ fontSize: 15 }} /></ToolBtn>
                        </ToolGroup>
                        <Sep />

                        <ToolGroup>
                            <ToolBtn active={editor.isActive('bold')}      onClick={() => editor.chain().focus().toggleBold().run()}      title='Bold'>         <FormatBold       sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn active={editor.isActive('italic')}    onClick={() => editor.chain().focus().toggleItalic().run()}    title='Italic'>       <FormatItalic     sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title='Underline'>    <FormatUnderlined sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn active={editor.isActive('strike')}    onClick={() => editor.chain().focus().toggleStrike().run()}    title='Strikethrough'><StrikethroughS  sx={{ fontSize: 15 }} /></ToolBtn>
                        </ToolGroup>
                        <Sep />

                        {/* Text colour */}
                        <ToolGroup>
                            <div style={{ position: 'relative' }} title='Text colour'>
                                <input
                                    ref={colorInputRef}
                                    type='color'
                                    defaultValue='#ededed'
                                    onChange={e => editor.chain().focus().setColor(e.target.value).run()}
                                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                                />
                                <ToolBtn onClick={() => colorInputRef.current?.click()} title='Text colour'>
                                    <TextColorIcon sx={{ fontSize: 15 }} />
                                </ToolBtn>
                            </div>
                            <ToolBtn onClick={() => editor.chain().focus().unsetColor().run()} title='Clear colour'>
                                <span style={{ fontSize: '0.5rem', fontWeight: 800, lineHeight: 1 }}>A/</span>
                            </ToolBtn>
                            <ToolBtn
                                active={editor.isActive('highlight')}
                                onClick={() => editor.chain().focus().toggleHighlight({ color: '#f9a825' }).run()}
                                title='Highlight'
                            >
                                <HighlightIcon sx={{ fontSize: 15 }} />
                            </ToolBtn>
                        </ToolGroup>
                        <Sep />

                        <ToolGroup>
                            <ToolBtn active={editor.isActive({ textAlign: 'left' })}    onClick={() => editor.chain().focus().setTextAlign('left').run()}    title='Align left'>   <FormatAlignLeft    sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn active={editor.isActive({ textAlign: 'center' })}  onClick={() => editor.chain().focus().setTextAlign('center').run()}  title='Align center'> <FormatAlignCenter  sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn active={editor.isActive({ textAlign: 'right' })}   onClick={() => editor.chain().focus().setTextAlign('right').run()}   title='Align right'>  <FormatAlignRight   sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title='Justify'>      <FormatAlignJustify sx={{ fontSize: 15 }} /></ToolBtn>
                        </ToolGroup>
                        <Sep />

                        <ToolGroup>
                            <ToolBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title='Heading 1'><span style={{ fontSize: '0.6rem', fontWeight: 800 }}>H1</span></ToolBtn>
                            <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title='Heading 2'><span style={{ fontSize: '0.6rem', fontWeight: 800 }}>H2</span></ToolBtn>
                            <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title='Heading 3'><span style={{ fontSize: '0.6rem', fontWeight: 800 }}>H3</span></ToolBtn>
                            <ToolBtn active={editor.isActive('heading', { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} title='Heading 4'><span style={{ fontSize: '0.6rem', fontWeight: 800 }}>H4</span></ToolBtn>
                        </ToolGroup>
                        <Sep />

                        <ToolGroup>
                            <ToolBtn active={editor.isActive('bulletList')}  onClick={() => editor.chain().focus().toggleBulletList().run()}  title='Bullet list'>   <FormatListBulleted  sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title='Numbered list'> <FormatListNumbered  sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().liftListItem('listItem').run()}  title='Decrease indent'><span style={{ fontSize: '0.65rem', fontWeight: 800 }}>←</span></ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().sinkListItem('listItem').run()}  title='Increase indent'><span style={{ fontSize: '0.65rem', fontWeight: 800 }}>→</span></ToolBtn>
                        </ToolGroup>
                        <Sep />

                        <ToolGroup>
                            <ToolBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title='Insert table'><TableChart sx={{ fontSize: 15 }} /></ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title='Divider'><HorizontalRule sx={{ fontSize: 15 }} /></ToolBtn>
                        </ToolGroup>

                    </div>

                    {/* ── Table context toolbar ──────────────────────────────── */}
                    {inTable && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '4px 8px', background: 'rgba(219,0,29,0.06)', borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', alignSelf: 'center', marginRight: 4 }}>Table</span>
                            <ToolGroup>
                                <ToolBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title='Add column left'> <ViewColumn sx={{ fontSize: 14 }} /><span style={{ fontSize: '0.5rem', marginLeft: 1 }}>+←</span></ToolBtn>
                                <ToolBtn onClick={() => editor.chain().focus().addColumnAfter().run()}  title='Add column right'><ViewColumn sx={{ fontSize: 14 }} /><span style={{ fontSize: '0.5rem', marginLeft: 1 }}>+→</span></ToolBtn>
                                <ToolBtn onClick={() => editor.chain().focus().deleteColumn().run()}    title='Delete column' danger><ViewColumn sx={{ fontSize: 14 }} /><span style={{ fontSize: '0.5rem', marginLeft: 1 }}>−</span></ToolBtn>
                            </ToolGroup>
                            <Sep />
                            <ToolGroup>
                                <ToolBtn onClick={() => editor.chain().focus().addRowBefore().run()} title='Add row above'><TableRows sx={{ fontSize: 14 }} /><span style={{ fontSize: '0.5rem', marginLeft: 1 }}>+↑</span></ToolBtn>
                                <ToolBtn onClick={() => editor.chain().focus().addRowAfter().run()}  title='Add row below'><TableRows sx={{ fontSize: 14 }} /><span style={{ fontSize: '0.5rem', marginLeft: 1 }}>+↓</span></ToolBtn>
                                <ToolBtn onClick={() => editor.chain().focus().deleteRow().run()}     title='Delete row'   danger><TableRows sx={{ fontSize: 14 }} /><span style={{ fontSize: '0.5rem', marginLeft: 1 }}>−</span></ToolBtn>
                            </ToolGroup>
                            <Sep />
                            <ToolBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()} title='Toggle header row'><span style={{ fontSize: '0.55rem', fontWeight: 700 }}>HDR</span></ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().mergeCells().run()}      title='Merge cells'><span style={{ fontSize: '0.55rem', fontWeight: 700 }}>MRG</span></ToolBtn>
                            <ToolBtn onClick={() => editor.chain().focus().splitCell().run()}       title='Split cell'><span style={{ fontSize: '0.55rem', fontWeight: 700 }}>SPL</span></ToolBtn>
                            <Sep />
                            <ToolBtn onClick={() => editor.chain().focus().deleteTable().run()} title='Delete table' danger><DeleteSweep sx={{ fontSize: 14 }} /></ToolBtn>
                        </div>
                    )}
                </div>
            )}

            <div style={{ minHeight, padding: readOnly ? 0 : '16px 20px', background: readOnly ? 'transparent' : 'rgba(255,255,255,0.015)', overflowX: 'auto' }}>
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}

// ── Toolbar helpers ────────────────────────────────────────────────────────────

function ToolGroup({ children }: { children: React.ReactNode }) {
    return <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>{children}</div>
}

function Sep() {
    return <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 4px', alignSelf: 'stretch' }} />
}

function ToolBtn({ onClick, active, title, danger, children }: {
    onClick: () => void; active?: boolean; title?: string; danger?: boolean; children: React.ReactNode
}) {
    return (
        <button
            type='button'
            title={title}
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                minWidth: 26, height: 26, padding: '0 3px',
                background: active ? 'rgba(219,0,29,0.2)' : 'transparent',
                border: active ? `1px solid ${danger ? 'rgba(219,0,29,0.5)' : 'rgba(219,0,29,0.35)'}` : '1px solid transparent',
                color: active ? 'rgba(219,0,29,0.9)' : danger ? 'rgba(219,0,29,0.5)' : 'rgba(237,237,237,0.55)',
                cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
                if (!active) {
                    e.currentTarget.style.background = danger ? 'rgba(219,0,29,0.1)' : 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.9)'
                }
            }}
            onMouseLeave={e => {
                if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.5)' : 'rgba(237,237,237,0.55)'
                }
            }}
        >
            {children}
        </button>
    )
}

// ── Editor content CSS ─────────────────────────────────────────────────────────

const editorCss = `
.simple-editor-content {
    outline: none; color: rgba(237,237,237,0.85);
    font-size: 0.88rem; line-height: 1.7;
    max-width: 794px; margin: 0 auto;
    position: relative;
}
.simple-editor-content h1 {
    font-size: 1.3rem; font-weight: 800; letter-spacing: 0.04em;
    text-transform: uppercase; color: rgba(237,237,237,0.95);
    margin: 1.8rem 0 0.6rem; padding-bottom: 6px;
    border-bottom: 1px solid rgba(219,0,29,0.25);
}
.simple-editor-content h2 {
    font-size: 1.05rem; font-weight: 700; color: rgba(237,237,237,0.9);
    margin: 1.4rem 0 0.4rem;
}
.simple-editor-content h3 {
    font-size: 0.9rem; font-weight: 700; letter-spacing: 0.05em;
    text-transform: uppercase; color: rgba(219,0,29,0.85);
    margin: 1.1rem 0 0.3rem;
}
.simple-editor-content h4 {
    font-size: 0.85rem; font-weight: 700; color: rgba(237,237,237,0.75);
    margin: 1rem 0 0.3rem;
}
.simple-editor-content p { margin: 0.35rem 0; }
.simple-editor-content ul {
    margin: 0.5rem 0 0.5rem 1.4rem; padding: 0; list-style-type: disc;
}
.simple-editor-content ol {
    margin: 0.5rem 0 0.5rem 1.4rem; padding: 0; list-style-type: decimal;
}
.simple-editor-content li { margin: 0.2rem 0; list-style: inherit; }
.simple-editor-content li > p { display: inline; margin: 0; padding: 0; }
.simple-editor-content strong { font-weight: 700; color: rgba(237,237,237,0.95); }
.simple-editor-content em { font-style: italic; }
.simple-editor-content u { text-decoration: underline; text-underline-offset: 2px; }
.simple-editor-content s { text-decoration: line-through; }
.simple-editor-content mark { background: rgba(249,168,37,0.35); color: inherit; padding: 0 2px; border-radius: 2px; }
.simple-editor-content hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 1.2rem 0; }
.simple-editor-content a { color: rgba(219,0,29,0.8); text-decoration: underline; }
.simple-editor-content img { max-width: 100%; height: auto; display: block; }
.simple-editor-content .ProseMirror-selectednode > div { outline: none; }
.simple-editor-content::after { content: ''; display: table; clear: both; }
.simple-editor-content blockquote {
    border-left: 3px solid rgba(219,0,29,0.4); margin: 0.8rem 0;
    padding: 4px 16px; color: rgba(237,237,237,0.6);
}
.simple-editor-content table {
    border-collapse: collapse; width: 100%; margin: 1rem 0; table-layout: fixed;
}
.simple-editor-content td, .simple-editor-content th {
    border: 1px solid rgba(255,255,255,0.12); padding: 6px 10px;
    font-size: 0.82rem; vertical-align: top; min-width: 60px; position: relative;
}
.simple-editor-content th {
    background: rgba(219,0,29,0.08); font-weight: 700;
    letter-spacing: 0.05em; color: rgba(237,237,237,0.8);
}
.simple-editor-content tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
.simple-editor-content .selectedCell::after {
    content: ''; position: absolute; inset: 0;
    background: rgba(219,0,29,0.12); pointer-events: none;
}
.simple-editor-content .column-resize-handle {
    position: absolute; right: -2px; top: 0; bottom: -2px; width: 4px;
    background: rgba(219,0,29,0.5); pointer-events: none;
}
.simple-editor-content .ProseMirror-selectednode { outline: 2px solid rgba(219,0,29,0.5); }
.simple-editor-content .is-editor-empty:first-child::before {
    content: attr(data-placeholder); color: rgba(237,237,237,0.2);
    pointer-events: none; float: left; height: 0;
}
`
