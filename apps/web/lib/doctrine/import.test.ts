import { describe, expect, test } from 'vitest'
import { EMPTY_VALUES } from './schema'
import { parseDoctrineText } from './import'

describe('parseDoctrineText', () => {
    test('labelled answers fill the matching questions, with options spelt as the schema spells them', () => {
        const { values, matched, unmatched } = parseDoctrineText([
            '1. Faction Identity',
            'Faction name: Takistani Army',
            'Primary combat style: mechanised warfare, Defensive warfare',
            '2. Command and Control',
            'Command structure: centralised',
            'Strengths: Numbers',
            'and artillery',
        ].join('\n'), EMPTY_VALUES)
        expect(values.fields['identity.name']).toBe('Takistani Army')
        expect(values.fields['identity.combatStyle']).toEqual(['Mechanised warfare', 'Defensive warfare'])
        expect(values.fields['command.structure']).toBe('Centralised')
        expect(values.fields['identity.strengths']).toBe('Numbers\nand artillery')
        expect(matched).toContain('Faction name')
        expect(unmatched).toEqual([])
    })

    test('a shared label goes to the question in the section above it', () => {
        const { values } = parseDoctrineText('Force Quality and Characteristics\nCoordination: High\n7. Offensive Behaviour\nCoordination: Low', EMPTY_VALUES)
        expect(values.fields['quality.coordination']).toBe('High')
        expect(values.fields['offence.coordination']).toBe('Low')
    })

    test('N/A ticks Not applicable, notes go to the question above, and unknown lines come back', () => {
        const { values, unmatched } = parseDoctrineText('Era / time period: N/A\nGeneral description: Conscript army\nAdditional notes: Poorly paid\nFavourite colour: green', EMPTY_VALUES)
        expect(values.na['identity.era']).toBe(true)
        expect(values.fields['identity.era']).toBeUndefined()
        expect(values.notes['identity.description']).toBe('Poorly paid')
        expect(unmatched).toEqual(['Favourite colour: green'])
    })

    test('force composition reads category lines, and merging keeps what was there', () => {
        const base = { ...EMPTY_VALUES, fields: { 'identity.name': 'Kept' } }
        const { values } = parseDoctrineText('4. Force Composition\nInfantry: Rifle squads; Snipers', base)
        expect(Object.keys(values.composition).length).toBe(2)
        expect(Object.keys(values.composition).every(k => k.startsWith('infantry.'))).toBe(true)
        expect(values.fields['identity.name']).toBe('Kept')
        expect(base.composition).toEqual({})
    })

    test('a numbered answer is not mistaken for a heading', () => {
        const { values } = parseDoctrineText('1. Faction name: Takistani Army', EMPTY_VALUES)
        expect(values.fields['identity.name']).toBe('Takistani Army')
    })
})
