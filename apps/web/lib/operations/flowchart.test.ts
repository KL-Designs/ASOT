import { describe, expect, test } from 'vitest'
import {
    addChild, descendants, escapeXml, flowchartSvg, layoutFlowchart, moveBranch, nextNodeId, parseFlowchart,
    pinPositions, removeNode, reparent, starterFlowchart, unpinPositions, wrapLabel, FLOW_LIMITS,
} from './flowchart'

describe('parseFlowchart', () => {
    test('round-trips the starter chart through JSON', () => {
        const chart = starterFlowchart()
        expect(parseFlowchart(JSON.stringify(chart))).toEqual(chart)
    })

    test('anything unreadable is an empty chart, not an exception', () => {
        expect(parseFlowchart('{not json')).toEqual({ nodes: [], edges: [] })
        expect(parseFlowchart(null)).toEqual({ nodes: [], edges: [] })
        expect(parseFlowchart(42)).toEqual({ nodes: [], edges: [] })
    })

    test('drops boxes with a bad or repeated id, and defaults an unknown kind', () => {
        const chart = parseFlowchart({
            nodes: [
                { id: 'a', label: 'One', kind: 'start' },
                { id: 'a', label: 'Twice', kind: 'step' },
                { id: 'has space', label: 'Bad', kind: 'step' },
                { id: 'b', label: 'Two', kind: 'explosion' },
            ],
            edges: [],
        })
        expect(chart.nodes).toEqual([
            { id: 'a', label: 'One', kind: 'start' },
            { id: 'b', label: 'Two', kind: 'step' },
        ])
    })

    test('drops arrows to nowhere, to themselves, and repeats', () => {
        const chart = parseFlowchart({
            nodes: [{ id: 'a', label: '', kind: 'step' }, { id: 'b', label: '', kind: 'step' }],
            edges: [
                { from: 'a', to: 'b', label: ' Yes ' },
                { from: 'a', to: 'b', label: 'again' },
                { from: 'a', to: 'ghost' },
                { from: 'a', to: 'a' },
            ],
        })
        expect(chart.edges).toEqual([{ from: 'a', to: 'b', label: 'Yes' }])
    })

    test('holds to its limits', () => {
        const nodes = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, label: 'x'.repeat(500), kind: 'step' }))
        const chart = parseFlowchart({ nodes, edges: [] })
        expect(chart.nodes).toHaveLength(FLOW_LIMITS.nodes)
        expect(chart.nodes[0].label).toHaveLength(FLOW_LIMITS.label)
    })
})

describe('editing', () => {
    test('nextNodeId takes the first free number', () => {
        expect(nextNodeId(starterFlowchart())).toBe('n5')
        expect(nextNodeId({ nodes: [{ id: 'n2', label: '', kind: 'step' }], edges: [] })).toBe('n1')
    })

    test('removing a box removes its arrows', () => {
        const chart = removeNode(starterFlowchart(), 'n2')
        expect(chart.nodes.map(n => n.id)).toEqual(['n1', 'n3', 'n4'])
        expect(chart.edges).toEqual([])
    })
})

describe('wrapLabel', () => {
    test('breaks on words', () => {
        expect(wrapLabel('Convoy reaches the bridge at first light', 16)).toEqual(['Convoy reaches', 'the bridge at', 'first light'])
    })

    test('cuts a word longer than a line rather than overflowing', () => {
        expect(wrapLabel('x'.repeat(30), 12)).toEqual(['x'.repeat(12), 'x'.repeat(12), 'x'.repeat(6)])
    })

    test('an empty label is one empty line', () => {
        expect(wrapLabel('   ')).toEqual([''])
    })
})

describe('layout', () => {
    const layout = layoutFlowchart(starterFlowchart())

    test('places every box and routes every arrow', () => {
        expect(layout.nodes).toHaveLength(4)
        expect(layout.edges.every(e => e.points.length >= 2)).toBe(true)
        expect(layout.width).toBeGreaterThan(100)
    })

    test('runs downwards: a box sits below the one that leads to it', () => {
        const y = (id: string) => layout.nodes.find(n => n.id === id)!.y
        expect(y('n2')).toBeGreaterThan(y('n1'))
        expect(y('n3')).toBeGreaterThan(y('n2'))
        // The two outcomes of one decision share a row.
        expect(y('n3')).toBe(y('n4'))
    })

    test('a loop back to an earlier box still lays out', () => {
        const chart = starterFlowchart()
        chart.edges.push({ from: 'n4', to: 'n1', label: 'Retry' })
        expect(() => layoutFlowchart(chart)).not.toThrow()
    })
})

describe('flowchartSvg', () => {
    test('draws nothing for an empty chart', () => {
        expect(flowchartSvg({ nodes: [], edges: [] })).toBe('')
    })

    test('escapes what was typed', () => {
        const svg = flowchartSvg({
            nodes: [{ id: 'a', label: '<script>alert(1)</script> & "more"', kind: 'step' }, { id: 'b', label: 'B', kind: 'end' }],
            edges: [{ from: 'a', to: 'b', label: '<b>x</b>' }],
        })
        expect(svg).not.toContain('<script>')
        expect(svg).not.toContain('<b>')
        expect(svg).toContain('&lt;script&gt;')
    })

    test('namespaces its arrowhead so two charts on a page do not share one', () => {
        const chart = starterFlowchart()
        expect(flowchartSvg(chart, 'one')).toContain('id="one-arrow"')
        expect(flowchartSvg(chart, 'two" onload="x')).toContain('id="twoonloadx-arrow"')
    })

    test('escapeXml covers the five that matter', () => {
        expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
    })
})

describe('arranging by hand', () => {
    test('keeps a position only as a finite pair', () => {
        const chart = parseFlowchart({
            nodes: [
                { id: 'a', label: '', kind: 'step', x: 10.04, y: -20 },
                { id: 'b', label: '', kind: 'step', x: 10 },
                { id: 'c', label: '', kind: 'step', x: 'far', y: 3 },
                { id: 'd', label: '', kind: 'step', x: 1e9, y: 3 },
            ],
            edges: [],
        })
        expect(chart.nodes.map(n => [n.x, n.y])).toEqual([[10, -20], [undefined, undefined], [undefined, undefined], [undefined, undefined]])
    })

    test('a placed box is drawn where it was put, and the drawing grows to hold it', () => {
        const chart = pinPositions(starterFlowchart())
        const moved = moveBranch(chart, 'n3', -400, 0)
        const layout = layoutFlowchart(moved)
        expect(layout.nodes.find(n => n.id === 'n3')!.x).toBe(chart.nodes.find(n => n.id === 'n3')!.x! - 400)
        expect(layout.minX).toBeLessThan(-200)
        expect(flowchartSvg(moved)).toContain(`viewBox="${layout.minX} `)
    })

    test('pinning keeps every box where dagre had it, and unpinning forgets it', () => {
        const chart = starterFlowchart()
        const before = layoutFlowchart(chart).nodes.map(n => [Math.round(n.x), Math.round(n.y)])
        const pinned = pinPositions(chart)
        expect(layoutFlowchart(pinned).nodes.map(n => [Math.round(n.x), Math.round(n.y)])).toEqual(before)
        expect(unpinPositions(pinned)).toEqual(chart)
    })

    test('moving a box takes its branch with it, and leaves the rest', () => {
        const chart = pinPositions(starterFlowchart())
        const moved = moveBranch(chart, 'n2', -100, 20)
        const at = (c: typeof chart, id: string) => c.nodes.find(n => n.id === id)!
        for (const id of ['n2', 'n3', 'n4']) expect(at(moved, id).x).toBeCloseTo(at(chart, id).x! - 100)
        expect(at(moved, 'n1')).toEqual(at(chart, 'n1'))
    })

    test('a new child sits below its parent with an arrow to it', () => {
        const { chart, id } = addChild(starterFlowchart(), 'n3')
        const layout = layoutFlowchart(chart)
        const parent = layout.nodes.find(n => n.id === 'n3')!, child = layout.nodes.find(n => n.id === id)!
        expect(chart.edges).toContainEqual({ from: 'n3', to: id })
        expect(child.y).toBeGreaterThan(parent.y + parent.height / 2)
        expect(child.x).toBeCloseTo(parent.x)
    })

    test('a second child goes beside the first', () => {
        const first = addChild(starterFlowchart(), 'n3')
        const second = addChild(first.chart, 'n3')
        const at = (id: string) => second.chart.nodes.find(n => n.id === id)!
        expect(at(second.id).x!).toBeGreaterThan(at(first.id).x!)
    })

    test('dropping a box on another makes it a sub box of that one', () => {
        const chart = reparent(starterFlowchart(), 'n4', 'n3')
        expect(chart.edges.filter(e => e.to === 'n4')).toEqual([{ from: 'n3', to: 'n4' }])
        const layout = layoutFlowchart(chart)
        expect(layout.nodes.find(n => n.id === 'n4')!.y).toBeGreaterThan(layout.nodes.find(n => n.id === 'n3')!.y)
    })

    test('a box cannot be dropped onto its own branch', () => {
        const chart = starterFlowchart()
        expect(descendants(chart, 'n1')).toEqual(new Set(['n2', 'n3', 'n4']))
        expect(reparent(chart, 'n1', 'n3')).toBe(chart)
    })
})
