import dagre from 'dagre'

/**
 * Flowcharts in operation documents.
 *
 * A mission maker lays out how an objective or an event can unfold — "convoy
 * reaches the bridge", "is it mined?", two branches — as boxes and arrows
 * inside the orders, instead of as a paragraph of ifs.
 *
 * The chart is stored as data, not as a drawing: a list of boxes and a list of
 * arrows between them. Nobody positions anything. The layout is computed, here,
 * every time it is shown, which is what lets the editor be a short form and
 * keeps a chart that was edited by three people from ending up as a tangle.
 *
 * Everything in this file is pure: the same functions draw the chart inside
 * the editor and in the read view, so the two cannot disagree, and the SVG is
 * built as a string with every label escaped — it goes into the page through
 * `innerHTML`, and a label is text somebody typed.
 */

export type FlowNodeKind = 'start' | 'step' | 'decision' | 'end'

export const FLOW_NODE_KINDS: { value: FlowNodeKind; label: string }[] = [
    { value: 'start', label: 'Start' },
    { value: 'step', label: 'Step' },
    { value: 'decision', label: 'Decision' },
    { value: 'end', label: 'End' },
]

export interface FlowNode {
    id: string
    label: string
    kind: FlowNodeKind
}

export interface FlowEdge {
    from: string
    to: string
    /** What takes you down this arrow: "Yes", "Mined", "After 10 min". */
    label?: string
}

export interface FlowChart {
    nodes: FlowNode[]
    edges: FlowEdge[]
}

export const FLOW_LIMITS = { nodes: 40, edges: 80, label: 120, edgeLabel: 40, title: 80 } as const

const KINDS = new Set<FlowNodeKind>(['start', 'step', 'decision', 'end'])

/** What a new flowchart starts as: enough to show what one is. */
export function starterFlowchart(): FlowChart {
    return {
        nodes: [
            { id: 'n1', label: 'Start', kind: 'start' },
            { id: 'n2', label: 'What happens?', kind: 'decision' },
            { id: 'n3', label: 'Outcome A', kind: 'step' },
            { id: 'n4', label: 'Outcome B', kind: 'step' },
        ],
        edges: [
            { from: 'n1', to: 'n2' },
            { from: 'n2', to: 'n3', label: 'Yes' },
            { from: 'n2', to: 'n4', label: 'No' },
        ],
    }
}

/**
 * Whatever was stored, as a chart that is safe to lay out.
 *
 * The attribute is JSON in a collaborative document: it can be half-written,
 * hand-edited or from an older shape. Anything unusable is dropped rather than
 * thrown on — a section that refuses to render over one bad arrow is worse
 * than a chart missing that arrow.
 */
export function parseFlowchart(raw: unknown): FlowChart {
    let value: unknown = raw
    if (typeof raw === 'string') {
        try { value = JSON.parse(raw) } catch { return { nodes: [], edges: [] } }
    }
    if (!value || typeof value !== 'object') return { nodes: [], edges: [] }
    const source = value as { nodes?: unknown; edges?: unknown }

    const nodes: FlowNode[] = []
    const ids = new Set<string>()
    for (const n of Array.isArray(source.nodes) ? source.nodes : []) {
        if (nodes.length >= FLOW_LIMITS.nodes) break
        if (!n || typeof n !== 'object') continue
        const { id, label, kind } = n as Record<string, unknown>
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(id) || ids.has(id)) continue
        ids.add(id)
        nodes.push({
            id,
            label: typeof label === 'string' ? label.slice(0, FLOW_LIMITS.label) : '',
            kind: KINDS.has(kind as FlowNodeKind) ? (kind as FlowNodeKind) : 'step',
        })
    }

    const edges: FlowEdge[] = []
    const seen = new Set<string>()
    for (const e of Array.isArray(source.edges) ? source.edges : []) {
        if (edges.length >= FLOW_LIMITS.edges) break
        if (!e || typeof e !== 'object') continue
        const { from, to, label } = e as Record<string, unknown>
        if (typeof from !== 'string' || typeof to !== 'string') continue
        // An arrow needs both of its ends, and one arrow per pair is enough.
        if (!ids.has(from) || !ids.has(to) || from === to || seen.has(`${from}>${to}`)) continue
        seen.add(`${from}>${to}`)
        const text = typeof label === 'string' ? label.trim().slice(0, FLOW_LIMITS.edgeLabel) : ''
        edges.push({ from, to, ...(text ? { label: text } : {}) })
    }

    return { nodes, edges }
}

/** The next unused box id: n1, n2, … */
export function nextNodeId(chart: FlowChart): string {
    const used = new Set(chart.nodes.map(n => n.id))
    for (let i = 1; ; i++) if (!used.has(`n${i}`)) return `n${i}`
}

/** Removing a box takes its arrows with it. */
export function removeNode(chart: FlowChart, id: string): FlowChart {
    return {
        nodes: chart.nodes.filter(n => n.id !== id),
        edges: chart.edges.filter(e => e.from !== id && e.to !== id),
    }
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

const CHAR_W = 7.1
const LINE_H = 17
const PAD_X = 18
const PAD_Y = 13
const MAX_LINE = 24

/** Break a label into lines no longer than a box is wide. */
export function wrapLabel(label: string, max = MAX_LINE): string[] {
    const words = label.trim().split(/\s+/).filter(Boolean)
    if (!words.length) return ['']
    const lines: string[] = []
    let line = ''
    for (const word of words) {
        // A single word longer than a line is cut, not left to overflow the box.
        let rest = word
        while (rest.length > max) {
            if (line) { lines.push(line); line = '' }
            lines.push(rest.slice(0, max))
            rest = rest.slice(max)
        }
        if (!line) line = rest
        else if (`${line} ${rest}`.length <= max) line = `${line} ${rest}`
        else { lines.push(line); line = rest }
    }
    if (line) lines.push(line)
    return lines
}

export interface PlacedNode extends FlowNode {
    x: number
    y: number
    width: number
    height: number
    lines: string[]
}

export interface PlacedEdge extends FlowEdge {
    points: { x: number; y: number }[]
    labelAt: { x: number; y: number } | null
}

export interface FlowLayout {
    width: number
    height: number
    nodes: PlacedNode[]
    edges: PlacedEdge[]
}

export function layoutFlowchart(chart: FlowChart): FlowLayout {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 34, ranksep: 46, marginx: 12, marginy: 12 })
    g.setDefaultEdgeLabel(() => ({}))

    const sized = new Map<string, { lines: string[]; width: number; height: number }>()
    for (const node of chart.nodes) {
        const lines = wrapLabel(node.label || ' ')
        const longest = Math.max(...lines.map(l => l.length), 6)
        // A decision is drawn with pointed sides, which eat into its width.
        const extra = node.kind === 'decision' ? 26 : 0
        const size = {
            lines,
            width: Math.round(longest * CHAR_W + PAD_X * 2 + extra),
            height: Math.round(lines.length * LINE_H + PAD_Y * 2),
        }
        sized.set(node.id, size)
        g.setNode(node.id, { width: size.width, height: size.height })
    }
    for (const edge of chart.edges) {
        g.setEdge(edge.from, edge.to, edge.label
            ? { label: edge.label, width: edge.label.length * 6.4 + 12, height: 18, labelpos: 'c' }
            : {})
    }

    dagre.layout(g)

    const nodes: PlacedNode[] = chart.nodes.map(node => {
        const at = g.node(node.id)
        const size = sized.get(node.id)!
        return { ...node, ...size, x: at.x, y: at.y }
    })
    const edges: PlacedEdge[] = chart.edges.map(edge => {
        const at = g.edge(edge.from, edge.to) as { points?: { x: number; y: number }[]; x?: number; y?: number }
        return {
            ...edge,
            points: at.points ?? [],
            labelAt: edge.label && typeof at.x === 'number' && typeof at.y === 'number' ? { x: at.x, y: at.y } : null,
        }
    })

    const graph = g.graph()
    return {
        width: Math.max(1, Math.ceil(graph.width ?? 1)),
        height: Math.max(1, Math.ceil(graph.height ?? 1)),
        nodes,
        edges,
    }
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

export function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

const n1 = (v: number) => Math.round(v * 10) / 10

function shape(node: PlacedNode): string {
    const { x, y, width: w, height: h } = node
    const left = n1(x - w / 2), top = n1(y - h / 2)
    if (node.kind === 'decision') {
        // Pointed sides: reads as "a choice" without the wasted corners of a diamond.
        const inset = 13
        const pts = [
            [left + inset, top], [left + w - inset, top], [left + w, y],
            [left + w - inset, top + h], [left + inset, top + h], [left, y],
        ].map(([px, py]) => `${n1(px)},${n1(py)}`).join(' ')
        return `<polygon class="flow-shape flow-${node.kind}" points="${pts}"/>`
    }
    const radius = node.kind === 'start' || node.kind === 'end' ? n1(h / 2) : 4
    return `<rect class="flow-shape flow-${node.kind}" x="${left}" y="${top}" width="${n1(w)}" height="${n1(h)}" rx="${radius}"/>`
}

/**
 * The chart as an SVG string.
 *
 * Colours are left to the page: text is `currentColor`, and the strokes read
 * `--flow-acc` so a chart takes the operation's theme colour wherever it is
 * shown. `id` namespaces the arrowhead marker — two charts on one page with the
 * same marker id would both point at whichever came first.
 */
export function flowchartSvg(chart: FlowChart, id = 'flow'): string {
    if (!chart.nodes.length) return ''
    const layout = layoutFlowchart(chart)
    const marker = `${id.replace(/[^A-Za-z0-9_-]/g, '')}-arrow`

    const edges = layout.edges.map(edge => {
        if (edge.points.length < 2) return ''
        const d = edge.points.map((p, i) => `${i ? 'L' : 'M'}${n1(p.x)} ${n1(p.y)}`).join(' ')
        const label = edge.label && edge.labelAt
            ? `<g class="flow-edge-label">`
                + `<rect x="${n1(edge.labelAt.x - (edge.label.length * 6.4 + 10) / 2)}" y="${n1(edge.labelAt.y - 9)}" `
                + `width="${n1(edge.label.length * 6.4 + 10)}" height="18" rx="3"/>`
                + `<text x="${n1(edge.labelAt.x)}" y="${n1(edge.labelAt.y + 4)}" text-anchor="middle">${escapeXml(edge.label)}</text></g>`
            : ''
        return `<path class="flow-edge" d="${d}" marker-end="url(#${marker})"/>${label}`
    }).join('')

    const nodes = layout.nodes.map(node => {
        const first = node.y - ((node.lines.length - 1) * LINE_H) / 2 + 4.5
        const text = node.lines
            .map((line, i) => `<tspan x="${n1(node.x)}" y="${n1(first + i * LINE_H)}">${escapeXml(line)}</tspan>`)
            .join('')
        return `${shape(node)}<text class="flow-label" text-anchor="middle">${text}</text>`
    }).join('')

    return `<svg class="flow-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" `
        + `width="${layout.width}" height="${layout.height}" role="img" aria-label="Flowchart">`
        + `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
        + `<path class="flow-arrowhead" d="M0 0L10 5L0 10z"/></marker></defs>`
        + edges + nodes + `</svg>`
}

/** The styles every drawn chart needs, wherever it is put. */
export const FLOWCHART_CSS = `
.flow-svg { max-width: 100%; height: auto; display: block; margin: 0 auto; font-family: inherit; }
.flow-shape { fill: rgba(255,255,255,0.03); stroke: var(--flow-acc, #db001d); stroke-width: 1.4; }
.flow-start, .flow-end { fill: color-mix(in srgb, var(--flow-acc, #db001d) 14%, transparent); }
.flow-decision { stroke-dasharray: 5 3; }
.flow-label { fill: currentColor; font-size: 12.5px; }
.flow-edge { fill: none; stroke: currentColor; stroke-opacity: .5; stroke-width: 1.3; }
.flow-arrowhead { fill: currentColor; fill-opacity: .6; }
.flow-edge-label rect { fill: var(--flow-bg, #0e1013); stroke: none; }
.flow-edge-label text { fill: var(--flow-acc, #db001d); font-size: 10.5px; font-weight: 700; letter-spacing: .04em; }
`
