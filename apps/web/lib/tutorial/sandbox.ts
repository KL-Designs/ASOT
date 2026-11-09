/**
 * Tutorial sandbox: while a guided tutorial runs, nothing the member does may
 * reach the server as a change. Real data is still read, so the page looks the
 * way it always does, but every write is answered in the browser.
 *
 * The rule is default-deny. Any request that is not a GET/HEAD is answered with
 * a fake success and never sent, whether or not a tutorial wrote a handler for
 * it. A handler only makes the fake answer more convincing (the right response
 * shape) or folds practice records into a real read. That way a button nobody
 * thought to script is still harmless.
 *
 * Covered: `fetch` (which also carries Next server actions), XMLHttpRequest,
 * `navigator.sendBeacon`, and WebSocket sends (the collaborative editor). The
 * WebSocket case drops outgoing messages rather than refusing the connection,
 * so an editor that was already open stops syncing too; the page is reloaded
 * when the tutorial ends so no unsent local edit can sync afterwards.
 *
 * Not covered, by design: a GET with side effects. No route here should have
 * one; if one is ever added it needs a handler with `respond`.
 */

export interface SandboxRequest {
    method: string
    url: URL
    /** Parsed JSON when the body was JSON, the raw string otherwise, FormData as-is, or null. */
    body: unknown
}

export interface SandboxResponse {
    status?: number
    body: unknown
}

export interface SandboxHandler {
    /** One method or several; omitted matches any. Compared upper-case. */
    method?: string | string[]
    /** Matched against the URL's pathname: exact string, or a RegExp. */
    path: string | RegExp
    /** Reads only: rewrite the real JSON response (add practice records, apply practice edits). */
    transform?: (data: any, req: SandboxRequest) => unknown
    /**
     * Answer without touching the network. For a write this is the fake result;
     * returning a plain value means status 200 with that JSON body.
     */
    respond?: (req: SandboxRequest) => unknown | SandboxResponse | Promise<unknown | SandboxResponse>
}

export interface SandboxWrite {
    method: string
    url: URL
    body: unknown
    /** 'fetch' | 'xhr' | 'beacon' | 'websocket' */
    via: string
}

type Listener = (w: SandboxWrite) => void

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** The body a write gets back when no handler answers it. Covers the shapes routes here usually return. */
export const DEFAULT_WRITE_RESPONSE = { ok: true, success: true, tutorial: true }

export function isRead(method: string) {
    return READ_METHODS.has(method.toUpperCase())
}

export function matchHandler(handlers: SandboxHandler[], method: string, url: URL): SandboxHandler | undefined {
    const m = method.toUpperCase()
    return handlers.find(h => {
        if (h.method) {
            const ms = Array.isArray(h.method) ? h.method : [h.method]
            if (!ms.some(x => x.toUpperCase() === m)) return false
        }
        return typeof h.path === 'string' ? h.path === url.pathname : h.path.test(url.pathname)
    })
}

function isSandboxResponse(v: unknown): v is SandboxResponse {
    return !!v && typeof v === 'object' && 'body' in v && Object.keys(v as object).every(k => k === 'body' || k === 'status')
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'X-ASOT-Tutorial': '1' },
    })
}

function parseBody(raw: unknown): unknown {
    if (raw == null) return null
    if (typeof raw === 'string') {
        try { return JSON.parse(raw) } catch { return raw }
    }
    return raw
}

async function readRequest(input: RequestInfo | URL, init: RequestInit | undefined, base: string) {
    if (typeof Request !== 'undefined' && input instanceof Request) {
        const method = (init?.method ?? input.method ?? 'GET').toUpperCase()
        let body: unknown = init?.body ?? null
        if (body == null && !isRead(method)) {
            try { body = await input.clone().text() } catch { body = null }
        }
        return { method, url: new URL(input.url, base), body: parseBody(body) }
    }
    const method = (init?.method ?? 'GET').toUpperCase()
    return { method, url: new URL(String(input), base), body: parseBody(init?.body ?? null) }
}

/**
 * Wraps a fetch implementation. Pure apart from `realFetch`, so it is unit-tested
 * without a browser.
 */
export function createSandboxFetch(
    realFetch: typeof fetch,
    getHandlers: () => SandboxHandler[],
    onWrite: Listener,
    base: () => string,
): typeof fetch {
    return async function sandboxFetch(input: RequestInfo | URL, init?: RequestInit) {
        const req = await readRequest(input, init, base())
        const handler = matchHandler(getHandlers(), req.method, req.url)

        if (isRead(req.method)) {
            if (handler?.respond) return toResponse(await handler.respond(req))
            if (!handler?.transform) return realFetch(input as any, init)
            const res = await realFetch(input as any, init)
            if (!res.ok) return res
            let data: unknown
            try { data = await res.clone().json() } catch { return res }
            return jsonResponse(handler.transform(data, req), res.status)
        }

        onWrite({ ...req, via: 'fetch' })
        if (handler?.respond) return toResponse(await handler.respond(req))
        return jsonResponse(DEFAULT_WRITE_RESPONSE)
    } as typeof fetch
}

function toResponse(v: unknown) {
    if (isSandboxResponse(v)) return jsonResponse(v.body, v.status ?? 200)
    return jsonResponse(v)
}

// ── Browser installation ──────────────────────────────────────────────────────

interface Installed {
    fetch: typeof fetch
    xhrOpen: XMLHttpRequest['open']
    xhrSend: XMLHttpRequest['send']
    beacon?: Navigator['sendBeacon']
    wsSend: WebSocket['send']
}

let installed: Installed | null = null
let handlers: SandboxHandler[] = []
const listeners = new Set<Listener>()
let writeCount = 0

/** The unpatched fetch, for the tutorial system's own calls (saving progress). */
export function realFetch(input: RequestInfo | URL, init?: RequestInit) {
    return (installed?.fetch ?? fetch)(input, init)
}

export function isSandboxActive() {
    return installed !== null
}

/** How many writes have been swallowed since the sandbox went up. */
export function sandboxWriteCount() {
    return writeCount
}

export function onSandboxWrite(fn: Listener) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
}

export function setSandboxHandlers(next: SandboxHandler[]) {
    handlers = next
}

function emit(w: SandboxWrite) {
    writeCount++
    for (const fn of listeners) {
        try { fn(w) } catch (err) { console.error('[tutorial] write listener failed', err) }
    }
}

const XHR_META = Symbol('asotTutorialXhr')

export function installSandbox(initial: SandboxHandler[] = []) {
    handlers = initial
    if (installed || typeof window === 'undefined') return
    writeCount = 0

    const original: Installed = {
        fetch: window.fetch,
        xhrOpen: XMLHttpRequest.prototype.open,
        xhrSend: XMLHttpRequest.prototype.send,
        beacon: navigator.sendBeacon?.bind(navigator),
        wsSend: WebSocket.prototype.send,
    }
    installed = original

    const boundFetch = original.fetch.bind(window)
    window.fetch = createSandboxFetch(boundFetch, () => handlers, emit, () => window.location.href)

    XMLHttpRequest.prototype.open = function (this: any, method: string, url: string | URL, ...rest: any[]) {
        this[XHR_META] = { method: String(method).toUpperCase(), url: new URL(String(url), window.location.href) }
        return (original.xhrOpen as any).call(this, method, url, ...rest)
    } as any
    XMLHttpRequest.prototype.send = function (this: any, body?: any) {
        const meta = this[XHR_META] as { method: string; url: URL } | undefined
        if (!meta || isRead(meta.method)) return original.xhrSend.call(this, body)
        emit({ method: meta.method, url: meta.url, body: parseBody(body), via: 'xhr' })
        // Never sent. The caller sees a network error, which every upload path here already handles.
        setTimeout(() => {
            this.dispatchEvent(new ProgressEvent('error'))
            this.dispatchEvent(new ProgressEvent('loadend'))
        }, 0)
    }

    if (original.beacon) {
        navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
            emit({ method: 'POST', url: new URL(String(url), window.location.href), body: parseBody(data ?? null), via: 'beacon' })
            return true
        }) as Navigator['sendBeacon']
    }

    WebSocket.prototype.send = function (this: WebSocket, data: any) {
        // Next's dev hot-reload socket is the one socket that is not app data.
        if (this.url.includes('/_next/')) return original.wsSend.call(this, data)
        emit({ method: 'WS', url: new URL(this.url), body: null, via: 'websocket' })
    }
}

export function uninstallSandbox() {
    if (!installed || typeof window === 'undefined') return
    window.fetch = installed.fetch
    XMLHttpRequest.prototype.open = installed.xhrOpen
    XMLHttpRequest.prototype.send = installed.xhrSend
    if (installed.beacon) navigator.sendBeacon = installed.beacon
    WebSocket.prototype.send = installed.wsSend
    installed = null
    handlers = []
}
