'use client'

import React, { useId, useMemo, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import {
    FLOWCHART_CSS, FLOW_LIMITS, FLOW_NODE_KINDS, flowchartSvg, nextNodeId, parseFlowchart, removeNode,
    type FlowChart, type FlowNodeKind,
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

/**
 * A flowchart inside an operation document, as the editor shows it.
 *
 * The chart is always drawn; the form to change it opens underneath. There is
 * nothing to drag: a box is a label and a kind, an arrow is a from and a to,
 * and the layout is worked out from those (lib/operations/flowchart.ts). That
 * is deliberate — a canvas three mission makers can drag at once over a
 * collaborative document is a far bigger thing than what is being asked for,
 * which is "show how this objective can go".
 *
 * Every change writes the whole chart back to the node's one attribute, so it
 * travels through the shared document like any other edit.
 */
export default function FlowchartNodeView({ node, updateAttributes, editor, selected, deleteNode }: NodeViewProps) {
    const chart = useMemo(() => parseFlowchart(node.attrs.chart), [node.attrs.chart])
    const title: string = node.attrs.title ?? ''
    const editable = editor.isEditable
    const [open, setOpen] = useState(false)
    const uid = useId()

    const write = (next: FlowChart) => updateAttributes({ chart: JSON.stringify(next) })
    const svg = useMemo(() => flowchartSvg(chart, `flow${uid}`), [chart, uid])
    const label = (id: string) => chart.nodes.find(n => n.id === id)?.label || id

    // The first pair of boxes with no arrow between them yet, for "Add an arrow".
    const freePair = (): [string, string] | null => {
        for (const a of chart.nodes) {
            for (const b of chart.nodes) {
                if (a.id !== b.id && !chart.edges.some(e => e.from === a.id && e.to === b.id)) return [a.id, b.id]
            }
        }
        return null
    }

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
            <style>{FLOWCHART_CSS}</style>

            <div contentEditable={false} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {/* The only part that drags the block: a drag that started
                    on the form would fight every text field in it. */}
                <span data-drag-handle style={{ ...heading, margin: 0, cursor: editable ? 'grab' : 'default' }}>Flowchart</span>
                {editable && open ? (
                    <input
                        style={{ ...field, flex: 1 }}
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
                        <button type='button' style={smallBtn} onClick={() => setOpen(v => !v)}>{open ? 'Done' : 'Edit'}</button>
                        {open && <button type='button' style={{ ...smallBtn, color: '#ff8a80' }} onClick={() => deleteNode()}>Remove</button>}
                    </>
                )}
            </div>

            {svg
                ? <div contentEditable={false} style={{ overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} />
                : <p contentEditable={false} style={{ opacity: 0.5, fontSize: '0.8rem', margin: 0 }}>No boxes yet.</p>}

            {editable && open && (
                <div contentEditable={false} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                    <p style={heading}>Boxes</p>
                    {chart.nodes.map(n => (
                        <div key={n.id} style={{ display: 'flex', gap: 6 }}>
                            <input
                                style={{ ...field, flex: 1 }}
                                aria-label='Box text'
                                placeholder='What happens here'
                                maxLength={FLOW_LIMITS.label}
                                value={n.label}
                                onChange={e => write({
                                    ...chart,
                                    nodes: chart.nodes.map(x => x.id === n.id ? { ...x, label: e.target.value } : x),
                                })}
                            />
                            <select
                                style={field}
                                aria-label='Box type'
                                value={n.kind}
                                onChange={e => write({
                                    ...chart,
                                    nodes: chart.nodes.map(x => x.id === n.id ? { ...x, kind: e.target.value as FlowNodeKind } : x),
                                })}
                            >
                                {FLOW_NODE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                            </select>
                            <button type='button' style={smallBtn} aria-label={`Delete box ${n.label}`} onClick={() => write(removeNode(chart, n.id))}>✕</button>
                        </div>
                    ))}
                    <div>
                        <button
                            type='button'
                            style={smallBtn}
                            disabled={chart.nodes.length >= FLOW_LIMITS.nodes}
                            onClick={() => write({ ...chart, nodes: [...chart.nodes, { id: nextNodeId(chart), label: 'New step', kind: 'step' }] })}
                        >
                            Add a box
                        </button>
                    </div>

                    <p style={heading}>Arrows</p>
                    {chart.edges.map((edge, i) => {
                        const set = (patch: Partial<FlowChart['edges'][number]>) =>
                            write({ ...chart, edges: chart.edges.map((x, j) => j === i ? { ...x, ...patch } : x) })
                        return (
                            <div key={`${edge.from}>${edge.to}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <select style={{ ...field, flex: 1 }} aria-label='Arrow from' value={edge.from} onChange={e => set({ from: e.target.value })}>
                                    {chart.nodes.map(n => <option key={n.id} value={n.id}>{label(n.id)}</option>)}
                                </select>
                                <span aria-hidden='true' style={{ opacity: 0.5 }}>to</span>
                                <select style={{ ...field, flex: 1 }} aria-label='Arrow to' value={edge.to} onChange={e => set({ to: e.target.value })}>
                                    {chart.nodes.map(n => <option key={n.id} value={n.id}>{label(n.id)}</option>)}
                                </select>
                                <input
                                    style={{ ...field, width: 120 }}
                                    aria-label='Arrow label'
                                    placeholder='When (optional)'
                                    maxLength={FLOW_LIMITS.edgeLabel}
                                    value={edge.label ?? ''}
                                    onChange={e => set({ label: e.target.value })}
                                />
                                <button type='button' style={smallBtn} aria-label='Delete arrow' onClick={() => write({ ...chart, edges: chart.edges.filter((_, j) => j !== i) })}>✕</button>
                            </div>
                        )
                    })}
                    <div>
                        <button
                            type='button'
                            style={smallBtn}
                            disabled={chart.edges.length >= FLOW_LIMITS.edges || !freePair()}
                            onClick={() => {
                                const pair = freePair()
                                if (pair) write({ ...chart, edges: [...chart.edges, { from: pair[0], to: pair[1] }] })
                            }}
                        >
                            Add an arrow
                        </button>
                    </div>
                </div>
            )}
        </NodeViewWrapper>
    )
}
