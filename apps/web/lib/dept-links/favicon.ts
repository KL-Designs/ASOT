import { safeFetch } from '@/lib/safe-fetch'

// Fetches a department quick link's page title and favicon in one bounded
// pass. Invoked on link create, on URL change, and on manual refresh
// (app/api/admin/dept-links routes). Never throws — a failure at any stage
// degrades to a host-derived title and faviconStatus: 'failed' rather than
// blocking the write that triggered it (NFR-08).

export interface SiteMeta {
    fetchedTitle: string
    faviconData: string | null
    faviconContentType: string | null
    faviconStatus: 'ok' | 'failed'
    faviconFetchedAt: Date | null
}

// Overall deadline across every hop this pipeline makes (page fetch, icon
// fetch, /favicon.ico fallback, and any redirects each of those follows).
// Three hops x 5s x 4 redirect attempts would be ~60s, which contradicts
// FR-19/NFR-07 — so every safeFetch call below is capped to whatever's left
// of this budget, not a flat 5s each.
const OVERALL_DEADLINE_MS = 8000
const PER_HOP_CAP_MS = 5000
const MIN_STEP_BUDGET_MS = 500
const MAX_TITLE_LENGTH = 200
const ICON_MAX_BYTES = 200_000

// The only six shapes faviconContentType is ever allowed to hold — see D4 in
// the design doc. image/vnd.microsoft.icon is accepted on the wire but
// normalised to image/x-icon before storage.
const ACCEPTED_CONTENT_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml',
])

const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}

function decodeEntities(text: string): string {
    return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, m => HTML_ENTITIES[m])
}

function extractTitle(html: string, fallbackHost: string): string {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    if (!match) return fallbackHost
    const collapsed = decodeEntities(match[1]).replace(/\s+/g, ' ').trim()
    if (!collapsed) return fallbackHost
    return collapsed.length > MAX_TITLE_LENGTH ? collapsed.slice(0, MAX_TITLE_LENGTH) : collapsed
}

// Matches every <link> tag, keeps the ones whose rel token list includes
// "icon" (covers rel="icon" and rel="shortcut icon"; correctly excludes
// apple-touch-icon), and returns the first href found — single-quoted,
// double-quoted or bare.
function extractIconHref(html: string): string | null {
    const linkTags = html.match(/<link\b[^>]*>/gi) ?? []
    for (const tag of linkTags) {
        const relMatch = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag)
        const rel = (relMatch?.[1] ?? relMatch?.[2] ?? relMatch?.[3] ?? '').toLowerCase()
        const tokens = rel.split(/\s+/).filter(Boolean)
        if (!tokens.includes('icon')) continue

        const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag)
        const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3]
        if (href) return href
    }
    return null
}

function sniffImageContentType(buf: Buffer): string | null {
    if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'image/x-icon'
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png'
    if (buf.length >= 6) {
        const sig = buf.toString('ascii', 0, 6)
        if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif'
    }
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'

    const BOM = String.fromCharCode(0xfeff)
    const head = buf.subarray(0, 512).toString('utf8').replace(new RegExp('^' + BOM), '').trimStart().toLowerCase()
    if (head.includes('<svg')) return 'image/svg+xml'

    return null
}

// Sniff wins; falls back to a whitelisted response Content-Type; otherwise
// the candidate bytes are rejected outright (never trust attacker-supplied
// header text past this point — D4).
function acceptIcon(buf: Buffer, responseContentType: string | null): string | null {
    const sniffed = sniffImageContentType(buf)
    if (sniffed) return sniffed
    if (responseContentType && ACCEPTED_CONTENT_TYPES.has(responseContentType)) {
        return responseContentType === 'image/vnd.microsoft.icon' ? 'image/x-icon' : responseContentType
    }
    return null
}

export async function fetchSiteMeta(url: string): Promise<SiteMeta> {
    const deadline = Date.now() + OVERALL_DEADLINE_MS
    const budget = () => Math.min(PER_HOP_CAP_MS, deadline - Date.now())

    const failed = (fetchedTitle: string): SiteMeta => ({
        fetchedTitle,
        faviconData: null,
        faviconContentType: null,
        faviconStatus: 'failed',
        faviconFetchedAt: null,
    })

    let hostFallback: string
    try {
        hostFallback = new URL(url).host
    } catch {
        hostFallback = url
    }

    let fetchedTitle = hostFallback
    let iconHref: string | null = null
    let finalUrl = url   // stays the input URL's origin if the page fetch never succeeds

    if (budget() >= MIN_STEP_BUDGET_MS) {
        try {
            const pageRes = await safeFetch(url, {
                maxBytes: 200_000,
                timeoutMs: budget(),
                maxRedirects: 3,
                accept: 'text/html,application/xhtml+xml',
            })
            finalUrl = pageRes.url
            const html = pageRes.body.toString('utf8')
            fetchedTitle = extractTitle(html, new URL(finalUrl).host)
            iconHref = extractIconHref(html)
        } catch {
            // Page fetch failed entirely — fetchedTitle stays host-derived,
            // iconHref stays null, and the /favicon.ico fallback below still
            // runs against the original input's origin.
        }
    }

    let iconBuf: Buffer | null = null
    let iconContentType: string | null = null

    if (iconHref && budget() >= MIN_STEP_BUDGET_MS) {
        try {
            const resolvedHref = new URL(iconHref, finalUrl).href
            const iconRes = await safeFetch(resolvedHref, {
                maxBytes: ICON_MAX_BYTES,
                timeoutMs: budget(),
                maxRedirects: 3,
                accept: 'image/*',
            })
            const accepted = acceptIcon(iconRes.body, iconRes.contentType)
            if (accepted) {
                iconBuf = iconRes.body
                iconContentType = accepted
            }
        } catch {
            // Falls through to the /favicon.ico fallback below.
        }
    }

    if (!iconBuf && budget() >= MIN_STEP_BUDGET_MS) {
        try {
            const fallbackHref = new URL('/favicon.ico', finalUrl).href
            const fallbackRes = await safeFetch(fallbackHref, {
                maxBytes: ICON_MAX_BYTES,
                timeoutMs: budget(),
                maxRedirects: 3,
                accept: 'image/*',
            })
            const accepted = acceptIcon(fallbackRes.body, fallbackRes.contentType)
            if (accepted) {
                iconBuf = fallbackRes.body
                iconContentType = accepted
            }
        } catch {
            // No favicon reachable — falls through to the failed state below.
        }
    }

    if (!iconBuf || !iconContentType) return failed(fetchedTitle)

    return {
        fetchedTitle,
        faviconData: iconBuf.toString('base64'),
        faviconContentType: iconContentType,
        faviconStatus: 'ok',
        faviconFetchedAt: new Date(),
    }
}
