/**
 * Pins the shape of the download archive, which is the contract the whole
 * download → upload disaster-recovery round trip rests on: `applyUploadedZip()`
 * finds a backup by looking for `db-source/`, `gallery/` and `uploads/` at the
 * archive root, so anything that changes those names silently turns a
 * downloaded zip into one this app refuses to ingest.
 *
 * No restic and no restored snapshot needed — createBackupArchiveStream() takes
 * plain directories, which is why it is split out from openDownloadZipStream().
 *
 * The symlink case is the reason this file exists. The staged copy that
 * streaming replaced dropped symlinks as a side effect of copyDirRecursive()
 * refusing to follow them; archiver instead writes a real zip symlink entry,
 * and safeExtractZip() refuses those outright — so without the filter, this
 * app would produce recovery zips it cannot itself restore, and nobody would
 * find out until the day they needed one.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import unzipper from 'unzipper'

import { createBackupArchiveStream, safeExtractZip } from './backups'

let root: string
let dbDumpRoot: string
let galleryDir: string
let uploadsDir: string
let symlinkCreated = false

const collect = async (): Promise<Buffer> => {
    const archive = createBackupArchiveStream({ dbDumpRoot, galleryDir, uploadsDir })
    const chunks: Buffer[] = []
    archive.on('data', c => chunks.push(c as Buffer))
    const ended = new Promise<void>((res, rej) => { archive.on('end', () => res()); archive.on('error', rej) })
    await archive.finalize()
    await ended
    return Buffer.concat(chunks)
}

beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'asot-archive-test-'))
    dbDumpRoot = join(root, 'dump')
    galleryDir = join(root, 'gallery-src')
    uploadsDir = join(root, 'uploads-src')

    mkdirSync(join(dbDumpRoot, 'db'), { recursive: true })
    writeFileSync(join(dbDumpRoot, 'manifest.json'), JSON.stringify({ version: 1, collections: ['users'] }))
    writeFileSync(join(dbDumpRoot, 'db', 'users.ejson'), '{"_id":1}\n')

    mkdirSync(join(galleryDir, 'sub'), { recursive: true })
    writeFileSync(join(galleryDir, 'sub', 'pic.jpg'), 'jpeg-bytes')
    mkdirSync(uploadsDir, { recursive: true })
    writeFileSync(join(uploadsDir, 'doc.pdf'), 'pdf-bytes')

    // Needs Developer Mode or elevation on Windows; the assertions that depend
    // on it are skipped rather than failed when it isn't available.
    try {
        symlinkSync(join(galleryDir, 'sub', 'pic.jpg'), join(galleryDir, 'shortcut.jpg'), 'file')
        symlinkCreated = true
    } catch { /* symlinks unavailable on this host */ }
})

afterAll(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => {})
})

describe('createBackupArchiveStream', () => {
    test('puts db-source/, gallery/ and uploads/ at the archive root', async () => {
        const { files } = await unzipper.Open.buffer(await collect())
        const paths = files.map(f => f.path)

        expect(paths).toContain('db-source/manifest.json')
        expect(paths).toContain('db-source/db/users.ejson')
        expect(paths).toContain('gallery/sub/pic.jpg')
        expect(paths).toContain('uploads/doc.pdf')

        // Nothing may escape those three roots — applyUploadedZip() would
        // ignore it, so it would be silently absent from a restore.
        for (const p of paths) {
            expect(p).toMatch(/^(db-source|gallery|uploads)\//)
        }
    })

    test('omits symlinks rather than writing zip symlink entries', async () => {
        const { files } = await unzipper.Open.buffer(await collect())

        for (const entry of files) {
            const unixMode = (entry.externalFileAttributes >>> 16) & 0xFFFF
            expect((unixMode & 0xF000) === 0xA000).toBe(false)
        }

        if (symlinkCreated) {
            expect(files.map(f => f.path)).not.toContain('gallery/shortcut.jpg')
        }
    })

    test('the archive it produces is one safeExtractZip accepts', async () => {
        const zipPath = join(root, 'built.zip')
        writeFileSync(zipPath, await collect())

        const dest = join(root, 'extracted')
        await safeExtractZip(zipPath, dest)

        // Precisely the three existsSync() checks applyUploadedZip() makes.
        expect(existsSync(join(dest, 'db-source'))).toBe(true)
        expect(existsSync(join(dest, 'gallery'))).toBe(true)
        expect(existsSync(join(dest, 'uploads'))).toBe(true)
        expect(existsSync(join(dest, 'db-source', 'manifest.json'))).toBe(true)
    })
})
