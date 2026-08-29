import { describe, test, expect } from 'vitest'
import { parseEmbedUrl, embedIframeSrc } from './embeds'

describe('parseEmbedUrl — YouTube', () => {
    test.each([
        ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ])('%s -> %s', (url, id) => {
        expect(parseEmbedUrl(url)).toEqual({
            provider: 'youtube', kind: 'video', id,
            canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
        })
    })

    test('ignores the noise a share link carries', () => {
        // A timestamp, a playlist and a tracking parameter must not end up in the id.
        const parsed = parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=42&si=abc123')
        expect(parsed?.id).toBe('dQw4w9WgXcQ')
    })

    test('a missing v parameter is not a video', () => {
        expect(parseEmbedUrl('https://www.youtube.com/watch?list=PL123')).toBeNull()
    })
})

describe('parseEmbedUrl — Twitch', () => {
    test('a VOD is kind video', () => {
        expect(parseEmbedUrl('https://www.twitch.tv/videos/1234567890')).toEqual({
            provider: 'twitch', kind: 'video', id: '1234567890',
            canonicalUrl: 'https://www.twitch.tv/videos/1234567890',
        })
    })

    test.each([
        'https://www.twitch.tv/asotmilsim/clip/PluckyCrunchyOtterKappa',
        'https://clips.twitch.tv/PluckyCrunchyOtterKappa',
    ])('a clip is kind clip — %s', url => {
        expect(parseEmbedUrl(url)).toEqual({
            provider: 'twitch', kind: 'clip', id: 'PluckyCrunchyOtterKappa',
            canonicalUrl: 'https://clips.twitch.tv/PluckyCrunchyOtterKappa',
        })
    })

    test('a bare channel is not a clip', () => {
        expect(parseEmbedUrl('https://www.twitch.tv/asotmilsim')).toBeNull()
    })
})

describe('parseEmbedUrl — refusals', () => {
    test.each([
        '',
        '   ',
        'not a url at all',
        'https://vimeo.com/123456',
        'https://streamable.com/abcdef',
        'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
        'javascript:alert(1)',
    ])('refuses %s', input => {
        expect(parseEmbedUrl(input)).toBeNull()
    })

    test('tolerates a pasted url with surrounding whitespace', () => {
        expect(parseEmbedUrl('  https://youtu.be/dQw4w9WgXcQ  ')?.id).toBe('dQw4w9WgXcQ')
    })
})

describe('embedIframeSrc', () => {
    test('YouTube', () => {
        expect(embedIframeSrc({ provider: 'youtube', kind: 'video', id: 'abc' }, 'asotmilsim.com'))
            .toBe('https://www.youtube.com/embed/abc')
    })

    test('a Twitch VOD carries the parent host', () => {
        expect(embedIframeSrc({ provider: 'twitch', kind: 'video', id: '123' }, 'asotmilsim.com'))
            .toBe('https://player.twitch.tv/?video=123&parent=asotmilsim.com&autoplay=false')
    })

    test('a Twitch clip uses the clip player', () => {
        expect(embedIframeSrc({ provider: 'twitch', kind: 'clip', id: 'Plucky' }, 'localhost'))
            .toBe('https://clips.twitch.tv/embed?clip=Plucky&parent=localhost&autoplay=false')
    })
})
