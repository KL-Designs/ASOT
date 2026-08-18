import { describe, test, expect } from 'vitest'
import { parseRow } from './csv-parser'

describe('parseRow', () => {
    test('splits a plain row', () => {
        expect(parseRow('a,b,c')).toEqual(['a', 'b', 'c'])
    })

    // The ORBAT is a grid read by column index, so an empty cell is a
    // position, not an absence.
    test('keeps empty cells, so column positions are preserved', () => {
        expect(parseRow(',,x,,')).toEqual(['', '', 'x', '', ''])
    })

    test('trims surrounding whitespace from each cell', () => {
        expect(parseRow('  a , b  ,c')).toEqual(['a', 'b', 'c'])
    })

    test('a comma inside quotes does not split the cell', () => {
        expect(parseRow('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
    })

    // The regression this file exists for. The old parser toggled on every
    // quote character, so the second quote of an escaped pair re-entered
    // quoted state, the following comma stopped separating cells, and every
    // remaining cell shifted one column left — silently reseating people into
    // other ORBAT sections.
    test('an escaped quote is one literal quote and does not shift later columns', () => {
        expect(parseRow('a,"say ""hi""",b,c')).toEqual(['a', 'say "hi"', 'b', 'c'])
    })

    test('a cell that is only an escaped quote survives', () => {
        expect(parseRow('a,"""",b')).toEqual(['a', '"', 'b'])
    })

    test('a quoted empty cell is still a cell', () => {
        expect(parseRow('a,"",b')).toEqual(['a', '', 'b'])
    })

    test('quotes around a whole field are removed', () => {
        expect(parseRow('"PTE(S) Koda",Rifleman')).toEqual(['PTE(S) Koda', 'Rifleman'])
    })

    test('an unterminated quote takes the rest of the line rather than throwing', () => {
        expect(parseRow('a,"b,c')).toEqual(['a', 'b,c'])
    })

    test('an empty line is one empty cell', () => {
        expect(parseRow('')).toEqual([''])
    })
})
