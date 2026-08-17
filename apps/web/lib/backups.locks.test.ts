/**
 * Regression coverage for the two faults that wedged the hourly backup at
 * "Pruning old backups…" (see docs/superpowers/specs/2026-08-17-backup-hardening-design.md):
 *
 *  1. restic only clears stale locks in its `unlock` command — NEVER while
 *     acquiring one. A lock left behind by a container that died mid-run
 *     records that container's hostname and PID, so no later container can
 *     ever prove the process is gone, and every subsequent `forget --prune`
 *     (the only exclusive-lock operation here) blocks on it. `--retry-lock 5m`
 *     turned that instant failure into a five-minute hang.
 *
 *  2. Force Reset only rewrote the status file. The in-process guard stayed
 *     held by the operation still sitting on the lock, so the next backup was
 *     accepted by the route, silently skipped by runAllBackups(), and nothing
 *     ran.
 *
 * Unlike backups.test.ts, this file fakes restic. It has to: restic seals a
 * lock's timestamp inside a payload encrypted with the repository's master
 * key, and staleness is judged from that timestamp — so a genuinely stale
 * lock cannot be fabricated in a throwaway test repo at all. What is worth
 * pinning is this module's contract with restic (clear stale locks before
 * taking an exclusive one; kill the child on cancel), and that is exactly
 * what the fake below observes.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { mkdtempSync, mkdirSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// Shared with the vi.mock factory below, which is hoisted above every import —
// vi.hoisted is what makes this state reachable from inside it.
const restic = vi.hoisted(() => ({
    calls: [] as { repo: string; sub: string; args: string[] }[],
    /** Status file contents observed part-way through the operation. */
    statuses: [] as { startedAt?: string; stage?: string; planLength?: number }[],
    /** A lock left behind by a dead container: only `unlock` clears it. */
    locked: true,
    /** Makes `unlock` itself fail, to prove a backup doesn't hinge on it. */
    unlockFails: false,
    /** Subcommand that never returns until its child is killed. */
    hangOn: null as string | null,
}))

vi.mock('child_process', async importOriginal => {
    const actual = await importOriginal<typeof import('child_process')>()
    const { mkdirSync: mkdir, writeFileSync } = await import('fs')
    const { join: joinPath } = await import('path')
    const { promisify } = await import('util')

    // args always arrive as ['--retry-lock', '5m', <subcommand>, ...] — read
    // the subcommand positionally rather than assuming an index, so this
    // keeps working if another global flag is ever added ahead of it.
    const subcommandOf = (args: string[]): string => {
        const rest = [...args]
        while (rest.length > 0 && rest[0].startsWith('-')) {
            if (rest.shift() === '--retry-lock') rest.shift()
        }
        return rest[0] ?? ''
    }

    type Outcome = { ok: true; stdout: string } | { ok: false; code: number; stderr: string }

    const { readFileSync } = await import('fs')

    const respond = (repo: string, args: string[]): Outcome => {
        const sub = subcommandOf(args)
        restic.calls.push({ repo, sub, args })

        // Snapshot the status file as the operation passes through each stage.
        // Reading it from in here is the only way to see the intermediate
        // states — by the time the call returns, the status is already 'idle'.
        try {
            const root = process.env.BACKUPS_STORAGE_ROOT ?? ''
            const raw = readFileSync(joinPath(root, 'backup-meta', '.status.json'), 'utf-8')
            const s = JSON.parse(raw) as { startedAt?: string; stage?: string; plan?: { id: string }[] }
            restic.statuses.push({ startedAt: s.startedAt, stage: s.stage, planLength: s.plan?.length })
        } catch { /* not written yet */ }

        switch (sub) {
            case 'init':
                mkdir(repo, { recursive: true })
                writeFileSync(joinPath(repo, 'config'), '{"version":2}', 'utf-8')
                return { ok: true, stdout: '' }

            case 'unlock':
                if (restic.unlockFails) return { ok: false, code: 1, stderr: 'Fatal: unable to list locks' }
                restic.locked = false
                return { ok: true, stdout: 'successfully removed 1 locks\n' }

            case 'backup':
                return { ok: true, stdout: JSON.stringify({ message_type: 'summary', snapshot_id: 'deadbeef' }) + '\n' }

            case 'forget':
                // The real message, verbatim from the repo that caused this bug.
                if (restic.locked) {
                    return {
                        ok: false,
                        code: 1,
                        stderr: 'unable to create lock in backend: repository is already locked by PID 94 on 6894f68008d3 by root (UID 0, GID 0)',
                    }
                }
                return { ok: true, stdout: '' }

            case 'snapshots':
                return { ok: true, stdout: '[]' }

            default:
                return { ok: true, stdout: '' }
        }
    }

    const toError = (outcome: Extract<Outcome, { ok: false }>) =>
        Object.assign(new Error(`Command failed: restic`), { code: outcome.code, stdout: '', stderr: outcome.stderr })

    function fakeExecFile(file: string, args: string[], options: { env?: NodeJS.ProcessEnv }, callback: (err: Error | null, stdout: string, stderr: string) => void) {
        const repo = options?.env?.RESTIC_REPOSITORY ?? ''
        const sub = subcommandOf(args)
        let settled = false

        const finish = (err: Error | null, stdout: string, stderr: string) => {
            if (settled) return
            settled = true
            callback(err, stdout, stderr)
        }

        // Hanging subcommands record the call, then wait to be killed —
        // standing in for restic blocked on a lock it can never acquire.
        if (restic.hangOn === sub) {
            restic.calls.push({ repo, sub, args })
            return {
                pid: 4242,
                kill: () => {
                    finish(Object.assign(new Error('Command failed: restic'), { code: null, killed: true, signal: 'SIGTERM', stdout: '', stderr: '' }), '', '')
                    return true
                },
            }
        }

        const outcome = respond(repo, args)
        // Real execFile never calls back synchronously; the production code
        // registers the returned child immediately after this returns, and
        // would miss the deregistration if the callback beat it.
        setImmediate(() => {
            if (outcome.ok) finish(null, outcome.stdout, '')
            else finish(toError(outcome), '', outcome.stderr)
        })
        return { pid: 4242, kill: () => true }
    }

    // Keeps the fake honest under promisify(execFile) too, which resolves with
    // { stdout, stderr } rather than the raw callback arguments.
    Object.defineProperty(fakeExecFile, promisify.custom, {
        value: (file: string, args: string[], options: { env?: NodeJS.ProcessEnv }) =>
            new Promise((resolvePromise, reject) => {
                const outcome = respond(options?.env?.RESTIC_REPOSITORY ?? '', args)
                setImmediate(() => {
                    if (outcome.ok) resolvePromise({ stdout: outcome.stdout, stderr: '' })
                    else reject(toError(outcome))
                })
            }),
    })

    return { ...actual, execFile: fakeExecFile }
})

let mongod: MongoMemoryServer
let storageRoot: string

type BackupsModule = typeof import('./backups')
let backups: BackupsModule

beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    process.env.MONGO_URI = mongod.getUri()
    process.env.MONGO_DB = 'asot-lock-test'

    storageRoot = mkdtempSync(join(tmpdir(), 'asot-backup-lock-test-'))
    mkdirSync(join(storageRoot, 'gallery'), { recursive: true })
    mkdirSync(join(storageRoot, 'uploads'), { recursive: true })
    process.env.BACKUPS_STORAGE_ROOT = storageRoot

    // lib/backups.ts reads BACKUPS_STORAGE_ROOT at module load.
    backups = await import('./backups')
})

afterAll(async () => {
    await mongod.stop()
    await rm(storageRoot, { recursive: true, force: true }).catch(() => {})
})

beforeEach(() => {
    restic.calls.length = 0
    restic.statuses.length = 0
    restic.locked = true
    restic.unlockFails = false
    restic.hangOn = null
    // resticEnv() throws without it, before any restic call is reached.
    process.env.RESTIC_PASSWORD = 'test-password'
})

describe('stale repository locks', () => {
    test('a backup completes even when the repo carries a lock left by a dead container', async () => {
        await expect(backups.runDbBackup()).resolves.toBeUndefined()

        const status = await backups.readStatus()
        expect(status.state).toBe('idle')
        expect(status.error).toBeUndefined()

        // The ordering is the fix: prune's exclusive lock is unobtainable
        // until the orphaned one is cleared, so `unlock` must come first.
        const sequence = restic.calls.map(c => c.sub)
        expect(sequence).toContain('unlock')
        expect(sequence.indexOf('unlock')).toBeLessThan(sequence.indexOf('forget'))
    })

    test('clears only the locks restic itself judges stale, never --remove-all', async () => {
        await backups.runDbBackup()

        const unlocks = restic.calls.filter(c => c.sub === 'unlock')
        expect(unlocks.length).toBeGreaterThan(0)
        // `unlock --remove-all` deletes live locks too — it would let a second
        // process stomp on a prune that is genuinely still running. Plain
        // `unlock` removes only locks older than restic's own refresh window.
        for (const call of unlocks) expect(call.args).not.toContain('--remove-all')
    })

    test('a failing unlock does not fail the backup by itself', async () => {
        restic.unlockFails = true
        restic.locked = false // nothing actually blocking prune this time

        await expect(backups.runDbBackup()).resolves.toBeUndefined()
        expect((await backups.readStatus()).state).toBe('idle')
    })
})

describe('cancelOperation', () => {
    // Force Reset used to rewrite the status file and nothing else: the
    // operation stayed alive holding the in-process guard, so every retry was
    // accepted by the route and then silently skipped. Aborting for real is
    // what makes the button honest.
    test('kills the in-flight restic child and frees the next backup to run', async () => {
        restic.hangOn = 'forget'

        const wedged = backups.runAllBackups()

        // Wait for the run to actually reach the hanging prune.
        await vi.waitFor(() => expect(restic.calls.some(c => c.sub === 'forget')).toBe(true))

        const { aborted } = await backups.cancelOperation()
        expect(aborted).toBeGreaterThan(0)

        await expect(wedged).resolves.toBeUndefined()

        const status = await backups.readStatus()
        expect(status.state).toBe('idle')

        // The real proof: a fresh backup runs instead of being swallowed by a
        // guard the cancelled operation never gave back.
        restic.hangOn = null
        restic.calls.length = 0
        await backups.runAllBackups()
        expect(restic.calls.some(c => c.sub === 'backup')).toBe(true)
        expect((await backups.readStatus()).state).toBe('idle')
    })

    test('a cancelled operation cannot overwrite the status of the one that follows it', async () => {
        restic.hangOn = 'forget'
        const wedged = backups.runAllBackups()
        await vi.waitFor(() => expect(restic.calls.some(c => c.sub === 'forget')).toBe(true))

        await backups.cancelOperation()
        restic.hangOn = null

        // Started before the cancelled run has finished unwinding — its catch
        // and finally must not touch this one's status or guard.
        const fresh = backups.runAllBackups()
        await Promise.all([wedged, fresh])

        const status = await backups.readStatus()
        expect(status.state).toBe('idle')
        expect(status.error).toBeUndefined()
    })
})

describe('operation progress', () => {
    // The progress bar restarted several times per backup because every stage
    // wrote a fresh startedAt, resetting the elapsed time it is derived from.
    // The clock belongs to the operation, not to any one stage.
    test('holds a single startedAt across every stage', async () => {
        await backups.runAllBackups()

        const stamps = restic.statuses.map(s => s.startedAt).filter(Boolean)
        expect(stamps.length).toBeGreaterThan(1)          // several stages were observed
        expect(new Set(stamps).size).toBe(1)              // ...all carrying the same start time
    })

    test('publishes the stages it will run, and advances through them in order', async () => {
        await backups.runAllBackups()

        // runAllBackups declares all five: dump, store, prune, media, prune.
        for (const s of restic.statuses) expect(s.planLength).toBe(5)

        // Collapse consecutive repeats first: a single stage can make several
        // restic calls (db-prune runs `unlock` and then `forget`), so the raw
        // sequence repeats without going backwards.
        const seen = restic.statuses.map(s => s.stage).filter(Boolean) as string[]
        const visited = seen.filter((id, i) => id !== seen[i - 1])

        const order = ['db-dump', 'db-store', 'db-prune', 'media-store', 'media-prune']
        expect(visited.every(id => order.includes(id))).toBe(true)
        // Each stage entered once, in plan order. The old status messages could
        // not express this at all: 'Pruning old backups…' was written verbatim
        // by both the database and the media half, so they were indistinguishable.
        expect(new Set(visited).size).toBe(visited.length)
        const positions = visited.map(id => order.indexOf(id))
        expect([...positions]).toEqual([...positions].sort((a, b) => a - b))
    })
})
