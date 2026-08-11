# Event-Loop Stall Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a console-only, always-on watchdog that detects Node event-loop stalls in production and logs which request or background job was running when the stall happened, per `docs/superpowers/specs/2026-08-11-event-loop-diagnostics-design.md`.

**Architecture:** One new shared module holds an in-memory "what's currently running" registry plus a `perf_hooks`-based lag monitor; `server.mjs` and one API route call into it at every point that starts a request or a periodic background job.

**Tech Stack:** Node's built-in `perf_hooks` module (no new dependency). `apps/web/server.mjs` is a plain ESM `.mjs` file run directly via `node server.mjs` in production — it is **not** processed by Next.js's TypeScript/webpack toolchain, so it cannot `import` a `.ts` file. This is a hard constraint the design spec didn't call out explicitly: the shared module must therefore be plain JavaScript (`apps/web/lib/diagnostics.mjs`, not `.ts`), even though everything else under `apps/web/lib/` is TypeScript. Next.js's bundler can still import a `.mjs` file from a TypeScript API route with no special config, so the same file serves both consumers.

## Global Constraints

- No new npm dependency — `perf_hooks` (specifically `monitorEventLoopDelay`) is a Node built-in.
- Console-only output — no file writes, no external service. Log format must stay a single greppable line.
- Near-zero overhead: the watchdog's periodic check must be O(1) relative to in-flight count and must not itself block the event loop (no synchronous heavy work in the `setInterval` callback).
- Default lag threshold: 1000ms, overridable via the `EVENT_LOOP_LAG_THRESHOLD_MS` env var. Default check interval: 2000ms.
- `histogram.max`/`min`/`mean` from `perf_hooks.monitorEventLoopDelay()` are expressed in **nanoseconds** — always divide by `1e6` before comparing against a millisecond threshold or logging a millisecond value.
- No automated test suite exists in this repo (`apps/web/CLAUDE.md`: "No test suite exists"). Verification is `npx tsc --noEmit -p tsconfig.json` (from `apps/web`, for the one TypeScript file touched) plus manual runs described in each task.

---

### Task 1: `apps/web/lib/diagnostics.mjs` — the watchdog module

**Files:**
- Create: `apps/web/lib/diagnostics.mjs`

**Interfaces:**
- Produces: `startEventLoopWatchdog(thresholdMs?: number, checkIntervalMs?: number): void`, `trackJob(label: string, fn: () => Promise<any>): Promise<any>`, `registerInFlight(label: string): () => void` (returns a deregister function — for callers that can't cleanly wrap a single promise, e.g. the raw HTTP request handler in Task 2, which deregisters on a `res` event rather than a promise resolving). All three are consumed by Task 2.

- [ ] **Step 1: Write the module**

```js
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
```

- [ ] **Step 2: Manually verify the module in isolation**

There's no test suite, so verify with a throwaway script — write it to the scratchpad, run it, then delete it (do not commit it).

Write `<scratchpad>/verify-diagnostics.mjs`:

```js
import { startEventLoopWatchdog, trackJob, registerInFlight } from '/d/Projects/ASOT/apps/web/lib/diagnostics.mjs'

startEventLoopWatchdog(50, 200) // low thresholds so this finishes fast

async function blockFor(ms) {
    const end = Date.now() + ms
    while (Date.now() < end) { /* busy-wait: deliberately blocks the event loop */ }
}

trackJob('test:block-A', () => blockFor(300))

const deregister = registerInFlight('test:manual-B')
setTimeout(() => {
    blockFor(200) // block again while test:manual-B is still registered
    deregister()
}, 50)

setTimeout(() => process.exit(0), 1000)
```

Run: `node <scratchpad-path>/verify-diagnostics.mjs` (use the actual scratchpad path; adjust the import path to match).
Expected: at least one `⚠ [event-loop] lag=...ms in-flight=[...]` line prints, and the `in-flight=[...]` portion names `test:block-A` and/or `test:manual-B` with a plausible elapsed-ms value (not empty, not garbage). Then delete the scratch script — it's throwaway, not part of the plan's file list.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/diagnostics.mjs
git commit -m "Add event-loop-lag watchdog and in-flight job/request tracking"
```

---

### Task 2: Wire the watchdog into `server.mjs` and the TeamSpeak-cache route

**Files:**
- Modify: `apps/web/server.mjs`
- Modify: `apps/web/app/api/cron/teamspeak-cache/route.ts`
- Modify: `apps/web/docs/map/h-lib-types-components.md` (add the new module)

**Interfaces:**
- Consumes: `startEventLoopWatchdog`, `trackJob`, `registerInFlight` from Task 1's `apps/web/lib/diagnostics.mjs`.

- [ ] **Step 1: Import the module in `server.mjs`**

Add to the import block near the top of `apps/web/server.mjs` (after the existing `import { WebSocketServer } from 'ws'` line):

```js
import { startEventLoopWatchdog, trackJob, registerInFlight } from './lib/diagnostics.mjs'
```

- [ ] **Step 2: Start the watchdog and wrap the HTTP request handler**

Find this block (currently around `server.mjs:581-587`):

```js
const handle = app.getRequestHandler()

...

const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true))
})
```

Replace the `createServer(...)` call with:

```js
const httpServer = createServer((req, res) => {
    const deregister = registerInFlight(`${req.method} ${req.url}`)
    let cleaned = false
    const cleanup = () => { if (!cleaned) { cleaned = true; deregister() } }
    res.on('finish', cleanup)
    res.on('close', cleanup)
    handle(req, res, parse(req.url, true))
})
```

(The `cleaned` guard exists because both `finish` and `close` can fire for the same response — the deregister function itself is idempotent via `Map.delete`, but this avoids relying on that.)

Then find the `httpServer.listen(...)` call (currently around `server.mjs:685-688`) and add the watchdog start immediately before it:

```js
startEventLoopWatchdog()

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`> Next.js ready on http://0.0.0.0:${port}`)
    console.log(`> Collab WebSocket on ws://0.0.0.0:${port}/collab`)
})
```

- [ ] **Step 3: Wrap the hourly image-cleanup job**

Find (currently around `server.mjs:682-683`):

```js
cleanupOperationImages().catch(e => console.error('[image-cleanup] Error:', e.message))
setInterval(() => cleanupOperationImages().catch(e => console.error('[image-cleanup] Error:', e.message)), 60 * 60 * 1000)
```

Replace with:

```js
function runImageCleanup() {
    return trackJob('cron:image-cleanup', () => cleanupOperationImages())
        .catch(e => console.error('[image-cleanup] Error:', e.message))
}

runImageCleanup()
setInterval(runImageCleanup, 60 * 60 * 1000)
```

- [ ] **Step 4: Wrap all seven self-fetch cron trigger functions**

Each of these functions (currently scattered through `server.mjs:692-830`) makes a `fetch()` call back into the same process's own HTTP server, then logs its result. Wrap each function's existing try/catch body in `trackJob(...)`, keeping every line of existing logic (URLs, headers, log messages) unchanged — only the wrapping changes. Replace each function in place with:

```js
async function triggerCalendarRemindersCron() {
    await trackJob('cron:calendar-reminders', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/calendar-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            if (!res.ok) {
                console.error(`[cron/calendar-reminders] HTTP ${res.status} — check CRON_SECRET`)
                return
            }
            const data = await res.json()
            console.log(`[cron/calendar-reminders] tick — fired=${data.fired ?? 0}`)
        } catch (e) {
            console.error('[cron/calendar-reminders] Error:', e.message)
        }
    })
}
```

```js
async function triggerTaskRemindersCron() {
    await trackJob('cron:task-reminders', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/task-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            if (!res.ok) {
                console.error(`[cron/task-reminders] HTTP ${res.status} — check CRON_SECRET`)
                return
            }
            const data = await res.json()
            const { remindersFired, overdueFired, escalationsFired } = data
            if (remindersFired + overdueFired + escalationsFired > 0) {
                console.log(`[cron/task-reminders] tick — reminders=${remindersFired} overdue=${overdueFired} escalations=${escalationsFired}`)
            }
        } catch (e) {
            console.error('[cron/task-reminders] Error:', e.message)
        }
    })
}
```

```js
async function triggerOperationsCron() {
    await trackJob('cron:operations', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/operations`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            if (!res.ok) {
                console.error(`[cron/operations] HTTP ${res.status} — check CRON_SECRET`)
                return
            }
            const data = await res.json()
            const { rsvpOpened, rsvpClosed, activatedOps, confirmationOpened, confirmationClosed } = data
            const summary = `rsvpOpened=${rsvpOpened} rsvpClosed=${rsvpClosed} activatedOps=${activatedOps} confirmationOpened=${confirmationOpened} confirmationClosed=${confirmationClosed}`
            console.log(`[cron/operations] tick — ${summary}`)
        } catch (e) {
            console.error('[cron/operations] Error:', e.message)
        }
    })
}
```

```js
async function triggerDevCheckEscalationCron() {
    await trackJob('cron:dev-check-escalation', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/dev-check-escalation`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            if (!res.ok) {
                console.error(`[cron/dev-check-escalation] HTTP ${res.status} — check CRON_SECRET`)
                return
            }
            const data = await res.json()
            if (data.escalated > 0 || data.errors > 0) {
                console.log(`[cron/dev-check-escalation] tick — escalated=${data.escalated} errors=${data.errors}`)
            }
        } catch (e) {
            console.error('[cron/dev-check-escalation] Error:', e.message)
        }
    })
}
```

```js
async function triggerScheduledSnapshot() {
    await trackJob('cron:snapshots', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/snapshots`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            const data = await res.json()
            console.log('[snapshots] Scheduled snapshot triggered:', data)
        } catch (e) {
            console.error('[snapshots] Scheduled snapshot error:', e.message)
        }
    })
}
```

```js
async function triggerTsSnapshot() {
    await trackJob('cron:teamspeak-snapshots', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/teamspeak-snapshots`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            const data = await res.json()
            console.log('[teamspeak-snapshots] Daily snapshot triggered:', data)
        } catch (e) {
            console.error('[teamspeak-snapshots] Error:', e.message)
        }
    })
}
```

```js
async function triggerTsCacheRefresh() {
    await trackJob('cron:teamspeak-cache', async () => {
        try {
            const res = await fetch(`http://localhost:${port}/api/cron/teamspeak-cache`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
            const data = await res.json()
            console.log('[teamspeak-cache] Refresh triggered:', data)
        } catch (e) {
            console.error('[teamspeak-cache] Error:', e.message)
        }
    })
}
```

Do not change any `setInterval(...)`/`setTimeout(...)`/immediate-invocation lines that follow each function definition (e.g. `setInterval(triggerCalendarRemindersCron, 60 * 1000)`, `triggerCalendarRemindersCron()`) — only the function bodies change.

- [ ] **Step 5: Wrap the fire-and-forget TeamSpeak cache refresh in its route**

`triggerTsCacheRefresh` above only tracks the HTTP round trip to `/api/cron/teamspeak-cache` — but that route doesn't `await` the actual cache refresh, so the round trip returns almost instantly while the real work continues in the background, untracked. Fix that in the route itself.

Read `apps/web/app/api/cron/teamspeak-cache/route.ts` first (reproduced here as the starting point):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { refreshOfflineCache, isOfflineRefreshing } from '@/lib/teamspeak/cache'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * GET /api/cron/teamspeak-cache
 * Triggers a background refresh of the TeamSpeak offline client cache.
 * Called every 15 minutes by server.mjs.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (isOfflineRefreshing()) {
        return NextResponse.json({ skipped: true, reason: 'Already refreshing' })
    }

    refreshOfflineCache().catch(e => console.error('[cron/teamspeak-cache] Error:', e.message))
    return NextResponse.json({ message: 'Cache refresh started' })
}
```

Replace it with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { refreshOfflineCache, isOfflineRefreshing } from '@/lib/teamspeak/cache'
import { verifyCronSecret } from '@/lib/cron-auth'
import { trackJob } from '@/lib/diagnostics.mjs'

/**
 * GET /api/cron/teamspeak-cache
 * Triggers a background refresh of the TeamSpeak offline client cache.
 * Called every 15 minutes by server.mjs.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (isOfflineRefreshing()) {
        return NextResponse.json({ skipped: true, reason: 'Already refreshing' })
    }

    trackJob('cron:teamspeak-cache-refresh', () => refreshOfflineCache())
        .catch(e => console.error('[cron/teamspeak-cache] Error:', e.message))
    return NextResponse.json({ message: 'Cache refresh started' })
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: no errors. If TypeScript complains about resolving `@/lib/diagnostics.mjs` (a plain-JS module with no type declarations), add a minimal ambient declaration at `apps/web/types/diagnostics.d.ts`:

```ts
declare module '@/lib/diagnostics.mjs' {
    export function startEventLoopWatchdog(thresholdMs?: number, checkIntervalMs?: number): void
    export function trackJob<T>(label: string, fn: () => Promise<T>): Promise<T>
    export function registerInFlight(label: string): () => void
}
```

(Only add this file if the typecheck step actually fails without it — Next.js's `allowJs`/module resolution may already handle a plain `.mjs` import without complaint, in which case skip this and don't create an unnecessary file.)

Manual verification: this requires a reachable MongoDB (`server.mjs` connects to Mongo unconditionally at startup) and the `.env` values `apps/web/CLAUDE.md` documents. If those are available in your environment:
1. From `apps/web`, run `npm run dev` (or `npm start` after `npm run build`, closer to production) and confirm the log line `[event-loop] Watchdog started (threshold=1000ms, check every 2000ms)` appears at boot.
2. Temporarily add a deliberate blocking line inside any one API route (e.g. a `for` loop that busy-waits 1500ms) to confirm the watchdog logs a lag warning naming that request's `METHOD /path` label with a plausible duration, then remove the temporary blocking line — do not commit it.
3. Confirm normal requests and the 1-minute cron ticks continue logging as before (nothing about existing log lines should have changed, only new `⚠ [event-loop]` lines added when relevant).

If no reachable MongoDB/`.env` is available in your environment, skip the live run and instead do a careful manual trace of the diff against this task's code blocks (confirm every wrapped function's non-`trackJob` logic is byte-identical to the original, and that the `httpServer` wrapper correctly deregisters on both `finish` and `close`) — state clearly in your report which verification path you took.

- [ ] **Step 7: Update the docs map**

Edit `apps/web/docs/map/h-lib-types-components.md` — add an entry for `lib/diagnostics.mjs` (event-loop-lag watchdog + in-flight job/request tracking, consumed by `server.mjs` and `app/api/cron/teamspeak-cache/route.ts`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/server.mjs apps/web/app/api/cron/teamspeak-cache/route.ts apps/web/docs/map/h-lib-types-components.md
git commit -m "Wire event-loop watchdog into server.mjs cron triggers, request handling, and TeamSpeak cache refresh"
```

(If Step 6 added `apps/web/types/diagnostics.d.ts`, include it in this commit too.)

---

## Self-Review Notes

**Spec coverage:** Goal 1 (detect + log stalls) and Goal 4 (near-zero overhead, permanent) — Task 1's `startEventLoopWatchdog`. Goal 2 (name the in-flight culprit) — Task 1's `trackJob`/`registerInFlight` plus Task 2's wiring into every request and every periodic job, including the one fire-and-forget background job (`refreshOfflineCache`) that HTTP-level tracking alone would have missed. Goal 3 (console-only) — no file writes anywhere in either task. Non-goals (no CPU profiling, no dashboard, no fix to the suspected culprits) are respected — nothing in either task touches the cron routes' actual query logic or adds a UI.

**Deviation from the spec, called out explicitly:** the spec named the new module `apps/web/lib/diagnostics.ts`; this plan uses `apps/web/lib/diagnostics.mjs` instead, because `server.mjs` runs via plain `node server.mjs` with no TypeScript transform and cannot import a `.ts` file — a technical constraint the spec didn't account for. The behavior, exports, and call sites are otherwise unchanged from the spec's design.

**Type consistency:** `trackJob(label, fn)` and `registerInFlight(label)` signatures are identical between Task 1 (definition) and every Task 2 call site. Log format (`⚠ [event-loop] lag=Xms in-flight=[...]`) is defined once in Task 1 and not reproduced elsewhere, so there's nothing to drift.
