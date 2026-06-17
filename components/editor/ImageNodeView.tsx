'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/core'
import { useRef, useState } from 'react'
import {
    FormatAlignLeft, FormatAlignCenter, FormatAlignRight,
    CropFree, RestartAlt, Close as CloseIcon,
    WrapText, DragIndicator, OpenWith,
} from '@mui/icons-material'

const RED = '#db001d'

type CropVals = [number, number, number, number]  // top right bottom left

function parseCrop(s: string | null | undefined): CropVals {
    if (!s) return [0, 0, 0, 0]
    const m = s.match(/inset\(([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/)
    return m ? [+m[1], +m[2], +m[3], +m[4]] : [0, 0, 0, 0]
}

export default function ImageNodeView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
    const { src, alt }         = node.attrs
    const width: number | null = node.attrs.width         ?? null
    const align: string | null = node.attrs['data-align'] ?? null
    const crop:  string | null = node.attrs['data-crop']  ?? null
    const posX:  number        = node.attrs['data-pos-x'] ?? 20
    const posY:  number        = node.attrs['data-pos-y'] ?? 20

    const [showCrop, setShowCrop] = useState(false)
    const [hovered,  setHovered]  = useState(false)
    const imgRef                  = useRef<HTMLImageElement>(null)
    const cropVals                = parseCrop(crop)

    const isFree     = align === 'free'
    const isWrapLeft = align === 'wrap-left'
    const isWrapRight= align === 'wrap-right'
    const isWrapped  = isWrapLeft || isWrapRight
    const showHandle = selected || hovered

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

        // stopPropagation prevents TipTap selecting the node, so do it manually
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
                    {/* Position */}
                    <ImgBtn active={!align || align === 'left'} title='Align left'    onClick={() => updateAttributes({ 'data-align': null })}><FormatAlignLeft   sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={align === 'center'}         title='Align center'  onClick={() => updateAttributes({ 'data-align': 'center' })}><FormatAlignCenter sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={align === 'right'}          title='Align right'   onClick={() => updateAttributes({ 'data-align': 'right' })}><FormatAlignRight  sx={{ fontSize: 13 }} /></ImgBtn>
                    <Sep />
                    {/* Wrap */}
                    <ImgBtn active={isWrapLeft}  title='Wrap — float left'  onClick={() => updateAttributes({ 'data-align': isWrapLeft  ? null : 'wrap-left' })}><WrapText sx={{ fontSize: 13 }} /></ImgBtn>
                    <ImgBtn active={isWrapRight} title='Wrap — float right' onClick={() => updateAttributes({ 'data-align': isWrapRight ? null : 'wrap-right' })}><WrapText sx={{ fontSize: 13, transform: 'scaleX(-1)' }} /></ImgBtn>
                    <Sep />
                    {/* Free position */}
                    <ImgBtn active={isFree} title={isFree ? 'Exit free position' : 'Free position — drag anywhere'}
                        onClick={() => isFree ? updateAttributes({ 'data-align': null, 'data-pos-x': null, 'data-pos-y': null }) : enableFreePosition()}>
                        <OpenWith sx={{ fontSize: 13 }} />
                    </ImgBtn>
                    <Sep />
                    {/* Utility */}
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
                        // In free mode, the whole image is the drag target
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

                    {/* Resize handle */}
                    {selected && (
                        <div
                            onMouseDown={handleResizeMouseDown}
                            title='Drag to resize'
                            style={{
                                position: 'absolute', bottom: -5, right: -5,
                                width: 13, height: 13,
                                background: RED, border: '2px solid #0e0e0e',
                                borderRadius: '0 0 2px 0', cursor: 'nwse-resize', zIndex: 10,
                            }}
                        />
                    )}

                    {/* Drag-to-reorder handle (hidden in free mode — repositioned by dragging the image itself) */}
                    {showHandle && !isFree && (
                        <div
                            data-drag-handle
                            title='Drag to reorder in document'
                            style={{
                                position: 'absolute', top: 0, left: 0,
                                padding: '3px 4px',
                                background: 'rgba(0,0,0,0.55)',
                                cursor: 'grab', color: 'rgba(237,237,237,0.75)',
                                display: 'flex', alignItems: 'center', zIndex: 20,
                            }}
                        >
                            <DragIndicator style={{ fontSize: 14 }} />
                        </div>
                    )}

                    {/* Mode badge */}
                    {(isWrapped || isFree) && (
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0,
                            fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em',
                            padding: '2px 5px', background: 'rgba(219,0,29,0.7)',
                            color: '#fff', textTransform: 'uppercase', pointerEvents: 'none',
                        }}>
                            {isFree ? 'free' : isWrapLeft ? '← wrap' : 'wrap →'}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Crop panel ───────────────────────────────────────────── */}
            {selected && showCrop && (
                <div style={{
                    marginTop: 8,
                    display: 'inline-flex', flexDirection: 'column', gap: 8,
                    background: '#111', border: '1px solid rgba(255,255,255,0.1)',
                    padding: '10px 14px', minWidth: 240,
                }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                        Crop (inset from edge)
                    </span>
                    {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side, i) => (
                        <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', width: 36, flexShrink: 0 }}>{side}</span>
                            <input
                                type='range' min={0} max={50} step={1}
                                value={cropVals[i]}
                                onChange={e => {
                                    const next = [...cropVals] as CropVals
                                    next[i] = Number(e.target.value)
                                    applyCrop(next)
                                }}
                                style={{ flex: 1, accentColor: RED, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.65)', width: 30, textAlign: 'right', flexShrink: 0 }}>
                                {cropVals[i]}%
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </NodeViewWrapper>
    )
}

// ── Mini toolbar helpers ───────────────────────────────────────────────────────

function ImgBtn({ onClick, active, title, danger, children }: {
    onClick: () => void; active?: boolean; title?: string; danger?: boolean; children: React.ReactNode
}) {
    return (
        <button
            type='button' title={title}
            onMouseDown={e => e.preventDefault()}
            onClick={e => { e.stopPropagation(); onClick() }}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, padding: 0, cursor: 'pointer',
                background: active ? 'rgba(219,0,29,0.2)' : 'transparent',
                border:  active ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent',
                color: active ? 'rgba(219,0,29,0.85)' : danger ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.5)',
                transition: 'all 0.1s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.9)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.5)' }}
        >
            {children}
        </button>
    )
}

function Sep() {
    return <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 3px', alignSelf: 'stretch' }} />
}
