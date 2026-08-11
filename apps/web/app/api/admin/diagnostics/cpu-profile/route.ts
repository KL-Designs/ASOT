import { NextRequest, NextResponse } from 'next/server'
import { Session } from 'node:inspector'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'

const MIN_DURATION_S = 5
const MAX_DURATION_S = 120
const DEFAULT_DURATION_S = 30

// Guards against overlapping captures corrupting each other — this is a
// single-process, single-instance concern, so an in-process flag is enough.
let profilingInProgress = false

function captureProfile(durationMs: number) {
    return new Promise<object>((resolveProfile, reject) => {
        const session = new Session()
        session.connect()

        session.post('Profiler.enable', (enableErr) => {
            if (enableErr) { session.disconnect(); return reject(enableErr) }

            session.post('Profiler.start', (startErr) => {
                if (startErr) { session.disconnect(); return reject(startErr) }

                setTimeout(() => {
                    session.post('Profiler.stop', (stopErr, result) => {
                        session.disconnect()
                        if (stopErr) return reject(stopErr)
                        resolveProfile(result.profile)
                    })
                }, durationMs)
            })
        })
    })
}

/**
 * POST /api/admin/diagnostics/cpu-profile?duration=30
 *
 * Captures a CPU profile of the running process for `duration` seconds
 * (5-120, default 30) using Node's built-in inspector Profiler, and writes
 * it to storage/diagnostics/cpu-<timestamp>.cpuprofile — storage/ is
 * bind-mounted to the host (see docker-compose.yml), so the file lands
 * directly on the host filesystem with no extra retrieval step. Load it
 * later in Chrome DevTools (chrome://inspect -> Profiler tab -> Load) for
 * offline analysis, decoupled from needing a live debugging session open
 * at the exact moment of a stall.
 *
 * J4-Administration only.
 */
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (profilingInProgress) {
        return NextResponse.json({ error: 'A CPU profile capture is already running' }, { status: 409 })
    }

    const durationParam = Number(req.nextUrl.searchParams.get('duration'))
    const durationS = Number.isFinite(durationParam) && durationParam > 0
        ? Math.min(Math.max(Math.round(durationParam), MIN_DURATION_S), MAX_DURATION_S)
        : DEFAULT_DURATION_S

    profilingInProgress = true
    try {
        const profile = await captureProfile(durationS * 1000)

        const dir = resolve(process.cwd(), '../../storage/diagnostics')
        mkdirSync(dir, { recursive: true })
        const filename = `cpu-${new Date().toISOString().replace(/[:.]/g, '-')}.cpuprofile`
        writeFileSync(resolve(dir, filename), JSON.stringify(profile))

        await logAction({
            action: 'diagnostics.cpu_profile_captured',
            category: 'system',
            performedBy: me._id,
            performedByName: me.name ?? me.globalName ?? me._id,
            target: filename,
            details: { durationS },
        })

        return NextResponse.json({ filename, durationS, path: `storage/diagnostics/${filename}` })
    } catch (err) {
        console.error('[cpu-profile] Capture failed:', err)
        return NextResponse.json({ error: 'Profile capture failed' }, { status: 500 })
    } finally {
        profilingInProgress = false
    }
}
