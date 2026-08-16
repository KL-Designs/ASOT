/**
 * Typed client for the `apps/milpac` render service.
 *
 * The service is a stateless renderer: it holds no database connection and
 * writes nothing to disk. This app builds the payload from its own
 * authoritative member data, posts it, and persists the bytes that come back.
 * See apps/milpac/PLAN.md §4 for why the data model deliberately stays here.
 *
 * The service runs on the internal Docker network with no published port, so
 * these calls are only reachable from inside the compose stack.
 */

import type { BoxData, UniformData } from './types'

const BASE = process.env.MILPAC_SERVICE_URL
const TOKEN = process.env.MILPAC_SERVICE_TOKEN

/** Renders are heavy but local; this is a backstop against a hung service, not a tight SLA. */
const TIMEOUT_MS = 30_000

export class MilpacServiceError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        readonly detail?: unknown,
    ) {
        super(message)
        this.name = 'MilpacServiceError'
    }
}

/** True when the service is configured. Callers can degrade rather than throw. */
export function isMilpacServiceConfigured(): boolean {
    return Boolean(BASE && TOKEN)
}

async function post(path: string, body: unknown): Promise<Buffer> {
    if (!BASE || !TOKEN) {
        throw new MilpacServiceError(
            'MILPAC_SERVICE_URL and MILPAC_SERVICE_TOKEN must both be set — see .env.template',
        )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response
    try {
        response = await fetch(`${BASE}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${TOKEN}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
            cache: 'no-store',
        })
    } catch (err) {
        throw new MilpacServiceError(
            controller.signal.aborted
                ? `milpac service did not respond within ${TIMEOUT_MS}ms`
                : 'milpac service is unreachable',
            undefined,
            err,
        )
    } finally {
        clearTimeout(timeout)
    }

    if (!response.ok) {
        // The service returns JSON on every failure: 400 names the offending
        // field, 422 names the missing asset, 500 carries a correlation id that
        // matches its own log line. Surface it rather than swallowing it.
        const detail = await response.json().catch(() => null)
        throw new MilpacServiceError(
            `milpac service returned ${response.status} for ${path}`,
            response.status,
            detail,
        )
    }

    return Buffer.from(await response.arrayBuffer())
}

export function renderUniform(data: UniformData): Promise<Buffer> {
    // `name` is this app's output-filename concern, not the renderer's — it
    // draws displayName and returns bytes.
    const { name: _name, ...payload } = data
    return post('/render/uniform', payload)
}

export function renderBox(data: BoxData): Promise<Buffer> {
    const { name: _name, ...payload } = data
    return post('/render/box', payload)
}

export interface CertificateRequest {
    type: 'promotion' | 'award'
    /** Certificate code — see apps/milpac/assets/templates/slide-map.json. */
    cert: string
    name: string
    date?: string
    dateNumber?: string
    suffix?: string
    signaturer?: string
    signaturerRankShort?: string
    signaturerRankFull?: string
    jddate?: string
    jdnum?: string
    jdsuffix?: string
}

export function renderCertificate(data: CertificateRequest): Promise<Buffer> {
    return post('/render/certificate', data)
}

// ── Render fingerprint ───────────────────────────────────────────────────────

/** How long a fetched fingerprint is trusted before re-asking the service. */
const FINGERPRINT_TTL_MS = 60_000

let cached: { value: string; at: number } | null = null

/**
 * The service's artwork digest, folded into the cached-render key.
 *
 * Uniform and medal-box images are only redrawn when the member's data
 * changes, which misses new artwork entirely: swap a base uniform PNG and every
 * cached image is stale with nothing to notice it. Including this in the hash
 * makes new art invalidate the estate — each member redraws once, on next view.
 *
 * Cached in-process with a short TTL so a restarted service is picked up
 * without restarting web, and so a profile view is not gated on a second round
 * trip. An unreachable service reuses the last known value, or contributes
 * nothing at all if there has never been one: no render can succeed in that
 * state anyway, so the alternative is a hash that flaps while it is down.
 */
export async function getRenderFingerprint(): Promise<string> {
    if (cached && Date.now() - cached.at < FINGERPRINT_TTL_MS) return cached.value
    if (!BASE || !TOKEN) return cached?.value ?? ''

    try {
        const res = await fetch(`${BASE}/fingerprint`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            signal: AbortSignal.timeout(5_000),
            cache: 'no-store',
        })
        if (!res.ok) return cached?.value ?? ''
        const { fingerprint } = await res.json() as { fingerprint?: string }
        if (!fingerprint) return cached?.value ?? ''
        cached = { value: fingerprint, at: Date.now() }
        return fingerprint
    } catch {
        return cached?.value ?? ''
    }
}
