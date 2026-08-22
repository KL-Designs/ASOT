import { describe, expect, it } from 'vitest'

import { animatedAvatarURL, avatarURL, isAnimatedAvatarURL, stillAvatarURL } from './avatar'

const ID = '1506218564414345386'
const ANIM = `https://cdn.discordapp.com/avatars/${ID}/a_324d6f38e3df4f475e33297a09f04077.gif`
const STATIC = `https://cdn.discordapp.com/avatars/${ID}/324d6f38e3df4f475e33297a09f04077.png`

describe('isAnimatedAvatarURL', () => {
    it('recognises an animated Discord avatar', () => {
        expect(isAnimatedAvatarURL(ANIM)).toBe(true)
        expect(isAnimatedAvatarURL(`${ANIM}?size=128`)).toBe(true)
    })

    it('rejects a static avatar', () => {
        expect(isAnimatedAvatarURL(STATIC)).toBe(false)
    })

    it('rejects absent values', () => {
        expect(isAnimatedAvatarURL(undefined)).toBe(false)
        expect(isAnimatedAvatarURL(null)).toBe(false)
        expect(isAnimatedAvatarURL('')).toBe(false)
    })

    /*
       These URLs are interpolated into a CSS `url("…")` by the roster card, so
       the guard is a security boundary and not only a format check: anything
       that could close the quote, close the url(), or start a new declaration
       must not be reported as animated.
    */
    it('rejects anything that is not a Discord avatar URL', () => {
        expect(isAnimatedAvatarURL('https://evil.test/x.gif')).toBe(false)
        expect(isAnimatedAvatarURL('https://cdn.discordapp.com.evil.test/avatars/1/a_ff.gif')).toBe(false)
        expect(isAnimatedAvatarURL('http://cdn.discordapp.com/avatars/1/a_ff.gif')).toBe(false)
        expect(isAnimatedAvatarURL(`${ANIM}");background:url("https://evil.test/x.gif`)).toBe(false)
        expect(isAnimatedAvatarURL(`https://cdn.discordapp.com/avatars/${ID}/a_ff.gif") no-repeat`)).toBe(false)
        expect(isAnimatedAvatarURL(`https://cdn.discordapp.com/avatars/${ID}/../../a_ffffffff.gif`)).toBe(false)
    })
})

describe('stillAvatarURL', () => {
    it('swaps an animated avatar to its first frame', () => {
        expect(stillAvatarURL(ANIM)).toBe(`https://cdn.discordapp.com/avatars/${ID}/a_324d6f38e3df4f475e33297a09f04077.png?size=128`)
    })

    it('honours an explicit size', () => {
        expect(stillAvatarURL(ANIM, 64)).toMatch(/\.png\?size=64$/)
    })

    it('replaces rather than appends an existing size', () => {
        expect(stillAvatarURL(`${ANIM}?size=1024`)).toMatch(/\.png\?size=128$/)
    })

    it('leaves anything else untouched', () => {
        expect(stillAvatarURL(STATIC)).toBe(STATIC)
        expect(stillAvatarURL(undefined)).toBeUndefined()
        expect(stillAvatarURL(null)).toBeNull()
    })
})

describe('animatedAvatarURL', () => {
    it('bounds the animation to a size', () => {
        // The unbounded original of this very avatar is 1.76 MB; the point of
        // the size cap is that a hover can afford to fetch it.
        expect(animatedAvatarURL(ANIM)).toBe(`https://cdn.discordapp.com/avatars/${ID}/a_324d6f38e3df4f475e33297a09f04077.gif?size=128`)
        expect(animatedAvatarURL(ANIM, 256)).toMatch(/\.gif\?size=256$/)
    })

    it('is null when there is nothing to animate', () => {
        expect(animatedAvatarURL(STATIC)).toBeNull()
        expect(animatedAvatarURL(undefined)).toBeNull()
    })
})

describe('avatarURL still agrees with the helpers', () => {
    it('builds a .gif for an a_ hash that the helpers then recognise', () => {
        const built = avatarURL(ID, 'a_324d6f38e3df4f475e33297a09f04077')
        expect(isAnimatedAvatarURL(built)).toBe(true)
        expect(stillAvatarURL(built)).toMatch(/\.png\?size=128$/)
    })

    it('builds a .png for a normal hash, which is left alone', () => {
        const built = avatarURL(ID, '324d6f38e3df4f475e33297a09f04077')
        expect(isAnimatedAvatarURL(built)).toBe(false)
        expect(stillAvatarURL(built)).toBe(built)
    })
})
