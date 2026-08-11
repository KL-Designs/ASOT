import { Agent, request as undiciRequest } from 'undici'
import dns from 'node:dns'
import net from 'node:net'
import type { LookupFunction } from 'node:net'
import type { Readable } from 'node:stream'

// SSRF-guarded fetcher. The only outbound-fetch path for the dept-links
// favicon pipeline (lib/dept-links/favicon.ts) — nothing else in this feature
// talks to the network directly. Validates at connect time (after DNS
// resolution, on every socket opened through guardedAgent below), not just at
// URL-parse time, so a DNS-rebinding second resolution cannot slip past it.
// Redirects are handled manually (undici's plain Agent never auto-follows —
// that's opt-in via an interceptor this module deliberately never adds), with
// full re-validation on every hop. Body reads are hard-capped by byte count.

export class BlockedUrlError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'BlockedUrlError'
    }
}

export class FetchCapError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'FetchCapError'
    }
}

// ── Private/reserved-range classification — fail closed ─────────────────────
// Anything that isn't a syntactically valid IPv4/IPv6 literal, or that falls
// in a private/reserved/loopback/link-local/CGNAT/documentation/multicast
// range, is NOT public.

function isPublicIpv4(ip: string): boolean {
    const octets = ip.split('.').map(Number)
    if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
    const [a, b, c] = octets

    if (a === 0) return false                                  // 0.0.0.0/8
    if (a === 10) return false                                  // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return false          // 100.64.0.0/10 CGNAT
    if (a === 127) return false                                 // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return false                    // 169.254.0.0/16 link-local (incl. cloud metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return false           // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return false            // 192.0.0.0/24 IETF
    if (a === 192 && b === 0 && c === 2) return false            // 192.0.2.0/24 TEST-NET-1
    if (a === 192 && b === 88 && c === 99) return false          // 192.88.99.0/24 6to4 relay
    if (a === 192 && b === 168) return false                     // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return false        // 198.18.0.0/15 benchmarking
    if (a === 198 && b === 51 && c === 100) return false         // 198.51.100.0/24 TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return false          // 203.0.113.0/24 TEST-NET-3
    if (a >= 224 && a <= 239) return false                       // 224.0.0.0/4 multicast
    if (a >= 240) return false                                   // 240.0.0.0/4 + broadcast

    return true
}

// Expands an IPv6 literal to its 16 raw bytes, handling `::` compression.
// Returns null for embedded-IPv4 dotted forms or any parse surprise, so the
// caller (isPublicIpAddress) fails closed on a null.
function expandIpv6(ip: string): number[] | null {
    if (ip.includes('.')) return null   // embedded-IPv4 dotted form, e.g. ::ffff:1.2.3.4 — reject via null

    let groups: string[]
    if (ip.includes('::')) {
        const segments = ip.split('::')
        if (segments.length > 2) return null
        const head = segments[0] ? segments[0].split(':') : []
        const tail = segments[1] ? segments[1].split(':') : []
        const missing = 8 - head.length - tail.length
        if (missing < 0) return null
        groups = [...head, ...new Array(missing).fill('0'), ...tail]
    } else {
        groups = ip.split(':')
    }
    if (groups.length !== 8) return null

    const bytes: number[] = []
    for (const group of groups) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
        const val = parseInt(group, 16)
        bytes.push((val >> 8) & 0xff, val & 0xff)
    }
    return bytes
}

function isPublicIpv6(bytes: number[]): boolean {
    if (bytes.every(b => b === 0)) return false                                                            // ::
    if (bytes.slice(0, 15).every(b => b === 0) && bytes[15] === 1) return false                             // ::1
    if (bytes.slice(0, 10).every(b => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) return false    // ::ffff:0:0/96 IPv4-mapped
    if (bytes.slice(0, 12).every(b => b === 0)) return false                                                // ::a.b.c.d IPv4-compatible (deprecated)
    if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return false      // 64:ff9b::/96 NAT64
    if (bytes[0] === 0x01 && bytes[1] === 0x00 && bytes.slice(2, 8).every(b => b === 0)) return false       // 100::/64 discard-only
    if ((bytes[0] & 0xfe) === 0xfc) return false                                                             // fc00::/7 unique local
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false                                       // fe80::/10 link-local
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return false                                       // fec0::/10 site-local
    if (bytes[0] === 0xff) return false                                                                      // ff00::/8 multicast
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false      // 2001:db8::/32 documentation
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return false      // 2001::/32 Teredo
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x02 && bytes[4] === 0x00 && bytes[5] === 0x00) return false   // 2001:2::/48
    if (bytes[0] === 0x20 && bytes[1] === 0x02) return false                                                  // 2002::/16 6to4

    return true
}

export function isPublicIpAddress(ip: string): boolean {
    const version = net.isIP(ip)
    if (version === 4) return isPublicIpv4(ip)
    if (version === 6) {
        const bytes = expandIpv6(ip)
        return bytes === null ? false : isPublicIpv6(bytes)
    }
    return false
}

// ── URL boundary guard ──────────────────────────────────────────────────────

const BLOCKED_HOST_SUFFIXES = ['.local', '.localdomain', '.internal', '.lan', '.home.arpa']

export function assertPublicHttpUrl(input: string | URL): URL {
    let url: URL
    try {
        url = typeof input === 'string' ? new URL(input) : new URL(input.href)
    } catch {
        throw new BlockedUrlError('Invalid URL')
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new BlockedUrlError('Only http and https URLs are supported')
    }

    if (url.username !== '' || url.password !== '') {
        throw new BlockedUrlError('URLs with embedded credentials are not allowed')
    }

    if (url.port !== '' && url.port !== '80' && url.port !== '443') {
        throw new BlockedUrlError('Only the default, 80 or 443 ports may be fetched')
    }

    const bareHost = url.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(bareHost) !== 0) {
        if (!isPublicIpAddress(bareHost)) throw new BlockedUrlError(`Blocked non-public address: ${bareHost}`)
    } else {
        const lower = url.hostname.toLowerCase()
        const blocked = lower === 'localhost'
            || !lower.includes('.')
            || lower.endsWith('.')
            || BLOCKED_HOST_SUFFIXES.some(suffix => lower.endsWith(suffix))
        if (blocked) throw new BlockedUrlError(`Blocked non-public hostname: ${url.hostname}`)
    }

    return url
}

// ── Transport — undici Agent with connect-time guarded lookup (Variant A) ──
//
// The lookup runs at connect time, on every socket this Agent opens, after
// DNS resolution has actually happened — that's what makes it rebinding-proof
// (a pre-fetch "resolve once, check, then connect by hostname" pattern would
// let a second, differently-answered resolution slip straight past the
// check). Every resolved address must pass, not just the first.

const guardedLookup: LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
        if (err) return callback(err, undefined as never)
        const list = addresses as dns.LookupAddress[]
        if (list.length === 0) return callback(new BlockedUrlError(`No addresses for ${hostname}`), undefined as never)
        for (const entry of list) {
            if (!isPublicIpAddress(entry.address)) {
                return callback(new BlockedUrlError(`Blocked non-public address for ${hostname}`), undefined as never)
            }
        }
        const wantsAll = typeof options === 'object' && options !== null && options.all === true
        if (wantsAll) return callback(null, list as never)
        return callback(null, list[0].address, list[0].family)
    })
}

const guardedAgent = new Agent({ connect: { lookup: guardedLookup, timeout: 3000 } })

// ── safeFetch ────────────────────────────────────────────────────────────────

export interface SafeFetchOptions {
    maxBytes?: number      // default 200_000
    timeoutMs?: number     // default 5000, per hop
    maxRedirects?: number  // default 3
    accept?: string        // Accept header
}

export interface SafeFetchResult {
    url: string                    // final post-redirect href
    status: number
    contentType: string | null     // raw response header, lowercased, param-stripped
    body: Buffer
}

const DEFAULT_MAX_BYTES = 200_000
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_MAX_REDIRECTS = 3
const USER_AGENT = 'ASOT-Website/1.0'

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

function normaliseContentType(value: string | string[] | undefined): string | null {
    const raw = firstHeaderValue(value)
    if (!raw) return null
    const stripped = raw.split(';')[0].trim().toLowerCase()
    return stripped || null
}

// Accumulates chunks with a running byte total; the moment the total exceeds
// maxBytes, destroys the stream and throws — never buffers past the cap.
async function readCapped(stream: Readable, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of stream as AsyncIterable<Buffer>) {
        total += chunk.length
        if (total > maxBytes) {
            stream.destroy()
            throw new FetchCapError('Response exceeded the maximum allowed size')
        }
        chunks.push(chunk)
    }
    return Buffer.concat(chunks)
}

export async function safeFetch(input: string | URL, opts?: SafeFetchOptions): Promise<SafeFetchResult> {
    const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS
    const accept = opts?.accept

    let current = assertPublicHttpUrl(input)

    for (let hop = 0; ; hop++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)

        try {
            const res = await undiciRequest(current, {
                dispatcher: guardedAgent,
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'user-agent': USER_AGENT,
                    ...(accept ? { accept } : {}),
                },
            })

            if (res.statusCode >= 300 && res.statusCode < 400) {
                const location = firstHeaderValue(res.headers.location)
                if (location) {
                    await res.body.dump().catch(() => {})
                    if (hop >= maxRedirects) throw new FetchCapError('Too many redirects')
                    current = assertPublicHttpUrl(new URL(location, current))
                    continue
                }
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                await res.body.dump().catch(() => {})
                throw new FetchCapError(`HTTP ${res.statusCode}`)
            }

            const body = await readCapped(res.body, maxBytes)
            return {
                url: current.href,
                status: res.statusCode,
                contentType: normaliseContentType(res.headers['content-type']),
                body,
            }
        } catch (err) {
            if (err instanceof BlockedUrlError || err instanceof FetchCapError) throw err
            if (controller.signal.aborted) throw new FetchCapError('Request timed out')
            throw err
        } finally {
            clearTimeout(timer)
        }
    }
}
