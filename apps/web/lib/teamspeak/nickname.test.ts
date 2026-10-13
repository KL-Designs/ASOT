import { describe, expect, test } from 'vitest'
import { nicknameCore, nicknamesMatch } from './nickname'

describe('nicknameCore', () => {
    test('takes a bracketed rank off the front', () => {
        expect(nicknameCore('[CPL] Smith')).toBe('smith')
    })

    test('takes an unbracketed rank off the front, dotted or not', () => {
        expect(nicknameCore('CPL Smith')).toBe('smith')
        expect(nicknameCore('CPL. Smith')).toBe('smith')
    })

    test('takes bracketed groups off wherever they are', () => {
        expect(nicknameCore('[CPL] Smith [1-1 A]')).toBe('smith')
        expect(nicknameCore('Smith (AFK)')).toBe('smith')
    })

    test('keeps a first word that is not a rank — the bug this replaces', () => {
        expect(nicknameCore('John Smith')).toBe('john smith')
        expect(nicknameCore('Koda')).toBe('koda')
    })

    test('does not reduce a one-word name that reads as a rank to nothing', () => {
        expect(nicknameCore('CPL')).toBe('cpl')
    })
})

describe('nicknamesMatch', () => {
    test('matches with or without the square brackets', () => {
        expect(nicknamesMatch('[CPL] Smith', '[CPL] Smith')).toBe(true)
        expect(nicknamesMatch('[CPL] Smith', 'Smith')).toBe(true)
        expect(nicknamesMatch('[CPL] Smith', 'CPL Smith')).toBe(true)
        expect(nicknamesMatch('Smith', '[PTE] Smith [1-2 B]')).toBe(true)
    })

    test('matches a two-word name with no rank on either side', () => {
        expect(nicknamesMatch('John Smith', 'John Smith')).toBe(true)
    })

    test('matches when one name is inside the other', () => {
        expect(nicknamesMatch('[CPL] Smith', 'Smith | Away')).toBe(true)
    })

    test('does not match different people', () => {
        expect(nicknamesMatch('[CPL] Smith', '[CPL] Jones')).toBe(false)
    })

    test('a nickname that is nothing but brackets matches nobody', () => {
        expect(nicknamesMatch('[CPL] Smith', '[AFK]')).toBe(false)
        expect(nicknamesMatch('[CPL]', '[CPL] Smith')).toBe(false)
    })

    test('a one or two letter name does not match by containment', () => {
        expect(nicknamesMatch('Al', 'Alan')).toBe(false)
        expect(nicknamesMatch('Al', 'Al')).toBe(true)
    })
})
