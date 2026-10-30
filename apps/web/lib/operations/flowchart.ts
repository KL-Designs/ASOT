import dagre from 'dagre'

/**
 * Flowcharts in operation documents.
 *
 * A mission maker lays out how an objective or an event can unfold — "convoy
 * reaches the bridge", "is it mined?", two branches — as boxes and arrows
 * inside the orders, instead of as a paragraph of ifs.
 *
 * The chart is stored as data: a list of boxes and a list of arrows between
 * them. A box may also carry where it was dragged to. Boxes nobody has moved
 * are placed by dagre; once a box has been dragged in the editor every box is
 * pinned where it stands (see `pinPositions`), so moving one never makes the
 * rest jump. Arrows are always routed here, from wherever their boxes are.
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
    /** Centre of the box, once it has been dragged. Absent: dagre places it. */
    x?: number
    y?: number
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

/** Far enough for any chart anyone will draw; a bound on what JSON can claim. */
const COORD_LIMIT = 20_000
const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= COORD_LIMIT

const n1 = (v: number) => Math.round(v * 10) / 10

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
        const { id, label, kind, x, y } = n as Record<string, unknown>
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(id) || ids.has(id)) continue
        ids.add(id)
        nodes.push({
            id,
            label: typeof label === 'string' ? label.slice(0, FLOW_LIMITS.label) : '',
            kind: KINDS.has(kind as FlowNodeKind) ? (kind as FlowNodeKind) : 'step',
            // A position is kept only as a pair; half of one is no position.
            ...(isCoord(x) && isCoord(y) ? { x: n1(x), y: n1(y) } : {}),
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
    /** The drawing's bounds: boxes can be dragged above or left of zero. */
    minX: number
    minY: number
    width: number
    height: number
    nodes: PlacedNode[]
    edges: PlacedEdge[]
}

const MARGIN = 12

function sizeNode(node: FlowNode) {
    const lines = wrapLabel(node.label || ' ')
    const longest = Math.max(...lines.map(l => l.length), 6)
    // A decision is drawn with pointed sides, which eat into its width.
    const extra = node.kind === 'decision' ? 26 : 0
    return {
        lines,
        width: Math.round(longest * CHAR_W + PAD_X * 2 + extra),
        height: Math.round(lines.length * LINE_H + PAD_Y * 2),
    }
}

/**
 * An arrow from one box to another as right-angled segments: out of the
 * bottom of the box above and into the top of the box below, or side to side
 * when they sit level. The label goes on the middle of the run between them,
 * which for a fork is the stretch that leans towards its own branch.
 */
export function routeEdge(from: PlacedNode, to: PlacedNode): { points: { x: number; y: number }[]; mid: { x: number; y: number } } {
    const fromBottom = from.y + from.height / 2, toTop = to.y - to.height / 2
    const fromTop = from.y - from.height / 2, toBottom = to.y + to.height / 2
    if (toTop >= fromBottom + 8) {
        const midY = (fromBottom + toTop) / 2
        return {
            points: [{ x: from.x, y: fromBottom }, { x: from.x, y: midY }, { x: to.x, y: midY }, { x: to.x, y: toTop }],
            mid: { x: (from.x + to.x) / 2, y: midY },
        }
    }
    if (fromTop >= toBottom + 8) {
        const midY = (fromTop + toBottom) / 2
        return {
            points: [{ x: from.x, y: fromTop }, { x: from.x, y: midY }, { x: to.x, y: midY }, { x: to.x, y: toBottom }],
            mid: { x: (from.x + to.x) / 2, y: midY },
        }
    }
    const dir = to.x >= from.x ? 1 : -1
    const sx = from.x + dir * from.width / 2, ex = to.x - dir * to.width / 2
    const midX = (sx + ex) / 2
    return {
        points: [{ x: sx, y: from.y }, { x: midX, y: from.y }, { x: midX, y: to.y }, { x: ex, y: to.y }],
        mid: { x: midX, y: (from.y + to.y) / 2 },
    }
}

export function layoutFlowchart(chart: FlowChart): FlowLayout {
    const sized = new Map(chart.nodes.map(node => [node.id, sizeNode(node)]))

    // Dagre only for boxes nobody has placed.
    const auto = new Map<string, { x: number; y: number }>()
    if (chart.nodes.some(n => n.x === undefined || n.y === undefined)) {
        const g = new dagre.graphlib.Graph()
        g.setGraph({ rankdir: 'TB', nodesep: 34, ranksep: 46, marginx: MARGIN, marginy: MARGIN })
        g.setDefaultEdgeLabel(() => ({}))
        for (const node of chart.nodes) {
            const size = sized.get(node.id)!
            g.setNode(node.id, { width: size.width, height: size.height })
        }
        for (const edge of chart.edges) {
            g.setEdge(edge.from, edge.to, edge.label
                ? { label: edge.label, width: edge.label.length * 6.4 + 12, height: 18, labelpos: 'c' }
                : {})
        }
        dagre.layout(g)
        for (const node of chart.nodes) {
            const at = g.node(node.id)
            auto.set(node.id, { x: at.x, y: at.y })
        }
    }

    const nodes: PlacedNode[] = chart.nodes.map(node => {
        const at = node.x !== undefined && node.y !== undefined ? { x: node.x, y: node.y } : auto.get(node.id)!
        return { ...node, ...sized.get(node.id)!, x: at.x, y: at.y }
    })
    const byId = new Map(nodes.map(n => [n.id, n]))
    const edges: PlacedEdge[] = chart.edges.map(edge => {
        const route = routeEdge(byId.get(edge.from)!, byId.get(edge.to)!)
        return { ...edge, points: route.points, labelAt: route.mid }
    })

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
        minX = Math.min(minX, n.x - n.width / 2); maxX = Math.max(maxX, n.x + n.width / 2)
        minY = Math.min(minY, n.y - n.height / 2); maxY = Math.max(maxY, n.y + n.height / 2)
    }
    for (const e of edges) {
        if (!e.label) continue
        const half = (e.label.length * 6.4 + 10) / 2
        minX = Math.min(minX, e.labelAt!.x - half); maxX = Math.max(maxX, e.labelAt!.x + half)
    }
    if (!nodes.length) { minX = 0; minY = 0; maxX = 1; maxY = 1 }

    return {
        minX: Math.floor(minX - MARGIN),
        minY: Math.floor(minY - MARGIN),
        width: Math.max(1, Math.ceil(maxX - minX + MARGIN * 2)),
        height: Math.max(1, Math.ceil(maxY - minY + MARGIN * 2)),
        nodes,
        edges,
    }
}

/* ── Arranging, for the editor ──────────────────────────────────────────── */

/** Every box at the position it is drawn at now, so moving one moves only it. */
export function pinPositions(chart: FlowChart): FlowChart {
    if (chart.nodes.every(n => n.x !== undefined && n.y !== undefined)) return chart
    const at = new Map(layoutFlowchart(chart).nodes.map(n => [n.id, n]))
    return { ...chart, nodes: chart.nodes.map(n => ({ ...n, x: n1(at.get(n.id)!.x), y: n1(at.get(n.id)!.y) })) }
}

/** Forget every dragged position and let dagre lay the chart out again. */
export function unpinPositions(chart: FlowChart): FlowChart {
    return { ...chart, nodes: chart.nodes.map(({ x: _x, y: _y, ...n }) => n) }
}

/** The boxes that hang beneath `id`: everything its arrows lead to, at any depth. */
export function descendants(chart: FlowChart, id: string): Set<string> {
    const out = new Set<string>()
    const queue = [id]
    while (queue.length) {
        const at = queue.shift()!
        for (const e of chart.edges) {
            if (e.from === at && e.to !== id && !out.has(e.to)) { out.add(e.to); queue.push(e.to) }
        }
    }
    return out
}

/** Move a box and everything beneath it by the same amount. Expects pinned positions. */
export function moveBranch(chart: FlowChart, id: string, dx: number, dy: number): FlowChart {
    const moving = descendants(chart, id).add(id)
    return {
        ...chart,
        nodes: chart.nodes.map(n => moving.has(n.id) && n.x !== undefined && n.y !== undefined
            ? { ...n, x: n1(n.x + dx), y: n1(n.y + dy) }
            : n),
    }
}

const CHILD_GAP_Y = 56
const CHILD_GAP_X = 30

/** Where a new child of `parentId` goes: under it, or right of its last child. */
function childSlot(chart: FlowChart, parentId: string, child: FlowNode, ignore?: Set<string>): { x: number; y: number } {
    const layout = layoutFlowchart(chart)
    const byId = new Map(layout.nodes.map(n => [n.id, n]))
    const parent = byId.get(parentId)!
    const size = sizeNode(child)
    const siblings = chart.edges
        .filter(e => e.from === parentId && e.to !== child.id && !ignore?.has(e.to))
        .map(e => byId.get(e.to)!)
    const y = parent.y + parent.height / 2 + CHILD_GAP_Y + size.height / 2
    if (!siblings.length) return { x: parent.x, y }
    const right = Math.max(...siblings.map(n => n.x + n.width / 2))
    return { x: right + CHILD_GAP_X + size.width / 2, y: Math.max(y, ...siblings.map(n => n.y)) }
}

/** A new box beneath `parentId`, with an arrow to it. */
export function addChild(chart: FlowChart, parentId: string): { chart: FlowChart; id: string } {
    const pinned = pinPositions(chart)
    const id = nextNodeId(pinned)
    const node: FlowNode = { id, label: 'New step', kind: 'step' }
    const at = childSlot(pinned, parentId, node)
    return {
        id,
        chart: {
            nodes: [...pinned.nodes, { ...node, x: n1(at.x), y: n1(at.y) }],
            edges: [...pinned.edges, { from: parentId, to: id }],
        },
    }
}

/**
 * Drop box `id` onto box `parentId`: it becomes a sub box of that one. Its old
 * incoming arrows go (it has moved to a new parent), one arrow from the new
 * parent comes in, and the box and its own branch move to sit beneath it.
 * Dropping a box onto one of its own descendants would make a loop of the
 * branch, so that is refused and the chart comes back unchanged.
 */
export function reparent(chart: FlowChart, id: string, parentId: string): FlowChart {
    if (id === parentId || descendants(chart, id).has(parentId)) return chart
    const pinned = pinPositions(chart)
    const node = pinned.nodes.find(n => n.id === id)!
    const without: FlowChart = { ...pinned, edges: pinned.edges.filter(e => e.to !== id) }
    const at = childSlot(without, parentId, node, descendants(pinned, id))
    const moved = moveBranch(without, id, at.x - node.x!, at.y - node.y!)
    return { ...moved, edges: [...moved.edges, { from: parentId, to: id }] }
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
export function flowchartSvg(chart: FlowChart, id = 'flow', layout: FlowLayout = layoutFlowchart(chart)): string {
    if (!chart.nodes.length) return ''
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

    return `<svg class="flow-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${layout.minX} ${layout.minY} ${layout.width} ${layout.height}" `
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
