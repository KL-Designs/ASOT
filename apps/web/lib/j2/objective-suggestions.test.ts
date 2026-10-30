import { describe, expect, test } from 'vitest'
import { matchesObjectiveSearch, objectiveFromTicket, sanitiseObjective } from './objective-suggestions'

describe('sanitiseObjective', () => {
    test('needs a name and an overview', () => {
        expect(sanitiseObjective({ overview: 'x' }).error).toMatch(/name/)
        expect(sanitiseObjective({ name: 'x' }).error).toMatch(/overview/)
    })

    test('trims, and blanks what was not given', () => {
        expect(sanitiseObjective({ name: ' HVT capture ', overview: ' Take him alive. ' })).toEqual({
            fields: { name: 'HVT capture', overview: 'Take him alive.', intel: '', linkedIntel: '', comments: '' },
            error: null,
        })
    })

    test('an edit only touches what was sent', () => {
        expect(sanitiseObjective({ intel: 'A defector talks.' }, true)).toEqual({ fields: { intel: 'A defector talks.' }, error: null })
    })

    test('an edit cannot blank the name', () => {
        expect(sanitiseObjective({ name: ' ' }, true).error).toMatch(/name/)
    })

    test('holds each field to its limit', () => {
        expect(sanitiseObjective({ name: 'n'.repeat(500), overview: 'o' }).fields.name).toHaveLength(120)
    })
})

describe('objectiveFromTicket', () => {
    test('maps the ticket onto the five fields', () => {
        expect(objectiveFromTicket({
            title: 'Downed pilot', description: 'Recover the pilot before the enemy does.',
            objectiveIntel: 'A mayday on guard frequency.', objectiveLinkedIntel: 'The pilot knows the SAM site.', objectiveComments: 'Night only.',
        })).toEqual({
            name: 'Downed pilot', overview: 'Recover the pilot before the enemy does.',
            intel: 'A mayday on guard frequency.', linkedIntel: 'The pilot knows the SAM site.', comments: 'Night only.',
        })
    })
})

describe('matchesObjectiveSearch', () => {
    const o = { name: 'Downed pilot', overview: 'Recover the pilot.', intel: 'A mayday call.', linkedIntel: 'SAM site', comments: '' }

    test('looks in every field', () => {
        expect(matchesObjectiveSearch(o, 'mayday')).toBe(true)
        expect(matchesObjectiveSearch(o, 'sam')).toBe(true)
        expect(matchesObjectiveSearch(o, 'convoy')).toBe(false)
        expect(matchesObjectiveSearch(o, '')).toBe(true)
    })
})
