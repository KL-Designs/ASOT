import { describe, expect, test } from 'vitest'
import {
    escapeXml, flowchartSvg, layoutFlowchart, nextNodeId, parseFlowchart, removeNode,
    starterFlowchart, wrapLabel, FLOW_LIMITS,
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
