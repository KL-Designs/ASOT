import { describe, expect, test } from 'vitest'
import { buildCountdownPost, countdownAction, countdownDate, fingerprint, withDefaults } from './selection-countdown'

const now = new Date('2026-10-21T00:00:00Z')
const next = { at: new Date('2026-11-01T09:00:00Z'), instanceId: 'a', instanceRef: 'SEL-002' }

describe('countdownDate', () => {
    test('uses the next Selection Session 1', () => {
        expect(countdownDate({}, next, now)).toEqual(next.at)
    })
    test('a future override wins', () => {
        const overrideAt = new Date('2026-12-01T09:00:00Z')
        expect(countdownDate({ overrideAt }, next, now)).toEqual(overrideAt)
    })
    test('an expired override is ignored, never shown', () => {
        expect(countdownDate({ overrideAt: new Date('2026-10-01T00:00:00Z') }, null, now)).toBeNull()
    })
})

describe('buildCountdownPost', () => {
    test('no Selection says To be confirmed', () => {
        const post = buildCountdownPost(withDefaults({}), null, 'https://asot.test')
        expect(post.embeds[0].description).toContain('To be confirmed')
    })
    test('a date renders as Discord timestamps, and a relative image is made absolute', () => {
        const post = buildCountdownPost(withDefaults({ imageUrl: '/uploads/x.png' }), next.at, 'https://asot.test/')
        expect(post.embeds[0].description).toContain(`<t:${next.at.getTime() / 1000}:R>`)
        expect(post.embeds[0].image?.url).toBe('https://asot.test/uploads/x.png')
    })
})

describe('countdownAction', () => {
    const post = buildCountdownPost(withDefaults({}), next.at, 'https://asot.test')
    const fp = fingerprint('chan', post)

    test('off by default', () => {
        expect(countdownAction(withDefaults({}), 'chan', fp)).toBe('off')
    })
    test('no channel is reported, not posted', () => {
        expect(countdownAction(withDefaults({ enabled: true }), '', fp)).toBe('unconfigured')
    })
    test('first time posts; afterwards edits only when something changed', () => {
        expect(countdownAction(withDefaults({ enabled: true }), 'chan', fp)).toBe('post')
        const posted = withDefaults({ enabled: true, messageId: 'm', postedChannelId: 'chan', postedFingerprint: fp })
        expect(countdownAction(posted, 'chan', fp)).toBe('unchanged')
        expect(countdownAction(posted, 'chan', 'other')).toBe('edit')
    })
    test('moving to a new channel posts there instead of editing the old message', () => {
        const posted = withDefaults({ enabled: true, messageId: 'm', postedChannelId: 'old', postedFingerprint: fp })
        expect(countdownAction(posted, 'chan', fp)).toBe('post')
    })
})
