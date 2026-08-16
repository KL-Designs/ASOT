/**
 * Unit coverage for the CPU-profile file store.
 *
 * These are the parts of the diagnostics feature that can go wrong silently:
 * the filename the capture route writes has to be the exact shape the download
 * route is willing to serve (they drifted apart as two hand-copied regexes
 * before this module existed), and the listing has to survive a storage tree
 * that does not exist yet — a fresh clone has no storage/diagnostics until the
 * first capture runs.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let storageRoot: string

// Imported lazily: the module resolves its storage root at load time, so
// DIAGNOSTICS_STORAGE_ROOT has to be set before the first import. Same
// constraint lib/backups.test.ts works around the same way.
type CpuProfilesModule = typeof import('./cpu-profiles')
let cpuProfiles: CpuProfilesModule

beforeAll(async () => {
    storageRoot = mkdtempSync(join(tmpdir(), 'asot-diagnostics-test-'))
    process.env.DIAGNOSTICS_STORAGE_ROOT = storageRoot
    cpuProfiles = await import('./cpu-profiles')
})

afterAll(() => {
    rmSync(storageRoot, { recursive: true, force: true })
})

beforeEach(() => {
    rmSync(join(storageRoot, 'diagnostics'), { recursive: true, force: true })
})

function writeProfile(filename: string, contents = '{}') {
    mkdirSync(join(storageRoot, 'diagnostics'), { recursive: true })
    writeFileSync(join(storageRoot, 'diagnostics', filename), contents, 'utf-8')
}

describe('cpuProfileFilename', () => {
    test('produces a name the download route will accept', () => {
        const filename = cpuProfiles.cpuProfileFilename(new Date('2026-08-17T04:12:33.901Z'))

        expect(filename).toBe('cpu-2026-08-17T04-12-33-901Z.cpuprofile')
        expect(cpuProfiles.isValidCpuProfileFilename(filename)).toBe(true)
    })
})

describe('isValidCpuProfileFilename', () => {
    test('rejects path traversal and foreign files', () => {
        expect(cpuProfiles.isValidCpuProfileFilename('../../../etc/passwd')).toBe(false)
        expect(cpuProfiles.isValidCpuProfileFilename('cpu-2026-08-17T04-12-33-901Z.cpuprofile/../x')).toBe(false)
        expect(cpuProfiles.isValidCpuProfileFilename('notes.txt')).toBe(false)
        expect(cpuProfiles.isValidCpuProfileFilename('cpu-nonsense.cpuprofile')).toBe(false)
    })
})

describe('listCpuProfiles', () => {
    test('returns an empty list when no capture has ever run', () => {
        expect(cpuProfiles.listCpuProfiles()).toEqual([])
    })

    test('returns newest first with size and decoded capture time', () => {
        writeProfile('cpu-2026-08-17T04-12-33-901Z.cpuprofile', '{"a":1}')
        writeProfile('cpu-2026-08-18T09-00-00-000Z.cpuprofile', '{"bb":22}')

        const listed = cpuProfiles.listCpuProfiles()

        expect(listed.map(p => p.filename)).toEqual([
            'cpu-2026-08-18T09-00-00-000Z.cpuprofile',
            'cpu-2026-08-17T04-12-33-901Z.cpuprofile',
        ])
        expect(listed[0].capturedAt).toBe('2026-08-18T09:00:00.000Z')
        expect(listed[1].sizeBytes).toBe(7)
    })

    test('ignores files that are not captured profiles', () => {
        writeProfile('cpu-2026-08-17T04-12-33-901Z.cpuprofile')
        writeProfile('README.md')
        writeProfile('cpu-partial.cpuprofile')

        expect(cpuProfiles.listCpuProfiles().map(p => p.filename)).toEqual([
            'cpu-2026-08-17T04-12-33-901Z.cpuprofile',
        ])
    })
})

describe('cpuProfilePath', () => {
    test('refuses to build a path for an invalid filename', () => {
        expect(cpuProfiles.cpuProfilePath('../../.env')).toBeNull()
    })

    test('resolves a valid filename inside the diagnostics directory', () => {
        expect(cpuProfiles.cpuProfilePath('cpu-2026-08-17T04-12-33-901Z.cpuprofile'))
            .toBe(join(storageRoot, 'diagnostics', 'cpu-2026-08-17T04-12-33-901Z.cpuprofile'))
    })
})
