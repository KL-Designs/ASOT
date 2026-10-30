import { describe, expect, test } from 'vitest'
import type { MapAnnotation, MapLayer } from '@/components/operations/map/types'
import { writeMetis, DEFAULT_METIS } from '@/lib/operations/metis'
import { buildSqf } from './sqf-export'

const layer = (id: string, visible = true): MapLayer => ({ id, name: id, color: '#0000ff', visible, order: 0 })

const base = { color: '#db001d', weight: 2, fillColor: '#db001d', fillOpacity: 0.2 }

const metis = (id: string, layerId: string, over = {}, at: [number, number] = [3400, 1200.5]): MapAnnotation => ({
    id, layerId, type: 'a3metis', geometry: [at],
    properties: { ...base, ...writeMetis({ ...DEFAULT_METIS, ...over }) },
})

describe('buildSqf', () => {
    test('a Metis marker is one createMarker call in the mod\'s format, at [x, y] = [lng, lat]', () => {
        const sqf = buildSqf([metis('a', 'plan', { icon: 2, echelon: 4, hq: true, designation: '1-1' })], [layer('plan')])
        expect(sqf).toContain(
            'gtd_map_allMetisMarkers pushBack ([[1200.5,3400],-10,true,[["blu",false,true],[2,0,0],[4,false,false],["1","-","1"],"",[],0,[],""],1.3] call mts_markers_fnc_createMarker);',
        )
    })

    test('a marker drawn with the old lists exports as the unit it was drawn as', () => {
        // Old index 6 was drawn as Artillery, which is the mod's 17 — not its 6.
        const legacy: MapAnnotation = {
            id: 'old', layerId: 'plan', type: 'a3metis', geometry: [[10, 20]],
            properties: { ...base, a3SideId: 'red', a3Icon: 6, a3Size: 5, a3HqTf: 3, a3Reinforced: true },
        }
        const sqf = buildSqf([legacy], [layer('plan')])
        expect(sqf).toContain('[["red",false,false],[17,0,0],[5,true,false],')
    })

    test('only visible layers are exported', () => {
        const sqf = buildSqf(
            [metis('a', 'shown', { icon: 1 }), metis('b', 'hidden', { icon: 4 })],
            [layer('shown'), layer('hidden', false)],
        )
        expect(sqf).toContain('[1,0,0]')
        expect(sqf).not.toContain('[4,0,0]')
    })

    test('deletes what the previous run drew before drawing again', () => {
        const sqf = buildSqf([], [])
        expect(sqf).toContain('{ [_x] call mts_markers_fnc_deleteMarker } forEach gtd_map_allMetisMarkers;')
        expect(sqf.indexOf('gtd_map_allMetisMarkers = [];')).toBeGreaterThan(sqf.indexOf('mts_markers_fnc_deleteMarker'))
    })

    test('an icon marker\'s label cannot break out of its string', () => {
        const icon: MapAnnotation = {
            id: 'i', layerId: 'plan', type: 'a3icon', geometry: [[1, 2]],
            properties: { ...base, a3MarkerType: 'hd_dot', a3MarkerColor: 'ColorRed', label: 'OBJ "ANVIL"' },
        }
        expect(buildSqf([icon], [layer('plan')])).toContain('"OBJ ""ANVIL"""')
    })

    test('a polyline is flattened to x,y pairs', () => {
        const line: MapAnnotation = { id: 'l', layerId: 'plan', type: 'polyline', geometry: [[10, 20], [30, 40]], properties: base }
        expect(buildSqf([line], [layer('plan')])).toContain('[20,10,40,30]')
    })
})
