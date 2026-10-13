import { describe, expect, test } from 'vitest'
import { copyOverlay, layerTree, pruneChoices, resolveVisibility, withDescendants, type LayerNode } from './map-layers'

const layer = (id: string, order: number, parentId: string | null = null, visible = true): LayerNode => ({
    id, name: id, color: '#fff', visible, order, parentId,
})

const LAYERS = [
    layer('hq', 0),
    layer('hq-logi', 1, 'hq'),
    layer('hq-idf', 2, 'hq'),
    layer('alpha', 3),
    layer('alpha-recon', 4, 'alpha'),
]

describe('layerTree', () => {
    test('groups sub-layers under their overlay, in order', () => {
        expect(layerTree(LAYERS).map(n => [n.layer.id, n.children.map(c => c.id)])).toEqual([
            ['hq', ['hq-logi', 'hq-idf']],
            ['alpha', ['alpha-recon']],
        ])
    })

    test('a layer whose overlay is gone is shown as an overlay, not lost', () => {
        const tree = layerTree([layer('orphan', 0, 'deleted'), layer('hq', 1)])
        expect(tree.map(n => n.layer.id)).toEqual(['orphan', 'hq'])
    })

    test('stays one level deep: a layer under a sub-layer surfaces as an overlay', () => {
        const tree = layerTree([...LAYERS, layer('deep', 5, 'hq-logi')])
        expect(tree.map(n => n.layer.id)).toContain('deep')
    })

    test('plain layers with no parent are all overlays', () => {
        expect(layerTree([layer('b', 1), layer('a', 0)]).map(n => n.layer.id)).toEqual(['a', 'b'])
    })
})

describe('withDescendants', () => {
    test('an overlay and everything in it', () => {
        expect(withDescendants(LAYERS, 'hq')).toEqual(['hq', 'hq-logi', 'hq-idf'])
        expect(withDescendants(LAYERS, 'hq-logi')).toEqual(['hq-logi'])
    })
})

describe('resolveVisibility', () => {
    const visible = (choices = {}) => resolveVisibility(LAYERS, choices).filter(l => l.visible).map(l => l.id)

    test('with no choices, everybody sees the shared default', () => {
        expect(visible()).toEqual(['hq', 'hq-logi', 'hq-idf', 'alpha', 'alpha-recon'])
        expect(resolveVisibility([layer('off', 0, null, false)], {})[0].visible).toBe(false)
    })

    test('hiding an overlay hides everything in it', () => {
        expect(visible({ hq: false })).toEqual(['alpha', 'alpha-recon'])
    })

    test('a sub-layer switches off on its own', () => {
        expect(visible({ 'hq-idf': false })).toEqual(['hq', 'hq-logi', 'alpha', 'alpha-recon'])
    })

    test('a viewer can switch on what is off by default', () => {
        expect(resolveVisibility([layer('off', 0, null, false)], { off: true })[0].visible).toBe(true)
    })

    test('a sub-layer switched on inside a hidden overlay stays hidden', () => {
        expect(visible({ hq: false, 'hq-logi': true })).not.toContain('hq-logi')
    })
})

describe('pruneChoices', () => {
    test('forgets layers that no longer exist', () => {
        expect(pruneChoices({ hq: false, gone: true }, LAYERS)).toEqual({ hq: false })
    })
})

describe('copyOverlay', () => {
    const annotations = [
        { id: 'a1', layerId: 'hq', label: 'on hq' },
        { id: 'a2', layerId: 'hq-logi', label: 'on logi' },
        { id: 'a3', layerId: 'alpha', label: 'on alpha' },
    ]
    const ids = () => { let n = 0; return () => `new${++n}` }

    test('copies the overlay, its sub-layers and what is drawn on them', () => {
        const copy = copyOverlay(LAYERS, annotations, 'hq', '1-1 Alpha orders', ids())!
        expect(copy.layers.map(l => [l.id, l.name, l.parentId])).toEqual([
            ['new1', '1-1 Alpha orders', null],
            ['new2', 'hq-logi', 'new1'],
            ['new3', 'hq-idf', 'new1'],
        ])
        expect(copy.annotations.map(a => [a.layerId, a.label])).toEqual([['new1', 'on hq'], ['new2', 'on logi']])
    })

    test('gives everything new ids and leaves the original alone', () => {
        const before = JSON.stringify([LAYERS, annotations])
        const copy = copyOverlay(LAYERS, annotations, 'hq', 'copy', ids())!
        expect(JSON.stringify([LAYERS, annotations])).toBe(before)
        const originals = new Set([...LAYERS.map(l => l.id), ...annotations.map(a => a.id)])
        for (const id of [...copy.layers.map(l => l.id), ...copy.annotations.map(a => a.id)]) {
            expect(originals.has(id)).toBe(false)
        }
    })

    test('the copy goes after every existing layer and is switched on', () => {
        const copy = copyOverlay([layer('hq', 0, null, false), layer('x', 7)], [], 'hq', 'copy', ids())!
        expect(copy.layers[0].order).toBe(8)
        expect(copy.layers[0].visible).toBe(true)
    })

    test('a copied sub-layer stays in its overlay', () => {
        const copy = copyOverlay(LAYERS, annotations, 'hq-logi', 'logi 2', ids())!
        expect(copy.layers).toHaveLength(1)
        expect(copy.layers[0].parentId).toBe('hq')
    })

    test('nothing to copy from a layer that does not exist', () => {
        expect(copyOverlay(LAYERS, annotations, 'nope', 'x', ids())).toBeNull()
    })
})
