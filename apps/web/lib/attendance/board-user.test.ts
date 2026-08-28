/**
 * Two endpoints build this: the board's GET for the whole member list, and the
 * roster route for the one member a write changed. They have to agree, or the
 * same person is named one way on load and another the moment they press a
 * button — which is visible, on the same row, within a second.
 */
import { describe, test, expect } from 'vitest'
import { toBoardUser } from './board-user'

const user = (over: Partial<User> = {}) => ({
    id: 'u-1',
    username: 'mcdongle',
    ...over,
} as User)

describe('toBoardUser', () => {
    test('names a member by rank and name, which is how the unit refers to them', () => {
        expect(toBoardUser(user({
            name: 'McDongle',
            milpac: { currentRank: 'LCPL(S)' } as User['milpac'],
        })).displayName).toBe('LCPL(S) McDongle')
    })

    test('falls back down the chain when there is no milpac yet', () => {
        // A recruit, or a skeleton account imported from CSV.
        expect(toBoardUser(user({ guild: { displayName: 'Dongle' } as User['guild'] })).displayName)
            .toBe('Dongle')
        expect(toBoardUser(user({ globalName: 'dongle' })).displayName).toBe('dongle')
        expect(toBoardUser(user()).displayName).toBe('mcdongle')
    })

    test('a rank with no name behind it does not produce a bare rank', () => {
        // "LCPL(S)" on its own names nobody, so the chain continues.
        expect(toBoardUser(user({
            milpac: { currentRank: 'LCPL(S)' } as User['milpac'],
            guild: { displayName: 'Dongle' } as User['guild'],
        })).displayName).toBe('Dongle')
    })

    test('the last resort is the id the caller looked them up by', () => {
        // The GET keys records by `record.userId`, which may be a Mongo _id
        // rather than the Discord id — labelling with the other one would be a
        // string nobody on that screen recognises.
        expect(toBoardUser(user({ username: undefined }), 'rec-42').displayName).toBe('rec-42')
        expect(toBoardUser(user({ username: undefined })).displayName).toBe('u-1')
    })

    test('prefers the guild avatar, because that is the face people know', () => {
        expect(toBoardUser(user({
            guild: { avatarURL: 'guild.png' } as User['guild'],
            avatarURL: 'global.png',
        })).avatarURL).toBe('guild.png')
        expect(toBoardUser(user({ avatarURL: 'global.png' })).avatarURL).toBe('global.png')
        expect(toBoardUser(user()).avatarURL).toBe('')
    })

    test('the id is always the account id, never the lookup fallback', () => {
        expect(toBoardUser(user(), 'rec-42').id).toBe('u-1')
    })
})
