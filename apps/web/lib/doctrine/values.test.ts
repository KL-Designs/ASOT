import { describe, expect, test } from 'vitest'
import { EMPTY_VALUES, type DoctrineValues } from './schema'
import { applyOverrides, changesBetween, diffOverrides, needsApproval, resolveChain, sanitiseValues, sourcesOf, versionAt } from './values'
import { compareIntel } from './compare'

const v = (p: Partial<DoctrineValues>): DoctrineValues => ({ ...EMPTY_VALUES, ...p })

const faction = v({
    fields: { 'identity.name': 'Takistani Army', 'identity.combatStyle': ['Mechanised warfare'], 'command.structure': 'Centralised' },
    composition: { 'vehicles.Main battle tank': { name: 'T-72' }, 'infantry.Mechanised infantry': {} },
})

describe('inheritance', () => {
    test('a mission stores only what it changes, and never writes into its parent', () => {
        const edited = v({ ...faction, fields: { ...faction.fields, 'command.structure': 'Decentralised' } })
        const ov = diffOverrides(faction, edited)
        expect(ov).toEqual({ fields: { 'command.structure': 'Decentralised' } })
        expect(faction.fields['command.structure']).toBe('Centralised')
        expect(applyOverrides(faction, ov).fields['command.structure']).toBe('Decentralised')
    })
    test('a removal is recorded as null and applied as a delete', () => {
        const edited = v({ ...faction, composition: { 'infantry.Mechanised infantry': {} } })
        const ov = diffOverrides(faction, edited)
        expect(ov.composition).toEqual({ 'vehicles.Main battle tank': null })
        expect(Object.keys(applyOverrides(faction, ov).composition)).toEqual(['infantry.Mechanised infantry'])
    })
    test('faction → campaign → mission resolves in order, with provenance', () => {
        const campaign = { fields: { 'command.structure': 'Balanced' } }
        const mission = { fields: { 'identity.name': 'Takistani 3rd Brigade' } }
        const chain = [diffOverrides(EMPTY_VALUES, faction), campaign, mission]
        const out = resolveChain(chain)
        expect(out.fields['command.structure']).toBe('Balanced')
        expect(out.fields['identity.name']).toBe('Takistani 3rd Brigade')
        const src = sourcesOf([{ level: 'faction', overrides: chain[0] }, { level: 'campaign', overrides: campaign }, { level: 'mission', overrides: mission }])
        expect(src.fields['command.structure']).toBe('campaign')
        expect(src.composition['vehicles.Main battle tank']).toBe('faction')
    })
    test('a historic operation reads the version that was in force on the night', () => {
        const versions = [{ version: 1, publishedAt: '2026-01-01' }, { version: 2, publishedAt: '2026-03-01' }]
        expect(versionAt(versions, new Date('2026-02-01'))?.version).toBe(1)
        expect(versionAt(versions, null)?.version).toBe(2)
        expect(versionAt(versions, new Date('2025-12-01'))).toBeNull()
    })
})

describe('change control', () => {
    test('a significant field needs approval; spelling does not', () => {
        const style = v({ ...faction, fields: { ...faction.fields, 'identity.combatStyle': ['Guerrilla warfare'] } })
        expect(needsApproval(changesBetween(faction, style)).required).toBe(true)
        const spelling = v({ ...faction, fields: { ...faction.fields, 'identity.description': 'Fixed a typo' } })
        expect(needsApproval(changesBetween(faction, spelling)).required).toBe(false)
    })
    test('adding a unit type is significant; editing its details is not', () => {
        const added = v({ ...faction, composition: { ...faction.composition, 'rotary.Attack helicopter': {} } })
        expect(needsApproval(changesBetween(faction, added)).required).toBe(true)
        const detail = v({ ...faction, composition: { ...faction.composition, 'vehicles.Main battle tank': { name: 'T-72B' } } })
        expect(needsApproval(changesBetween(faction, detail)).required).toBe(false)
    })
    test('many small changes measured against the approved version add up', () => {
        const small = v({ ...faction, fields: {
            ...faction.fields, 'quality.discipline': 'High', 'quality.aggression': 'High', 'quality.morale': 'Low',
            'quality.equipment': 'Low', 'quality.coordination': 'Low', 'quality.adaptability': 'Low',
        } })
        const r = needsApproval(changesBetween(faction, small))
        expect(r.required).toBe(true)
        expect(r.reasons[0]).toMatch(/together alter behaviour/)
    })
    test('sanitising drops unknown fields and empties', () => {
        const s = sanitiseValues({ fields: { 'identity.name': ' X ', bogus: 'y', 'identity.combatStyle': ['A', 'A', ''] }, composition: { 'nope.Thing': {}, 'infantry.Custom': { name: 'Z' } } })
        expect(s.fields).toEqual({ 'identity.name': 'X', 'identity.combatStyle': ['A'] })
        expect(Object.keys(s.composition)).toEqual(['infantry.Custom'])
    })
})

describe('intel comparison', () => {
    const src = { fields: {}, composition: { 'vehicles.Main battle tank': 'faction' as const } }
    test('named equipment matches with its level; an absent category is flagged, not judged', () => {
        const r = compareIntel({ title: 'T-72 at the bridge', description: 'Also saw a helicopter overhead' }, faction, src)
        expect(r.matches.some(m => m.category === 'equipment' && m.term === 'T-72' && m.level === 'faction')).toBe(true)
        expect(r.notListed.some(n => n.doctrine === 'Aviation — Rotary Wing')).toBe(true)
    })
})
