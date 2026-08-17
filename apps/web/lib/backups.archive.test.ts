/**
 * The compatibility contract between the download archive and the uploader.
 *
 * A downloaded zip must be one this app can restore from — `applyUploadedZip()`
 * looks for `db-source/`, `gallery/` and `uploads/` at the archive root, and
 * `safeExtractZip()` REFUSES symlink entries outright (they are a path
 * traversal vector in an untrusted upload). So emitting a symlink would produce
 * a disaster-recovery zip this app itself rejects — discovered, inevitably, on
 * the day someone needs it.
 *
 * The download streams `restic dump --archive tar` straight into the zip, so
 * every decision about what an entry becomes lives in zipEntryNameFor(). That
 * is pure, so it is tested directly here; the end-to-end shape (a real archive
 * that really re-uploads) is covered by backups.roundtrip.test.ts against a
 * real restic.
 */
import { describe, test, expect } from 'vitest'
import { zipEntryNameFor } from './backups'

describe('zipEntryNameFor', () => {
    test('prefixes files with the archive root the uploader expects', () => {
        expect(zipEntryNameFor('db-source', { name: 'manifest.json', type: 'file' }))
            .toBe('db-source/manifest.json')
        expect(zipEntryNameFor('db-source', { name: 'db/users.ejson', type: 'file' }))
            .toBe('db-source/db/users.ejson')
        expect(zipEntryNameFor('gallery', { name: 'sub/pic.jpg', type: 'file' }))
            .toBe('gallery/sub/pic.jpg')
        expect(zipEntryNameFor('uploads', { name: 'doc.pdf', type: 'file' }))
            .toBe('uploads/doc.pdf')
    })

    test('keeps directories, so an empty one still round-trips', () => {
        expect(zipEntryNameFor('gallery', { name: 'empty/', type: 'directory' }))
            .toBe('gallery/empty/')
    })

    test('drops symlinks and hardlinks — safeExtractZip refuses them', () => {
        expect(zipEntryNameFor('gallery', { name: 'shortcut.jpg', type: 'symlink' })).toBeNull()
        expect(zipEntryNameFor('gallery', { name: 'hard.jpg', type: 'link' })).toBeNull()
    })

    test('drops anything that is not a plain file or directory', () => {
        // restic will not normally emit these, but a zip entry built from one
        // would be meaningless at best and a restore hazard at worst.
        for (const type of ['character-device', 'block-device', 'fifo', 'pax-header', null, undefined]) {
            expect(zipEntryNameFor('gallery', { name: 'odd', type })).toBeNull()
        }
    })
})
