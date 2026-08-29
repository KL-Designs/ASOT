import { describe, test, expect } from 'vitest'
import {
    MAX_ITEMS_PER_SUBMISSION, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS,
    checkItemCount, checkFile, kindForMime,
} from './limits'

describe('the ceilings themselves', () => {
    test('match the values the spec fixed', () => {
        expect(MAX_ITEMS_PER_SUBMISSION).toBe(20)
        expect(MAX_IMAGE_BYTES).toBe(20 * 1024 * 1024)
        expect(MAX_VIDEO_BYTES).toBe(500 * 1024 * 1024)
        expect(MAX_VIDEO_SECONDS).toBe(300)
    })
})

describe('checkItemCount', () => {
    test('accepts up to and including the limit', () => {
        expect(checkItemCount(1)).toBeNull()
        expect(checkItemCount(20)).toBeNull()
    })

    test('refuses one past it, and says the number', () => {
        const failure = checkItemCount(21)
        expect(failure?.code).toBe('count')
        expect(failure?.message).toContain('20')
    })
})

describe('kindForMime', () => {
    test('classifies what we accept', () => {
        expect(kindForMime('image/jpeg')).toBe('image')
        expect(kindForMime('image/png')).toBe('image')
        expect(kindForMime('image/webp')).toBe('image')
        expect(kindForMime('video/mp4')).toBe('video')
        expect(kindForMime('video/quicktime')).toBe('video')
        expect(kindForMime('video/webm')).toBe('video')
    })

    test('refuses what we do not', () => {
        expect(kindForMime('application/pdf')).toBeNull()
        expect(kindForMime('image/svg+xml')).toBeNull()   // scriptable, never an upload
        expect(kindForMime('')).toBeNull()
    })

    test('is case-insensitive — browsers are inconsistent about this', () => {
        expect(kindForMime('IMAGE/JPEG')).toBe('image')
    })
})

describe('checkFile', () => {
    test('an image at the ceiling passes, one byte over does not', () => {
        expect(checkFile({ mime: 'image/jpeg', bytes: MAX_IMAGE_BYTES })).toBeNull()
        expect(checkFile({ mime: 'image/jpeg', bytes: MAX_IMAGE_BYTES + 1 })?.code).toBe('size')
    })

    test('a video at the ceiling passes, one byte over does not', () => {
        expect(checkFile({ mime: 'video/mp4', bytes: MAX_VIDEO_BYTES, durationSec: 10 })).toBeNull()
        expect(checkFile({ mime: 'video/mp4', bytes: MAX_VIDEO_BYTES + 1, durationSec: 10 })?.code).toBe('size')
    })

    test('a video at exactly five minutes passes, one second over does not', () => {
        expect(checkFile({ mime: 'video/mp4', bytes: 1000, durationSec: MAX_VIDEO_SECONDS })).toBeNull()
        expect(checkFile({ mime: 'video/mp4', bytes: 1000, durationSec: MAX_VIDEO_SECONDS + 1 })?.code).toBe('duration')
    })

    test('an unreadable duration is not a refusal — ffprobe checks it again server-side', () => {
        expect(checkFile({ mime: 'video/mp4', bytes: 1000 })).toBeNull()
    })

    test('duration is not checked on an image', () => {
        expect(checkFile({ mime: 'image/png', bytes: 1000, durationSec: 9999 })).toBeNull()
    })

    test('an unaccepted type is refused before its size is looked at', () => {
        expect(checkFile({ mime: 'application/zip', bytes: 1 })?.code).toBe('type')
    })

    test('a zero-byte file is refused', () => {
        expect(checkFile({ mime: 'image/jpeg', bytes: 0 })?.code).toBe('size')
    })
})
