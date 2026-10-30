import { describe, expect, test } from 'vitest'
import { lerpView, viewFor, visibleWorld, zoomEase } from './map-grid-view'

/** Leaflet's CRS.Simple: one map unit is one pixel at zoom 0, y flipped. */
const project = (lat: number, lng: number, zoom: number) => {
    const scale = Math.pow(2, zoom)
    return { x: lng * scale, y: -lat * scale }
}

const size = { x: 800, y: 600 }
const screen = (v: ReturnType<typeof viewFor>, lat: number, lng: number) => ({ x: v.ax * lng + v.bx, y: v.ay * lat + v.by })

describe('viewFor', () => {
    test('puts the centre in the middle of the canvas', () => {
        const v = viewFor(project, { lat: 5000, lng: 7000 }, -3, size)
        expect(screen(v, 5000, 7000)).toEqual({ x: 400, y: 300 })
    })

    test('north is up and east is right, at the zoom\'s scale', () => {
        const v = viewFor(project, { lat: 5000, lng: 7000 }, -3, size)
        // 1000m at zoom -3 is 125px.
        expect(screen(v, 6000, 7000)).toEqual({ x: 400, y: 175 })
        expect(screen(v, 5000, 8000)).toEqual({ x: 525, y: 300 })
    })
})

describe('visibleWorld', () => {
    test('is the world rectangle the canvas covers', () => {
        const v = viewFor(project, { lat: 5000, lng: 7000 }, -3, size)
        // 800x600 px at 8 m/px is 6400x4800 m around the centre.
        expect(visibleWorld(v, size)).toEqual({ minX: 3800, maxX: 10200, minY: 2600, maxY: 7400 })
    })
})

describe('lerpView', () => {
    const from = viewFor(project, { lat: 5000, lng: 7000 }, -3, size)
    const to = viewFor(project, { lat: 5200, lng: 7400 }, -2, size)

    test('starts at one view and ends at the other', () => {
        expect(lerpView(from, to, 0)).toEqual(from)
        expect(lerpView(from, to, 1)).toEqual(to)
    })

    test('moves every point in a straight line on screen, as a CSS transform does', () => {
        const a = screen(from, 6000, 8000)
        const b = screen(to, 6000, 8000)
        const mid = screen(lerpView(from, to, 0.5), 6000, 8000)
        expect(mid.x).toBeCloseTo((a.x + b.x) / 2)
        expect(mid.y).toBeCloseTo((a.y + b.y) / 2)
    })
})

describe('zoomEase', () => {
    test('is pinned at both ends', () => {
        expect(zoomEase(0)).toBe(0)
        expect(zoomEase(1)).toBe(1)
        expect(zoomEase(-1)).toBe(0)
        expect(zoomEase(2)).toBe(1)
    })

    test('rises monotonically', () => {
        let last = 0
        for (let i = 1; i <= 20; i++) {
            const y = zoomEase(i / 20)
            expect(y).toBeGreaterThanOrEqual(last)
            last = y
        }
    })

    test('is an ease-out: most of the distance is covered early', () => {
        expect(zoomEase(0.25)).toBeGreaterThan(0.5)
    })
})
