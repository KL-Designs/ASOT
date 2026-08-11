# Event-Loop Stall Diagnostics

**Date:** 2026-08-11
**Status:** Approved for planning

## Problem

The production website (`apps/web`, a single Node process co-hosting Next.js and a Hocuspocus WebSocket server via `server.mjs`, run via `docker-compose` with `restart: unless-stopped`) becomes completely unresponsive to all requests for up to 30 seconds, roughly every few minutes. No APM or profiler is deployed, and there's no SSH/log access from this environment — the only way to observe production is for the operator to run `docker logs web` and share output. A static read of the code surfaced plausible culprits (sequential per-item Mongo queries in the 1-minute cron routes, large `.toArray()` result sets, synchronous `@napi-rs/canvas` calls) but nothing confirmed — the goal here is to instrument production so the real cause shows up in the logs next time it happens, not to guess further from source.

## Goals

1. Detect and log every time the Node event loop stalls past a threshold, with a timestamp and duration.
2. At the moment of a stall, log which request(s) and/or periodic background job(s) were in flight — so the log line points at a specific suspect instead of just proving something blocked.
3. Console-only output (`docker logs web`) — no new file writes, no external service.
4. Near-zero overhead so it's safe to leave running permanently in production, not just during an active investigation.

## Non-goals

- No CPU stack-trace capture (`node:inspector`'s Profiler API, triggered on threshold breach, would pinpoint the exact call site but needs to write a `.cpuprofile` file — out of scope now that console-only was chosen; a natural fast-follow if this pass doesn't pinpoint the cause).
- No dashboard/UI for viewing lag history — logs only.
- No changes to the suspected culprit code paths themselves (cron routes, canvas generation) — this is observation only, not a fix.

## Design

### `apps/web/lib/diagnostics.ts` (new)

Two exports, both plain functions with no dependencies beyond Node's built-in `perf_hooks`:

```ts
export function startEventLoopWatchdog(thresholdMs?: number, checkIntervalMs?: number): void
export function trackJob<T>(label: string, fn: () => Promise<T>): Promise<T>
```

- A module-level `Map<string, { label: string; startedAt: number }>` holds everything currently "in flight" — both HTTP requests and background jobs — keyed by a unique id per call.
- `trackJob(label, fn)` generates an id, inserts `{ label, startedAt: Date.now() }`, awaits `fn()`, and removes the entry in a `finally` (so it's removed on success, throw, or rejection alike).
- `startEventLoopWatchdog()` creates one `perf_hooks.monitorEventLoopDelay({ resolution: 20 })` histogram, calls `.enable()`, and on a `setInterval` (default every `checkIntervalMs` = 2000ms) reads `histogram.max`, compares it against `thresholdMs` (default 1000, overridable via the `EVENT_LOOP_LAG_THRESHOLD_MS` env var), and if exceeded: logs a warning line with the lag duration and a snapshot of the in-flight map (each entry's label and elapsed `Date.now() - startedAt`), then calls `histogram.reset()`.
- Log format (single line, greppable): `⚠ [event-loop] lag=8421ms in-flight=[cron:task-reminders(7930ms)]` (or `in-flight=[]` if nothing was registered — meaning the block happened somewhere not yet wrapped, itself a useful signal).

### Wiring in `apps/web/server.mjs`

- Call `startEventLoopWatchdog()` once, near the other startup calls.
- Wrap the raw HTTP handler (`server.mjs:586-587`, currently `createServer((req, res) => handle(req, res, parse(req.url, true)))`): before calling `handle`, register an entry keyed by a generated id with label `` `${req.method} ${req.url}` ``; remove it via `res.on('finish', ...)` and `res.on('close', ...)` (both, so aborted connections can't leak an entry — use a guard so double-removal is harmless). This does not go through `trackJob` directly since it isn't awaiting a single promise for the request lifecycle; it's the same map, used directly with matching insert/remove semantics.
- Wrap the body of each of the six `setInterval`-driven cron trigger functions (`triggerCalendarRemindersCron`, `triggerTaskRemindersCron`, `triggerOperationsCron`, `triggerDevCheckEscalationCron`, `triggerScheduledSnapshot`, `triggerTsSnapshot`, `triggerTsCacheRefresh`) and the hourly `cleanupOperationImages()` call in `trackJob('cron:<name>', () => ...)`, using a short recognizable name per job (e.g. `cron:task-reminders`, `cron:operations`, `cron:image-cleanup`).
- `triggerTsCacheRefresh`'s underlying `refreshOfflineCache()` call is fire-and-forget today (`.catch(...)`, not awaited by its cron route) — wrap the call to `refreshOfflineCache()` itself in `trackJob`, not just the route's fetch round-trip, since the route returns immediately while the real work continues in the background; missing this would make that job invisible to the in-flight map exactly when it matters.

## Error handling

`trackJob` and the request-tracking wrapper must never let tracking failures affect the wrapped work — insertion/removal are synchronous `Map` operations that cannot throw under normal use, but the `finally`/`res.on` cleanup path is unconditional regardless. The watchdog's `setInterval` callback is synchronous (histogram reads and a `console.warn` are non-blocking) so it cannot itself contribute additional lag.

## Testing

No automated test suite in this repo. Verification is manual: run the dev server locally, deliberately block the event loop for >1s (e.g. a temporary `while` loop in a throwaway route) to confirm the watchdog logs it with the right in-flight label, then remove the throwaway block before shipping. Production verification is watching `docker logs web` after deploy until the next real stall occurs and confirming the log line names a specific job or request.
