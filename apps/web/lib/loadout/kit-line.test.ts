/**
 * One line on a 1400px card, drawn by satori, which does not wrap gracefully —
 * so the truncation rule matters as much as the content.
 */
import { describe, test, expect } from 'vitest'
import { formatKitLine } from './kit-line'
import type { KitSummary } from './summary'

const summary = (over: Partial<KitSummary> = {}): KitSummary => ({
    primary: { className: 'ACE_arifle_MX_Black', attachments: [] },
    uniform: null,
    vest: 'V_PlateCarrier1_rgr',
    backpack: null,
    headgear: null,
    itemCount: 64,
    ...over,
})

describe('formatKitLine', () => {
    test('names the kit, its rifle, its vest and what it carries', () => {
        const line = formatKitLine('Breacher', summary())
        expect(line.startsWith('Breacher — ')).toBe(true)
        expect(line).toContain('64 items')
        expect(line.split(' · ').length).toBe(3)
    })

    test('classnames are resolved to display names, never printed raw', () => {
        expect(formatKitLine('Breacher', summary())).not.toContain('V_PlateCarrier1_rgr')
    })

    test('a kit with no rifle omits the weapon rather than printing a gap', () => {
        const line = formatKitLine('Medic', summary({ primary: null }))
        expect(line).not.toContain(' ·  · ')
        expect(line).toContain('64 items')
    })

    test('a kit with no vest and no rifle is still a valid line', () => {
        expect(formatKitLine('Empty', summary({ primary: null, vest: null, itemCount: 0 })))
            .toBe('Empty — 0 items')
    })

    test('one item is singular', () => {
        expect(formatKitLine('Sparse', summary({ primary: null, vest: null, itemCount: 1 })))
            .toBe('Sparse — 1 item')
    })

    test('a very long kit name is truncated with an ellipsis, not wrapped', () => {
        // Asserted on the name portion alone. The rest of the line is built
        // from the real item dictionary, so asserting a total length would
        // make this test fail whenever someone renames a vest.
        const name = formatKitLine('A'.repeat(80), summary()).split(' — ')[0]
        expect(name).toHaveLength(28)
        expect(name.endsWith('…')).toBe(true)
    })

    test('an unrecognised classname cannot run long enough to push the count off the card', () => {
        // Classnames come from a pasted arsenal export, so an unknown one is
        // member-supplied text of unbounded length arriving mid-line.
        const line = formatKitLine('Kit', summary({ primary: { className: 'X'.repeat(200), attachments: [] } }))
        expect(line).toContain('64 items')
        expect(line.length).toBeLessThan(120)
    })

    test('a name whose cut lands on whitespace still ends in an ellipsis', () => {
        // trimEnd() before the ellipsis means this one is allowed to come in
        // under MAX_NAME — what must hold is that it is bounded and marked.
        const name = formatKitLine(`${'A'.repeat(26)} ${'B'.repeat(50)}`, summary()).split(' — ')[0]
        expect(name.length).toBeLessThanOrEqual(28)
        expect(name.endsWith('…')).toBe(true)
    })
})
