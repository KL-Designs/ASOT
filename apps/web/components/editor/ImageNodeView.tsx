'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/core'
import { useRef, useState, useEffect } from 'react'
import {
    FormatAlignLeft, FormatAlignCenter, FormatAlignRight,
    CropFree, RestartAlt, Close as CloseIcon,
    WrapText, DragIndicator, OpenWith,
    FormatBold, FormatItalic, FormatUnderlined, FormatClear,
} from '@mui/icons-material'

const RED = '#db001d'

type CropVals = [number, number, number, number]  // top right bottom left

function parseCrop(s: string | null | undefined): CropVals {
    if (!s) return [0, 0, 0, 0]
    const m = s.match(/inset\(([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/)
    return m ? [+m[1], +m[2], +m[3], +m[4]] : [0, 0, 0, 0]
}

const CAPTION_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24]

export default function ImageNodeView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
    const { src, alt }              = node.attrs
    const width: number | null      = node.attrs.width            ?? null
    const align: string | null      = node.attrs['data-align']    ?? null
    const crop:  string | null      = node.attrs['data-crop']     ?? null
    const posX:  number             = node.attrs['data-pos-x']    ?? 20
    const posY:  number             = node.attrs['data-pos-y']    ?? 20
    const caption: string           = node.attrs.caption          ?? ''
    const captionPosition: string   = node.attrs.captionPosition  ?? 'below'
    const captionAlign: string      = node.attrs.captionAlign     ?? 'center'

    const [showCrop,       setShowCrop]       = useState(false)
    const [hovered,        setHovered]        = useState(false)
    const [captionFocused, setCaptionFocused] = useState(false)
    const imgRef     = useRef<HTMLImageElement>(null)
    const captionRef = useRef<HTMLDivElement>(null)
    const cropVals   = parseCrop(crop)

    const isFree     = align === 'free'
    const isWrapLeft = align === 'wrap-left'
    const isWrapRight= align === 'wrap-right'
    const isWrapped  = isWrapLeft || isWrapRight
    const showHandle = selected || hovered

    // Caption area is visible when image is hovered/selected, focused, or has content
    const captionVisible = !!caption || captionFocused || selected || hovered

    // Sync caption HTML into contenteditable when changed externally (not while typing)
    useEffect(() => {
        if (captionRef.current && !captionFocused) {
            if (captionRef.current.innerHTML !== caption) {
                captionRef.current.innerHTML = caption
            }
        }
    }, [caption, captionFocused])

    // ── Caption formatting ────────────────────────────────────────────────
    function execCaption(cmd: string, val?: string) {
        captionRef.current?.focus()
        document.execCommand('styleWithCSS', false, 'true')
        document.execCommand(cmd, false, val)
        updateAttributes({ caption: captionRef.current?.innerHTML || '' })
    }

    function setCaptionFontSize(px: number) {
        captionRef.current?.focus()
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
        const range = sel.getRangeAt(0)
        const selectedText = range.toString()
        if (!selectedText) return
        document.execCommand('insertHTML', false, `<span style="font-size:${px}px">${selectedText}</span>`)
        updateAttributes({ caption: captionRef.current?.innerHTML || '' })
    }

    function onCaptionBlur() {
        setCaptionFocused(false)
        const html = captionRef.current?.innerHTML || ''
        const isEmpty = !html || html === '<br>' || html.replace(/<[^>]*>/g, '').trim() === ''
        updateAttributes({ caption: isEmpty ? '' : html })
        if (isEmpty && captionRef.current) captionRef.current.innerHTML = ''
    }

    // ── Crop helpers ─────────────────────────────────────────────────────
    function applyCrop(vals: CropVals) {
        const [t, r, b, l] = vals
        updateAttributes({ 'data-crop': (t || r || b || l) ? `inset(${t}% ${r}% ${b}% ${l}%)` : null })
    }

    // ── Resize (bottom-right drag) ────────────────────────────────────────
    function handleResizeMouseDown(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.clientX
        const startW = imgRef.current?.offsetWidth ?? width ?? 300
        const onMove = (ev: MouseEvent) => updateAttributes({ width: Math.max(40, Math.round(startW + ev.clientX - startX)) })
        const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    // ── Free-position drag ────────────────────────────────────────────────
    function handleFreePositionDrag(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos !== undefined) editor.commands.setNodeSelection(pos)
        const editorEl = imgRef.current?.closest('.simple-editor-content') as HTMLElement | null
        if (!editorEl) return
        const imgEl   = imgRef.current!
        const imgRect = imgEl.getBoundingClientRect()
        const offX    = e.clientX - imgRect.left
        const offY    = e.clientY - imgRect.top
        const onMove = (ev: MouseEvent) => {
            const r = editorEl.getBoundingClientRect()
            updateAttributes({
                'data-pos-x': Math.max(0, Math.round(ev.clientX - r.left - offX)),
                'data-pos-y': Math.max(0, Math.round(ev.clientY - r.top  - offY)),
            })
        }
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    // ── Enable free position (snap to current visual position) ───────────
    function enableFreePosition() {
        const editorEl = imgRef.current?.closest('.simple-editor-content') as HTMLElement | null
        const imgEl    = imgRef.current
        if (editorEl && imgEl) {
            const er = editorEl.getBoundingClientRect()
            const ir = imgEl.getBoundingClientRect()
            updateAttributes({
                'data-align': 'free',
                'data-pos-x': Math.max(0, Math.round(ir.left - er.left)),
                'data-pos-y': Math.max(0, Math.round(ir.top  - er.top)),
            })
        } else {
            updateAttributes({ 'data-align': 'free' })
        }
    }

    // ── Wrapper style ────────────────────────────────────────────────────
    const wrapperStyle: React.CSSProperties = isFree
        ? { position: 'absolute', left: posX, top: posY, zIndex: 5, margin: 0, userSelect: 'none', cursor: 'move' }
        : {
            display: 'block', position: 'relative', userSelect: 'none',
            ...(isWrapLeft  ? { float: 'left',  margin: '4px 18px 10px 0' } : {}),
            ...(isWrapRight ? { float: 'right', margin: '4px 0 10px 18px' } : {}),
            ...(!isWrapped && !isFree ? { margin: '0.6rem 0' } : {}),
        }

    // ── Toolbar anchor position ──────────────────────────────────────────
    const toolbarLeft  = (isWrapRight || align === 'right') ? 'auto'      : align === 'center' ? '50%' : 0
    const toolbarRight = (isWrapRight || align === 'right') ? 0           : 'auto'
    const toolbarTX    = align === 'center' && !isFree ? 'translateX(-50%)' : undefined

    // ── Caption block (always rendered) ──────────────────────────────────
    const captionArea = (
        <div
            style={{
                position: 'relative',
                marginTop: captionPosition !== 'above' ? 2 : 0,
                marginBottom: captionPosition === 'above' ? 2 : 0,
            }}
        >
            {/* Mini formatting toolbar — only when focused */}
            {captionFocused && (
                <div
                    onMouseDown={e => e.preventDefault()}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                        marginBottom: 4, padding: '3px 4px',
                        background: '#111', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 4,
                    }}
                >
                    <ImgBtn title='Bold'      onClick={() => execCaption('bold')}><FormatBold      sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn title='Italic'    onClick={() => execCaption('italic')}><FormatItalic    sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn title='Underline' onClick={() => execCaption('underline')}><FormatUnderlined sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn title='Clear formatting' onClick={() => execCaption('removeFormat')}><FormatClear sx={{ fontSize: 13 }} /></ImgBtn>
                    <Sep />
                    <ImgBtn active={captionAlign === 'left'}   title='Align left'   onClick={() => updateAttributes({ captionAlign: 'left' })}><FormatAlignLeft   sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={captionAlign === 'center'} title='Align center' onClick={() => updateAttributes({ captionAlign: 'center' })}><FormatAlignCenter sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={captionAlign === 'right'}  title='Align right'  onClick={() => updateAttributes({ captionAlign: 'right' })}><FormatAlignRight  sx={{ fontSize: 13 }} /></ImgBtn>
                    <Sep />
                    <button type='button' title={captionPosition === 'above' ? 'Move below image' : 'Move above image'}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => updateAttributes({ captionPosition: captionPosition === 'above' ? 'below' : 'above' })}
                        style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}
                    >{captionPosition === 'above' ? '▼ Below' : '▲ Above'}</button>
                    <Sep />
                    <select onMouseDown={e => e.stopPropagation()}
                        onChange={e => { const v = Number(e.target.value); if (v) setCaptionFontSize(v) }}
                        defaultValue=''
                        style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.55)', fontSize: 10, padding: '2px 3px', cursor: 'pointer', borderRadius: 3 }}
                    >
                        <option value=''>Size</option>
                        {CAPTION_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            )}

            {/* Contenteditable caption + React-rendered placeholder overlay */}
            <div style={{ position: 'relative' }}>
                <div
                    ref={captionRef}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => setCaptionFocused(true)}
                    onBlur={onCaptionBlur}
                    onInput={() => updateAttributes({ caption: captionRef.current?.innerHTML || '' })}
                    onMouseDown={e => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === 'Escape') captionRef.current?.blur() }}
                    style={{
                        outline: 'none',
                        minHeight: '1.2em',
                        textAlign: captionAlign as 'left' | 'center' | 'right',
                        color: 'rgba(237,237,237,0.85)',
                        fontSize: '0.75rem',
                        fontStyle: 'italic',
                        letterSpacing: '0.02em',
                        lineHeight: 1.5,
                        borderBottom: captionFocused
                            ? '1px solid rgba(255,255,255,0.14)'
                            : (selected || hovered) && !caption
                                ? '1px dashed rgba(255,255,255,0.08)'
                                : '1px solid transparent',
                        padding: '2px 0',
                        cursor: 'text',
                        wordBreak: 'break-word',
                        position: 'relative', zIndex: 1,
                    }}
                />
                {!caption && !captionFocused && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        pointerEvents: 'none', zIndex: 0,
                        textAlign: captionAlign as 'left' | 'center' | 'right',
                        color: 'rgba(237,237,237,0.85)',
                        fontSize: '0.75rem',
                        fontStyle: 'italic',
                        letterSpacing: '0.02em',
                        lineHeight: 1.5,
                        padding: '2px 0',
                    }}>
                        Add a caption…
                    </div>
                )}
            </div>
        </div>
    )

    return (
        <NodeViewWrapper
            style={wrapperStyle}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* ── Floating toolbar ─────────────────────────────────────── */}
            {selected && (
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: toolbarLeft, right: toolbarRight,
                    transform: toolbarTX,
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.14)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                    padding: '3px 5px', zIndex: 60, whiteSpace: 'nowrap',
                }}>
                    <ImgBtn active={!align || align === 'left'} title='Align left'    onClick={() => updateAttributes({ 'data-align': null })}><FormatAlignLeft   sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={align === 'center'}         title='Align center'  onClick={() => updateAttributes({ 'data-align': 'center' })}><FormatAlignCenter sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={align === 'right'}          title='Align right'   onClick={() => updateAttributes({ 'data-align': 'right' })}><FormatAlignRight  sx={{ fontSize: 13 }} /></ImgBtn>
                    <Sep />
                    <ImgBtn active={isWrapLeft}  title='Wrap — float left'  onClick={() => updateAttributes({ 'data-align': isWrapLeft  ? null : 'wrap-left' })}><WrapText sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={isWrapRight} title='Wrap — float right' onClick={() => updateAttributes({ 'data-align': isWrapRight ? null : 'wrap-right' })}><WrapText sx={{ fontSize: 13, transform: 'scaleX(-1)' }} /></ImgBtn>
                    <Sep />
                    <ImgBtn active={isFree} title={isFree ? 'Exit free position' : 'Free position — drag anywhere'}
                        onClick={() => isFree ? updateAttributes({ 'data-align': null, 'data-pos-x': null, 'data-pos-y': null }) : enableFreePosition()}>
                        <OpenWith sx={{ fontSize: 13 }} />
                    </ImgBtn>
                    <Sep />
                    <ImgBtn title='Reset size' onClick={() => updateAttributes({ width: null })}><RestartAlt sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={showCrop} title={showCrop ? 'Hide crop' : 'Crop'} onClick={() => setShowCrop(v => !v)}><CropFree sx={{ fontSize: 13 }} /></ImgBtn>
                    {crop && (
                        <ImgBtn danger title='Clear crop' onClick={() => { updateAttributes({ 'data-crop': null }); setShowCrop(false) }}>
                            <CloseIcon sx={{ fontSize: 13 }} />
                        </ImgBtn>
                    )}
                    <Sep />
                    <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)', padding: '0 4px' }}>
                        {width ? `${width}px` : 'auto'}
                    </span>
                </div>
            )}

            {/* ── Caption above ────────────────────────────────────────── */}
            {captionPosition === 'above' && captionArea}

            {/* ── Image ────────────────────────────────────────────────── */}
            <div style={isFree ? {} : {
                display: 'flex',
                justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
            }}>
                <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                    <img
                        ref={imgRef}
                        src={src} alt={alt || ''}
                        draggable={false}
                        onMouseDown={isFree ? handleFreePositionDrag : undefined}
                        style={{
                            display: 'block',
                            width:  width ? `${width}px` : undefined,
                            maxWidth: '100%', height: 'auto',
                            clipPath: crop ?? undefined,
                            outline: selected ? `2px solid ${RED}` : undefined,
                            outlineOffset: '1px',
                            cursor: isFree ? 'move' : undefined,
                        }}
                    />
                    {selected && (
                        <div onMouseDown={handleResizeMouseDown} title='Drag to resize'
                            style={{ position: 'absolute', bottom: -5, right: -5, width: 13, height: 13, background: RED, border: '2px solid #0e0e0e', borderRadius: '0 0 2px 0', cursor: 'nwse-resize', zIndex: 10 }}
                        />
                    )}
                    {showHandle && !isFree && (
                        <div data-drag-handle title='Drag to reorder in document'
                            style={{ position: 'absolute', top: 0, left: 0, padding: '3px 4px', background: 'rgba(0,0,0,0.55)', cursor: 'grab', color: 'rgba(237,237,237,0.75)', display: 'flex', alignItems: 'center', zIndex: 20 }}
                        >
                            <DragIndicator style={{ fontSize: 14 }} />
                        </div>
                    )}
                    {(isWrapped || isFree) && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 5px', background: 'rgba(219,0,29,0.7)', color: '#fff', textTransform: 'uppercase', pointerEvents: 'none' }}>
                            {isFree ? 'free' : isWrapLeft ? '← wrap' : 'wrap →'}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Caption below ────────────────────────────────────────── */}
            {captionPosition !== 'above' && captionArea}

            {/* ── Crop panel ───────────────────────────────────────────── */}
            {selected && showCrop && (
                <div style={{ marginTop: 8, display: 'inline-flex', flexDirection: 'column', gap: 8, background: '#111', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', minWidth: 240 }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Crop (inset from edge)</span>
                    {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side, i) => (
                        <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', width: 36, flexShrink: 0 }}>{side}</span>
                            <input type='range' min={0} max={50} step={1} value={cropVals[i]}
                                onChange={e => { const next = [...cropVals] as CropVals; next[i] = Number(e.target.value); applyCrop(next) }}
                                style={{ flex: 1, accentColor: RED, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.65)', width: 30, textAlign: 'right', flexShrink: 0 }}>{cropVals[i]}%</span>
                        </div>
                    ))}
                </div>
            )}
        </NodeViewWrapper>
    )
}

function ImgBtn({ onClick, active, title, danger, children }: {
    onClick: () => void; active?: boolean; title?: string; danger?: boolean; children: React.ReactNode
}) {
    return (
        <button type='button' title={title} onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); onClick() }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, padding: 0, cursor: 'pointer', background: active ? 'rgba(219,0,29,0.2)' : 'transparent', border: active ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent', color: active ? 'rgba(219,0,29,0.85)' : danger ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.5)', transition: 'all 0.1s' }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.9)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.5)' }}
        >{children}</button>
    )
}

function Sep() {
    return <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 3px', alignSelf: 'stretch' }} />
}
