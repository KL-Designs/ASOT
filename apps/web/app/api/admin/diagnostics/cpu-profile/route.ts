import { NextRequest, NextResponse } from 'next/server'
import { Session } from 'node:inspector'
import { mkdir, writeFile } from 'node:fs/promises'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'
import { DIAGNOSTICS_DIR, cpuProfileFilename, cpuProfilePath, listCpuProfiles } from '@/lib/diagnostics/cpu-profiles'

const MIN_DURATION_S = 5
const MAX_DURATION_S = 1800
const DEFAULT_DURATION_S = 30

type ActiveCapture = {
    filename:  string
    startedAt: string
    durationS: number
}

// In-process capture state. Deliberately not persisted: nothing is written
// until Profiler.stop fires, so a restart mid-capture loses the profile
// anyway — persisting the job record would only let the panel advertise a
// capture that can no longer produce a file. After a restart this reads as
// idle, which is the truth.
let active: ActiveCapture | null = null
let lastError: string | null = null

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

async function authorize() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }

    return { me }
}

/**
 * GET /api/admin/diagnostics/cpu-profile
 *
 * Reports whether a capture is running and lists every profile already on
 * disk. This is what lets the panel survive a page refresh: the capture is
 * tracked server-side rather than in React state, so a reload re-attaches to a
 * run in progress instead of losing the handle to it.
 *
 * J4-Administration only.
 */
export async function GET() {
    const auth = await authorize()
    if (auth.error) return auth.error

    return NextResponse.json({
        active,
        lastError,
        profiles: listCpuProfiles(),
    })
}

/**
 * POST /api/admin/diagnostics/cpu-profile?duration=30
 *
 * Starts a CPU profile capture of the running process for `duration` seconds
 * (5-1800, default 30) using Node's built-in inspector Profiler, and returns
 * 202 immediately — the capture continues in the background and the profile is
 * written to storage/diagnostics/ when it finishes. Poll GET on this route for
 * completion.
 *
 * Returning immediately is the point: holding the request open for the whole
 * capture meant anything longer than a reverse proxy's read timeout failed in
 * the browser while still running on the server, and the panel had no way to
 * tell that from an outright error.
 *
 * Load the resulting file in Chrome DevTools (chrome://inspect -> Profiler tab
 * -> Load) for offline analysis, decoupled from needing a live debugging
 * session open at the exact moment of a stall.
 *
 * J4-Administration only.
 */
export async function POST(req: NextRequest) {
    const auth = await authorize()
    if (auth.error) return auth.error
    const me = auth.me!

    if (active) {
        return NextResponse.json({ error: 'A CPU profile capture is already running' }, { status: 409 })
    }

    const durationParam = Number(req.nextUrl.searchParams.get('duration'))
    const durationS = Number.isFinite(durationParam) && durationParam > 0
        ? Math.min(Math.max(Math.round(durationParam), MIN_DURATION_S), MAX_DURATION_S)
        : DEFAULT_DURATION_S

    // Named at capture start rather than completion so the panel can show the
    // eventual filename while it is still running.
    const startedAt = new Date()
    const capture: ActiveCapture = {
        filename:  cpuProfileFilename(startedAt),
        startedAt: startedAt.toISOString(),
        durationS,
    }
    active = capture
    lastError = null

    void captureProfile(durationS * 1000)
        .then(async (profile) => {
            await mkdir(DIAGNOSTICS_DIR, { recursive: true })
            await writeFile(cpuProfilePath(capture.filename)!, JSON.stringify(profile))

            await logAction({
                action: 'diagnostics.cpu_profile_captured',
                category: 'system',
                performedBy: me._id,
                performedByName: me.name ?? me.globalName ?? me._id,
                target: capture.filename,
                details: { durationS },
            })
        })
        .catch((err) => {
            console.error('[cpu-profile] Capture failed:', err)
            lastError = err instanceof Error ? err.message : 'Profile capture failed'
        })
        .finally(() => {
            active = null
        })

    return NextResponse.json(capture, { status: 202 })
}
