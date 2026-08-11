import net from 'node:net'
import { isPublicIpAddress } from '@/lib/safe-fetch'

// Pure, no IO. Storage-side validation only; any port may be stored (a link
// to an internal-only service on a nonstandard port is a legitimate use
// case). The favicon-fetch pipeline (lib/dept-links/favicon.ts, via
// lib/safe-fetch.ts's assertPublicHttpUrl) is the stricter, fetch-time gate
// that additionally refuses default/80/443-only and .local/.internal/etc
// hostnames, deliberately asymmetric from this validator.

export const MAX_LINK_URL_LENGTH = 2048

export type LinkUrlValidation =
    | { ok: true; href: string; url: URL }
    | { ok: false; error: string }

const NOT_REACHABLE = 'That host is not reachable from the public internet'

export function validateLinkUrl(raw: unknown): LinkUrlValidation {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return { ok: false, error: 'A URL is required' }
    }

    const trimmed = raw.trim()
    if (trimmed.length > MAX_LINK_URL_LENGTH) {
        return { ok: false, error: 'That URL is too long (max 2048 characters)' }
    }

    let url: URL
    try {
        url = new URL(trimmed)
    } catch {
        return { ok: false, error: 'That is not a valid URL' }
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: 'Only http and https links are supported' }
    }

    if (url.username !== '' || url.password !== '') {
        return { ok: false, error: 'URLs with embedded credentials are not allowed' }
    }

    const bareHost = url.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(bareHost) !== 0) {
        if (!isPublicIpAddress(bareHost)) return { ok: false, error: NOT_REACHABLE }
    } else {
        const lower = url.hostname.toLowerCase()
        if (lower === 'localhost' || !lower.includes('.') || lower.endsWith('.')) {
            return { ok: false, error: NOT_REACHABLE }
        }
    }

    return { ok: true, href: url.href, url }
}
