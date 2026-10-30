'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import {
    FLOWCHART_CSS, FLOW_LIMITS, FLOW_NODE_KINDS, addChild, descendants, flowchartSvg, layoutFlowchart, moveBranch,
    nextNodeId, parseFlowchart, pinPositions, removeNode, reparent, unpinPositions,
    type FlowChart, type FlowLayout, type FlowNodeKind,
} from '@/lib/operations/flowchart'

const field: React.CSSProperties = {
    padding: '5px 8px', background: 'var(--s2, #14161a)', color: 'inherit',
    border: '1px solid var(--line-2, #2a2e36)', borderRadius: 'var(--r, 2px)', fontSize: '0.78rem', fontFamily: 'inherit', minWidth: 0,
}
const smallBtn: React.CSSProperties = {
    padding: '5px 10px', background: 'transparent', color: 'inherit', cursor: 'pointer',
    border: '1px solid var(--line-2, #2a2e36)', borderRadius: 'var(--r, 2px)',
    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
}
const heading: React.CSSProperties = {
    fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.55, margin: '4px 0 0',
}
const popover: React.CSSProperties = {
    position: 'absolute', zIndex: 5, transform: 'translate(-50%, 8px)', display: 'flex', flexDirection: 'column', gap: 6,
    padding: 8, minWidth: 220, background: 'var(--bg, #0e1013)', border: '1px solid var(--line-2, #2a2e36)',
    borderRadius: 'var(--r, 2px)', boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
}

/** Marks the canvas, whose pointer events the editor must leave alone — see `stopFlowchartEvent`. */
const CANVAS_ATTR = 'data-flow-canvas'

/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD = 4

/** Extra height under the chart in the editor, where a bottom box's + overhangs. */
const ADD_ROOM = 16

/**
 * Which events ProseMirror leaves to the flowchart. Everything on the canvas
 * is the chart's — a press there starts a box drag, never a text selection or
 * a drag of the whole block — and so is anything typed into its fields. The
 * block's own drag (its "Flowchart" handle) and clicks elsewhere on it still
 * go to the editor.
 */
export function stopFlowchartEvent({ event }: { event: Event }): boolean {
    const target = event.target as Element | null
    if (!target || event.type.startsWith('drag') || event.type === 'drop') return false
    if (target.closest?.(`[${CANVAS_ATTR}]`)) return true
    return ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

type Drag = { id: string; startX: number; startY: number; dx: number; dy: number; moved: boolean; frame: FlowLayout }
type Open = { kind: 'node'; id: string } | { kind: 'edge'; from: string; to: string } | null

/**
 * A flowchart inside an operation document, as the editor shows it.
 *
 * Built by hand on the chart itself: drag a box to place it (its branch comes
 * with it), drop it on another box to hang it beneath that one, double-click
 * a box to rename it or change its shape, use the + under a selected box to
 * add one beneath it, and the + halfway along an arrow to say what takes you
 * down it. The read view draws the same chart from the same layout
 * (lib/operations/flowchart.ts) — this view lays its handles over that
 * drawing rather than drawing it a second way.
 *
 * Every change writes the whole chart back to the node's one attribute, so it
 * travels through the shared document like any other edit. A drag writes once,
 * when it is let go, not on every frame of the move.
 */
export default function FlowchartNodeView({ node, updateAttributes, editor, selected, deleteNode }: NodeViewProps) {
    const chart = useMemo(() => parseFlowchart(node.attrs.chart), [node.attrs.chart])
    const title: string = node.attrs.title ?? ''
    const editable = editor.isEditable
    const uid = useId()
    const overlay = useRef<SVGSVGElement>(null)

    const [drag, setDrag] = useState<Drag | null>(null)
    const [picked, setPicked] = useState<string | null>(null)
    const [open, setOpen] = useState<Open>(null)

    const write = (next: FlowChart) => updateAttributes({ chart: JSON.stringify(next) })

    // While a box is being dragged it is drawn where it is, inside the frame
    // the drag started in: letting the frame follow it would slide the whole
    // drawing under the pointer.
    const shown = useMemo(
        () => drag?.moved ? moveBranch(pinPositions(chart), drag.id, drag.dx, drag.dy) : chart,
        [chart, drag],
    )
    const layout = useMemo(() => {
        const live = layoutFlowchart(shown)
        if (drag?.moved) return { ...live, minX: drag.frame.minX, minY: drag.frame.minY, width: drag.frame.width, height: drag.frame.height }
        // Room under the bottom row for its + button.
        return editable ? { ...live, height: live.height + ADD_ROOM } : live
    }, [shown, drag, editable])
    const svg = useMemo(() => flowchartSvg(shown, `flow${uid}`, layout), [shown, uid, layout])
    const byId = useMemo(() => new Map(layout.nodes.map(n => [n.id, n])), [layout])

    // A box or arrow that has gone (removed by someone else) closes its editor.
    useEffect(() => {
        if (open?.kind === 'node' && !chart.nodes.some(n => n.id === open.id)) setOpen(null)
        if (open?.kind === 'edge' && !chart.edges.some(e => e.from === open.from && e.to === open.to)) setOpen(null)
        if (picked && !chart.nodes.some(n => n.id === picked)) setPicked(null)
    }, [chart, open, picked])

    /** The pointer, in chart units. */
    const toChart = (e: { clientX: number; clientY: number }) => {
        const ctm = overlay.current?.getScreenCTM()
        if (!ctm) return { x: e.clientX, y: e.clientY }
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
        return { x: p.x, y: p.y }
    }

    // Percent of the drawing, for HTML laid over it (the popovers).
    const pct = (x: number, y: number) => ({
        left: `${((x - layout.minX) / layout.width) * 100}%`,
        top: `${((y - layout.minY) / layout.height) * 100}%`,
    })

    function onBoxDown(e: React.PointerEvent, id: string) {
        if (!editable || e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        const p = toChart(e)
        setDrag({ id, startX: p.x, startY: p.y, dx: 0, dy: 0, moved: false, frame: layout })
    }

    function onMove(e: React.PointerEvent) {
        if (!drag) return
        const p = toChart(e)
        const dx = p.x - drag.startX, dy = p.y - drag.startY
        const moved = drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD
        setDrag({ ...drag, dx, dy, moved })
    }

    function onUp(e: React.PointerEvent) {
        if (!drag) return
        const d = drag
        setDrag(null)
        if (!d.moved) {
            setPicked(d.id)
            return
        }
        // Let go over another box: hang this one beneath it.
        const p = toChart(e)
        const branch = descendants(chart, d.id).add(d.id)
        const target = layout.nodes.find(n => !branch.has(n.id)
            && Math.abs(p.x - n.x) <= n.width / 2 && Math.abs(p.y - n.y) <= n.height / 2)
        const moved = moveBranch(pinPositions(chart), d.id, d.dx, d.dy)
        write(target ? reparent(moved, d.id, target.id) : moved)
        setPicked(d.id)
    }

    function add(parentId: string) {
        if (chart.nodes.length >= FLOW_LIMITS.nodes) return
        const next = addChild(chart, parentId)
        write(next.chart)
        setPicked(next.id)
        setOpen({ kind: 'node', id: next.id })
    }

    function addLoose() {
        if (chart.nodes.length >= FLOW_LIMITS.nodes) return
        const pinned = pinPositions(chart)
        const id = nextNodeId(pinned)
        const x = layout.nodes.length ? layout.minX + layout.width + 70 : 80
        const y = layout.nodes.length ? layout.minY + 40 : 30
        write({ ...pinned, nodes: [...pinned.nodes, { id, label: 'New step', kind: 'step', x, y }] })
        setPicked(id)
        setOpen({ kind: 'node', id })
    }

    const setNode = (id: string, patch: { label?: string; kind?: FlowNodeKind }) =>
        write({ ...chart, nodes: chart.nodes.map(n => n.id === id ? { ...n, ...patch } : n) })
    const setEdge = (from: string, to: string, label: string) =>
        write({ ...chart, edges: chart.edges.map(e => e.from === from && e.to === to ? { ...e, label } : e) })

    const openNode = open?.kind === 'node' ? byId.get(open.id) : undefined
    const openEdge = open?.kind === 'edge' ? layout.edges.find(e => e.from === open.from && e.to === open.to) : undefined
    const pickedNode = picked && !drag?.moved ? byId.get(picked) : undefined
    const closeOnEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Escape') setOpen(null) }

    return (
        <NodeViewWrapper
            className='op-flowchart'
            style={{
                margin: '1em 0', padding: '12px 14px', borderRadius: 'var(--r, 2px)',
                border: `1px solid ${selected ? 'var(--acc, #db001d)' : 'var(--line-2, #2a2e36)'}`,
                background: 'rgba(255,255,255,0.015)',
                ['--flow-acc' as string]: 'var(--acc, #db001d)',
            }}
        >
            {/* Visible overflow: mid-drag, a box can leave the frame it started in. */}
            <style>{`${FLOWCHART_CSS}\n.op-flowchart .flow-svg { overflow: visible; }`}</style>

            <div contentEditable={false} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                {/* The only part that drags the block: a drag that started on
                    the canvas moves a box, not the whole chart. */}
                <span data-drag-handle style={{ ...heading, margin: 0, cursor: editable ? 'grab' : 'default' }}>Flowchart</span>
                {editable ? (
                    <input
                        style={{ ...field, flex: '1 1 160px' }}
                        placeholder='Title, such as OBJ Anvil'
                        maxLength={FLOW_LIMITS.title}
                        value={title}
                        onChange={e => updateAttributes({ title: e.target.value })}
                    />
                ) : (
                    <strong style={{ flex: 1, fontSize: '0.85rem' }}>{title}</strong>
                )}
                {editable && (
                    <>
                        <button type='button' style={smallBtn} disabled={chart.nodes.length >= FLOW_LIMITS.nodes} onClick={addLoose}>Add box</button>
                        <button type='button' style={smallBtn} title='Forget where boxes were dragged and lay the chart out automatically'
                            onClick={() => { if (confirm('Put every box back in the automatic layout?')) write(unpinPositions(chart)) }}>
                            Tidy
                        </button>
                        <button type='button' style={{ ...smallBtn, color: '#ff8a80' }} onClick={() => { if (confirm('Remove this flowchart?')) deleteNode() }}>Remove</button>
                    </>
                )}
            </div>

            {!svg && <p contentEditable={false} style={{ opacity: 0.5, fontSize: '0.8rem', margin: 0 }}>No boxes yet. Add one above.</p>}

            {svg && (
                <div contentEditable={false} style={{ overflowX: 'auto', paddingBottom: open ? 120 : 0 }}>
                    {/* An open editor gets room below, or the scroll box would clip it.
                        The chart sizes itself; the handles sit over it in the same frame. */}
                    <div style={{ position: 'relative', width: 'max-content', maxWidth: '100%', margin: '0 auto' }}>
                        <div dangerouslySetInnerHTML={{ __html: svg }} />
                        {editable && (
                            <svg
                                ref={overlay}
                                {...{ [CANVAS_ATTR]: '' }}
                                viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', touchAction: 'none' }}
                                onPointerMove={onMove}
                                onPointerUp={onUp}
                                onPointerCancel={() => setDrag(null)}
                                onPointerDown={e => { if (e.target === e.currentTarget) { setPicked(null); setOpen(null) } }}
                            >
                                {layout.nodes.map(n => (
                                    <rect
                                        key={n.id}
                                        x={n.x - n.width / 2} y={n.y - n.height / 2} width={n.width} height={n.height} rx={4}
                                        fill='transparent'
                                        stroke={n.id === picked ? 'var(--acc, #db001d)' : 'none'}
                                        strokeWidth={2} strokeDasharray='4 3'
                                        style={{ cursor: drag?.id === n.id && drag.moved ? 'grabbing' : 'grab' }}
                                        onPointerDown={e => onBoxDown(e, n.id)}
                                        onDoubleClick={e => { e.stopPropagation(); setPicked(n.id); setOpen({ kind: 'node', id: n.id }) }}
                                    >
                                        <title>Drag to move · drop on a box to hang it beneath · double-click to edit</title>
                                    </rect>
                                ))}

                                {!drag?.moved && layout.edges.map(edge => {
                                    if (!edge.labelAt) return null
                                    const openThis = () => setOpen({ kind: 'edge', from: edge.from, to: edge.to })
                                    if (edge.label) {
                                        const w = edge.label.length * 6.4 + 10
                                        return (
                                            <rect key={`${edge.from}>${edge.to}`} x={edge.labelAt.x - w / 2} y={edge.labelAt.y - 9} width={w} height={18}
                                                fill='transparent' style={{ cursor: 'pointer' }} onClick={openThis}>
                                                <title>Edit this arrow</title>
                                            </rect>
                                        )
                                    }
                                    return (
                                        <g key={`${edge.from}>${edge.to}`} style={{ cursor: 'pointer' }} onClick={openThis}>
                                            <title>Label this arrow</title>
                                            <circle cx={edge.labelAt.x} cy={edge.labelAt.y} r={8} fill='var(--bg, #0e1013)' stroke='var(--acc, #db001d)' strokeOpacity={0.7} />
                                            <path d={`M${edge.labelAt.x - 4} ${edge.labelAt.y}h8M${edge.labelAt.x} ${edge.labelAt.y - 4}v8`} stroke='var(--acc, #db001d)' strokeWidth={1.5} />
                                        </g>
                                    )
                                })}

                                {pickedNode && chart.nodes.length < FLOW_LIMITS.nodes && (() => {
                                    // On the corner, clear of the arrows that leave from the middle.
                                    const cx = pickedNode.x + pickedNode.width / 2, cy = pickedNode.y + pickedNode.height / 2
                                    return (
                                        <g style={{ cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={() => add(pickedNode.id)}>
                                            <title>Add a box beneath</title>
                                            <circle cx={cx} cy={cy} r={10} fill='var(--acc, #db001d)' />
                                            <path d={`M${cx - 5} ${cy}h10M${cx} ${cy - 5}v10`} stroke='#fff' strokeWidth={2} />
                                        </g>
                                    )
                                })()}
                            </svg>
                        )}

                        {editable && openNode && (
                            <div style={{ ...popover, ...pct(openNode.x, openNode.y + openNode.height / 2) }} onPointerDown={e => e.stopPropagation()}>
                                <input
                                    autoFocus
                                    onFocus={e => e.target.select()}
                                    style={field}
                                    aria-label='Box text'
                                    placeholder='What happens here'
                                    maxLength={FLOW_LIMITS.label}
                                    value={chart.nodes.find(n => n.id === openNode.id)?.label ?? ''}
                                    onChange={e => setNode(openNode.id, { label: e.target.value })}
                                    onKeyDown={closeOnEnter}
                                />
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {FLOW_NODE_KINDS.map(k => (
                                        <button key={k.value} type='button'
                                            style={{ ...smallBtn, padding: '4px 8px', ...(openNode.kind === k.value ? { borderColor: 'var(--acc, #db001d)', color: 'var(--acc, #db001d)' } : {}) }}
                                            onClick={() => setNode(openNode.id, { kind: k.value })}>
                                            {k.label}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                                    <button type='button' style={{ ...smallBtn, color: '#ff8a80' }}
                                        onClick={() => { write(removeNode(chart, openNode.id)); setOpen(null) }}>Delete box</button>
                                    <button type='button' style={smallBtn} onClick={() => setOpen(null)}>Done</button>
                                </div>
                            </div>
                        )}

                        {editable && openEdge && openEdge.labelAt && (
                            <div style={{ ...popover, ...pct(openEdge.labelAt.x, openEdge.labelAt.y) }} onPointerDown={e => e.stopPropagation()}>
                                <input
                                    autoFocus
                                    onFocus={e => e.target.select()}
                                    style={field}
                                    aria-label='Arrow label'
                                    placeholder='When, such as Yes or No'
                                    maxLength={FLOW_LIMITS.edgeLabel}
                                    value={chart.edges.find(e => e.from === openEdge.from && e.to === openEdge.to)?.label ?? ''}
                                    onChange={e => setEdge(openEdge.from, openEdge.to, e.target.value)}
                                    onKeyDown={closeOnEnter}
                                />
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                                    <button type='button' style={{ ...smallBtn, color: '#ff8a80' }}
                                        onClick={() => { write({ ...chart, edges: chart.edges.filter(e => !(e.from === openEdge.from && e.to === openEdge.to)) }); setOpen(null) }}>
                                        Delete arrow
                                    </button>
                                    <button type='button' style={smallBtn} onClick={() => setOpen(null)}>Done</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {editable && svg && (
                <p contentEditable={false} style={{ ...heading, textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: '0.7rem', marginTop: 8 }}>
                    Drag boxes to arrange them; a box&apos;s branch moves with it. Drop a box on another to hang it beneath. Double-click a box to edit it, click + to add beneath, and + on an arrow to label it.
                </p>
            )}
        </NodeViewWrapper>
    )
}
