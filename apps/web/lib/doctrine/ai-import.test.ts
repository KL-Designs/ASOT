import { describe, expect, test } from 'vitest'
import { EMPTY_VALUES } from './schema'
import { doctrineSchemaForPrompt, extractJson, mergeAiDoctrine } from './ai-import'

describe('AI doctrine import', () => {
    test('the prompt lists every question key', () => {
        const p = doctrineSchemaForPrompt()
        expect(p).toContain('identity.name | text | Faction name')
        expect(p).toContain('command.structure | select')
        expect(p).toContain('infantry | Infantry |')
    })
    test('the JSON comes out of a fenced reply', () => {
        expect(extractJson('Here:\n```json\n{"fields":{"identity.name":"X"}}\n```')).toEqual({ fields: { 'identity.name': 'X' } })
        expect(extractJson('no json')).toBeNull()
    })
    test('only known questions survive, and the builder keeps what it had', () => {
        const base = { ...EMPTY_VALUES, fields: { 'identity.era': '1980s' }, indicators: [{ observed: 'a', interpretation: '', capability: '', reliability: '', notes: '' }] }
        const r = mergeAiDoctrine({
            fields: { 'identity.name': 'Takistani Army', 'made.up': 'x', 'identity.combatStyle': ['Mechanised warfare'] },
            na: { 'recon.assets': true },
            composition: { 'vehicles.Main battle tank': { name: 'T-72' } },
            indicators: [{ observed: 'BMPs on roads', interpretation: 'Mech push' }],
            images: { 'identity.description': ['/api/upload/image?id=1&ext=png'] },
        }, base)
        expect(r.values.fields).toEqual({ 'identity.era': '1980s', 'identity.name': 'Takistani Army', 'identity.combatStyle': ['Mechanised warfare'] })
        expect(r.values.na['recon.assets']).toBe(true)
        expect(r.values.composition['vehicles.Main battle tank']).toEqual({ name: 'T-72' })
        expect(r.values.indicators).toHaveLength(2)
        expect(r.pictures).toBe(1)
        expect(r.matched).toContain('Faction name')
        expect(r.matched).not.toContain('made.up')
    })
})
