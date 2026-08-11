/**
 * Lightweight, always-on production diagnostics for event-loop stalls.
 *
 * Plain JavaScript (not TypeScript): this module is imported directly by
 * apps/web/server.mjs, which runs via `node server.mjs` with no build step
 * and therefore cannot import a .ts file. It's also imported by ordinary
 * Next.js API routes, which resolve a plain .mjs file with no special config.
 */

import { monitorEventLoopDelay } from 'node:perf_hooks'

const inFlight = new Map()
let nextId = 0

/**
 * Registers `label` as currently running. Returns a function that removes
 * it — call that function exactly once, when the work finishes (success,
 * failure, or the connection closing — whichever comes first).
 */
export function registerInFlight(label) {
    const id = nextId++
    inFlight.set(id, { label, startedAt: Date.now() })
    return () => { inFlight.delete(id) }
}

/**
 * Wraps an async function so it's visible in the in-flight registry for
 * the duration of its execution, regardless of how it resolves.
 */
export function trackJob(label, fn) {
    const deregister = registerInFlight(label)
    return fn().finally(deregister)
}

/**
 * Starts a periodic event-loop-lag check. When a sample exceeds
 * `thresholdMs`, logs a warning naming every currently in-flight
 * request/job and how long each has been running.
 *
 * @param {number} [thresholdMs] Defaults to EVENT_LOOP_LAG_THRESHOLD_MS env var, or 1000.
 * @param {number} [checkIntervalMs] Defaults to 2000.
 */
export function startEventLoopWatchdog(thresholdMs, checkIntervalMs) {
    const threshold = thresholdMs ?? Number(process.env.EVENT_LOOP_LAG_THRESHOLD_MS || 1000)
    const interval = checkIntervalMs ?? 2000

    const histogram = monitorEventLoopDelay({ resolution: 20 })
    histogram.enable()

    setInterval(() => {
        const maxMs = histogram.max / 1e6
        if (maxMs > threshold) {
            const snapshot = [...inFlight.values()]
                .map(({ label, startedAt }) => `${label}(${Date.now() - startedAt}ms)`)
                .join(', ')
            console.warn(`⚠ [event-loop] lag=${Math.round(maxMs)}ms in-flight=[${snapshot}]`)
        }
        histogram.reset()
    }, interval)

    console.log(`[event-loop] Watchdog started (threshold=${threshold}ms, check every ${interval}ms)`)
}
