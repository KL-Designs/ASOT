/**
 * Lightweight, always-on production diagnostics for event-loop stalls.
 *
 * Plain JavaScript (not TypeScript): this module is imported directly by
 * apps/web/server.mjs, which runs via `node server.mjs` with no build step
 * and therefore cannot import a .ts file. It's also imported by ordinary
 * Next.js API routes, which resolve a plain .mjs file with no special config.
 */

import { monitorEventLoopDelay } from 'node:perf_hooks'

// server.mjs imports this module directly via Node's native ESM loader, while
// Next.js API routes import it through webpack, which inlines a *separate copy*
// into each compiled route's bundle. Backing the registry with `globalThis`
// (same pattern as lib/mongo.ts's cached client) makes all of those copies
// share one Map instead of silently tracking into instances nobody reads.
const inFlight = (globalThis.__asotInFlight ??= new Map())

// Multiple module instances can independently reach for id `0`, so derive
// keys from a per-instance random tag plus a local counter to avoid collisions.
const instanceTag = Math.random().toString(36).slice(2, 8)
let nextId = 0

/**
 * Registers `label` as currently running. Returns a function that removes
 * it — call that function exactly once, when the work finishes (success,
 * failure, or the connection closing — whichever comes first).
 */
export function registerInFlight(label) {
    const id = `${instanceTag}:${nextId++}`
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
    // Guard against starting more than one histogram/interval if this function
    // is ever called from more than one module instance (e.g. transiently
    // during HMR in dev, or a future bundled consumer).
    if (globalThis.__asotWatchdogStarted) return
    globalThis.__asotWatchdogStarted = true

    const threshold = thresholdMs ?? Number(process.env.EVENT_LOOP_LAG_THRESHOLD_MS || 1000)
    const interval = checkIntervalMs ?? 2000

    const histogram = monitorEventLoopDelay({ resolution: 20 })
    histogram.enable()

    // Long-lived connections (SSE streams, etc.) can sit in the registry for
    // hours. Listing every one of those individually on a stall warning buries
    // the actual short-lived culprit under a wall of text, so entries under
    // 60s are listed with their duration and everything older is collapsed
    // into a single count.
    const LONG_LIVED_MS = 60_000

    setInterval(() => {
        const maxMs = histogram.max / 1e6
        if (maxMs > threshold) {
            const now = Date.now()
            const recent = []
            let longLivedCount = 0
            for (const { label, startedAt } of inFlight.values()) {
                const elapsed = now - startedAt
                if (elapsed < LONG_LIVED_MS) recent.push(`${label}(${elapsed}ms)`)
                else longLivedCount++
            }
            const parts = [...recent]
            if (longLivedCount > 0) parts.push(`+${longLivedCount} long-lived`)
            console.warn(`⚠ [event-loop] lag=${Math.round(maxMs)}ms in-flight=[${parts.join(', ')}]`)
        }
        histogram.reset()
    }, interval)

    console.log(`[event-loop] Watchdog started (threshold=${threshold}ms, check every ${interval}ms)`)
}
