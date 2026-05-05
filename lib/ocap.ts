import Db from '@/lib/mongo'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { Readable } from 'node:stream'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import pick from 'stream-json/filters/pick.js'
import streamArray from 'stream-json/streamers/stream-array.js'

const gunzipAsync = promisify(gunzip)

// ── Parser ────────────────────────────────────────────────────────────────────

export interface ParsedPlayerStat {
    name: string
    kills: number
    deaths: number
    side: string
}

/**
 * Downloads and decompresses an OCAP recording.
 * Tries .json.gz first (OCAP2 default), falls back to .json.
 * Returns the raw decompressed bytes as a Buffer (never a string,
 * so V8's string-length limit cannot be hit).
 */
export async function downloadOcapRecording(apiUrl: string, filename: string): Promise<Buffer> {
    const urlGz   = `${apiUrl}/data/${filename}.json.gz`
    const urlJson = `${apiUrl}/data/${filename}.json`

    const resGz = await fetch(urlGz)
    if (resGz.ok) {
        const ab = await resGz.arrayBuffer()
        const buf = Buffer.from(ab)
        // fetch may auto-decompress Content-Encoding:gzip; if so, gunzip fails — use buf directly
        try { return await gunzipAsync(buf) } catch { return buf }
    }

    const resJson = await fetch(urlJson)
    if (!resJson.ok) {
        throw new Error(`OCAP server returned ${resGz.status} for .json.gz and ${resJson.status} for .json`)
    }
    return Buffer.from(await resJson.arrayBuffer())
}

// Emit a Buffer in 64 KB chunks so stream-json never receives a chunk too large
// for V8's string limit when it calls .toString() internally on each piece.
async function* bufferChunks(buf: Buffer, size = 65536): AsyncGenerator<Buffer> {
    for (let i = 0; i < buf.length; i += size) {
        yield buf.subarray(i, Math.min(i + size, buf.length))
    }
}

/**
 * Parses a decompressed OCAP recording buffer using streaming JSON.
 * Does two passes over the in-memory buffer — never converts to a string,
 * so recordings of any size are handled safely.
 */
export async function parseOcapBuffer(data: Buffer): Promise<ParsedPlayerStat[]> {
    // ── Pass 1: collect player entities ──────────────────────────────────────
    const playerMap = new Map<number, { name: string; side: string }>()

    const entStream = chain([
        Readable.from(bufferChunks(data)),
        parser(),
        pick({ filter: 'entities' }),
        streamArray(),
    ])

    for await (const { value } of entStream as AsyncIterable<{ value: any }>) {
        if (value.isPlayer === 1 || value.isPlayer === true) {
            playerMap.set(Number(value.id), {
                name: String(value.name ?? ''),
                side: String(value.side ?? ''),
            })
        }
    }

    // ── Pass 2: tally kills / deaths from kill events ─────────────────────────
    type Stat = { name: string; side: string; kills: number; deaths: number }
    const stats = new Map<number, Stat>()
    for (const [id, p] of playerMap) stats.set(id, { ...p, kills: 0, deaths: 0 })

    const evStream = chain([
        Readable.from(bufferChunks(data)),
        parser(),
        pick({ filter: 'events' }),
        streamArray(),
    ])

    for await (const { value } of evStream as AsyncIterable<{ value: any }>) {
        // Events are arrays: [frameTime, type, ...args]
        const evType = Array.isArray(value) ? value[1] : value.type
        if (evType !== 'killed') continue

        // Array format: [frameTime, 'killed', victimId, [killerId, ...], distance]
        // value[3][0] is the killer id; string "null" means a world/environment kill
        let killerId: number, victimId: number
        if (Array.isArray(value)) {
            victimId = Number(value[2])
            const killerRaw = Array.isArray(value[3]) ? value[3][0] : value[3]
            killerId = (killerRaw == null || killerRaw === 'null') ? NaN : Number(killerRaw)
        } else {
            const ids: number[] = value.ids ?? value.id ?? []
            if (ids.length < 2) continue
            ;[killerId, victimId] = ids
        }

        if (killerId !== victimId) { const k = stats.get(killerId); if (k) k.kills++ }
        const v = stats.get(victimId); if (v) v.deaths++
    }

    return Array.from(stats.values()).sort((a, b) => b.kills - a.kills)
}

// ── Member matching ───────────────────────────────────────────────────────────

interface MemberInfo {
    userId: string
    displayName: string
    username?: string
    aliases: string[]
}

function normalize(s: string): string {
    return s.toLowerCase().replace(/[.\-_[\]()]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Strip a leading rank abbreviation (e.g. "Cpl." or "SGT") from a name */
function stripRank(name: string): string {
    // Common patterns: "Cpl. Smith", "SGT Jones", "PFC O'Brien"
    return name.replace(/^[A-Z]{1,4}[.]\s*/i, '').replace(/^[A-Z]{2,5}\s+/i, '').trim()
}

export async function matchPlayersToMembers(playerStats: ParsedPlayerStat[]): Promise<OcapPlayerStat[]> {
    const users = await Db.users.find({}, {
        projection: { _id: 1, name: 1, username: 1, globalName: 1, csvName: 1, guild: 1 },
    }).toArray()

    // Build lookup table of member name variants
    const members: MemberInfo[] = users.map(u => {
        const rawNick = u.guild?.nickname ?? ''
        const strippedNick = rawNick.replace(/\s*\[[^\]]*\]/g, '').trim()
        const parsedNick = strippedNick.includes(' ')
            ? strippedNick.split(' ').slice(1).join(' ')
            : strippedNick

        const aliases = [
            u.name,
            parsedNick,
            strippedNick,
            u.globalName,
            u.username,
            u.csvName,
        ].filter((a): a is string => !!a && a.length > 1)

        return {
            userId:      u._id as string,
            displayName: u.name || parsedNick || u.globalName || u.username || '',
            username:    u.username,
            aliases,
        }
    })

    const rawMatched = playerStats.map(stat => {
        const playerNorm     = normalize(stat.name)
        const playerStripped = normalize(stripRank(stat.name))

        let matched: MemberInfo | null = null

        // 1. Exact match against any alias
        for (const m of members) {
            for (const alias of m.aliases) {
                if (normalize(alias) === playerNorm || normalize(alias) === playerStripped) {
                    matched = m
                    break
                }
            }
            if (matched) break
        }

        // 2. Substring match (member alias fully contained in player name or vice versa)
        // Both strings must be ≥ 4 chars to avoid short-name false positives (e.g. "Res" ↔ "Ares")
        if (!matched && playerStripped.length >= 4) {
            for (const m of members) {
                for (const alias of m.aliases) {
                    const aliasNorm = normalize(alias)
                    if (aliasNorm.length < 4) continue
                    if (playerStripped.includes(aliasNorm) || aliasNorm.includes(playerStripped)) {
                        matched = m
                        break
                    }
                }
                if (matched) break
            }
        }

        return {
            name:        stat.name,
            kills:       stat.kills,
            deaths:      stat.deaths,
            side:        stat.side,
            userId:      matched?.userId,
            displayName: matched?.displayName,
            username:    matched?.username,
        }
    })

    // Deduplicate by userId — same member matched to multiple OCAP entities (e.g. reconnects)
    // merge their kills/deaths into a single entry rather than showing duplicates.
    const mergedByUserId = new Map<string, OcapPlayerStat>()
    const unmatched: OcapPlayerStat[] = []
    for (const s of rawMatched) {
        if (!s.userId) { unmatched.push(s); continue }
        const existing = mergedByUserId.get(s.userId)
        if (existing) {
            existing.kills  += s.kills
            existing.deaths += s.deaths
        } else {
            mergedByUserId.set(s.userId, { ...s })
        }
    }
    return [...mergedByUserId.values(), ...unmatched].sort((a, b) => b.kills - a.kills)
}

// ── Viewer URL builder ────────────────────────────────────────────────────────

export function buildViewerUrl(recordingId: number, filename: string): string {
    const base = (process.env.OCAP_VIEWER_URL ?? '').replace(/\/$/, '')
    return `${base}/recording/${recordingId}/${filename}`
}

// ── Duration formatter (seconds → Xh Ym) ─────────────────────────────────────

export function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

// ── Mission name decoder (OCAP encodes spaces as "20" in filenames, %20 in names) ──

export function decodeMissionName(raw: string): string {
    try {
        return decodeURIComponent(raw)
    } catch {
        return raw.replace(/20/g, ' ')
    }
}
