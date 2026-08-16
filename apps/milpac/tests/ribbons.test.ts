import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { layoutRibbons, loadLines } from '../src/render/ribbons'
import { files } from '../src/assets'

/**
 * The cascade is the least obvious part of the uniform: rows have a capacity
 * and pull ribbons up from the rows below until they are full. It is pure and
 * returns placements rather than drawing, precisely so it can be tested without
 * a canvas.
 */
describe('layoutRibbons', () => {
    const lines = () => [
        ['a1', 'a2', 'a3', 'a4', 'a5'],
        ['b1', 'b2'],
        ['c1'],
        ['d1'],
    ]

    test('no citations produces no placements', () => {
        assert.deepEqual(layoutRibbons(lines(), []), [])
    })

    test('only held citations are placed', () => {
        const out = layoutRibbons(lines(), ['a1', 'c1'])
        assert.deepEqual(out.map(p => p.citation).sort(), ['a1', 'c1'])
    })

    test('a citation not present in any line is ignored', () => {
        assert.deepEqual(layoutRibbons(lines(), ['nope']), [])
    })

    test('within a row, ribbons run right to left', () => {
        const out = layoutRibbons([['x1', 'x2', 'x3', 'x4']], ['x1', 'x2', 'x3', 'x4'])
        const xs = out.map(p => p.x)
        // Each successive ribbon is further left than the one before it.
        for (let i = 1; i < xs.length; i++) {
            assert.ok(xs[i]! < xs[i - 1]!, `expected descending x, got ${xs.join(', ')}`)
        }
    })

    test('rows stack upward from the baseline', () => {
        const out = layoutRibbons(lines(), ['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'c1', 'd1'])
        const rows = [...new Set(out.map(p => p.y))].sort((a, b) => b - a)
        assert.ok(rows.length > 1, 'expected more than one row')
        // Every row above the first sits a fixed step higher.
        for (let i = 1; i < rows.length; i++) {
            assert.equal(rows[i - 1]! - rows[i]!, 20)
        }
    })

    test('a short bottom row pulls ribbons up from the rows below', () => {
        // Bottom row holds 2 but has capacity 4, so it takes 2 from below.
        const out = layoutRibbons([['p1', 'p2'], ['q1', 'q2'], ['r1']], ['p1', 'p2', 'q1', 'q2', 'r1'])
        const baseline = Math.max(...out.map(p => p.y))
        const bottomRow = out.filter(p => p.y === baseline)
        assert.equal(bottomRow.length, 4, 'bottom row should be filled to capacity')
    })

    test('every held citation is placed exactly once', () => {
        const held = ['a1', 'a2', 'a3', 'b1', 'b2', 'c1', 'd1']
        const out = layoutRibbons(lines(), held)
        assert.equal(out.length, held.length)
        assert.equal(new Set(out.map(p => p.citation)).size, held.length)
    })

    test('placements carry the fixed ribbon dimensions', () => {
        const [first] = layoutRibbons(lines(), ['a1'])
        assert.equal(first!.width, 64)
        assert.equal(first!.height, 20)
    })

    test('loadLines returns fresh arrays each call', () => {
        // The original reversed the imported JSON in place at module scope, which
        // made ribbon order depend on which module was imported first.
        const first = loadLines(files.medalsJson)
        first[0]!.reverse()
        const second = loadLines(files.medalsJson)
        assert.notDeepEqual(first[0], second[0], 'mutating one result must not affect the next')
    })
})
