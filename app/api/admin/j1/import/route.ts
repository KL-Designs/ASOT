import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

interface ImportRecord {
    discordUsername: string
    discordId?: string
    inGameName?: string
    age?: number | string
    experience?: string
    status?: 'pending' | 'reviewing' | 'accepted' | 'rejected'
    submittedAt?: string
    notes?: string
    recruiter?: string
    // Extended CSV fields
    steamUrl?: string
    steamId64?: string
    region?: string
    armaHours?: string
    priorMilsim?: boolean | string
    dualClan?: boolean | string
    previousUnits?: string
    availableNights?: string
    opsPerMonth?: string
    primaryRole?: string
    additionalRoles?: string[] | string
    departmentInterest?: string[] | string
    ownsArma?: boolean | string
}

function parseBoolean(v: unknown): boolean | undefined {
    if (v == null || v === '') return undefined
    if (typeof v === 'boolean') return v
    const s = String(v).toLowerCase().trim()
    if (s === 'yes' || s === 'true') return true
    if (s === 'no' || s === 'false') return false
    return undefined
}

function parseAge(v: unknown): number {
    if (typeof v === 'number') return v
    const s = String(v ?? '').toLowerCase()
    if (s.includes('20+')) return 20
    if (s.includes('16-20')) return 17
    if (s.includes('13-15')) return 14
    if (s.includes('under 13')) return 12
    if (s.includes('under 17')) return 16
    if (s.includes('over 17')) return 17
    const n = parseInt(s)
    return isNaN(n) ? 0 : n
}

/**
 * Extract a Steam ID64 from a Steam profile URL.
 * Handles:
 *   https://steamcommunity.com/profiles/76561198xxxxx → "76561198xxxxx"
 *   Bare 17-digit number → returned as-is
 *   Custom URL (/id/...) → null (cannot extract)
 */
function extractSteamId64(url: string | undefined): string | undefined {
    if (!url) return undefined
    const trimmed = url.trim()
    // Bare numeric ID
    if (/^\d{15,18}$/.test(trimmed)) return trimmed
    // URL with /profiles/
    const m = trimmed.match(/\/profiles\/(\d{15,18})/)
    if (m) return m[1]
    return undefined
}

function parseList(v: unknown): string[] | undefined {
    if (!v) return undefined
    if (Array.isArray(v)) return v.filter(Boolean)
    const s = String(v).trim()
    if (!s) return undefined
    return s.split(',').map(x => x.trim()).filter(Boolean)
}

// POST /api/admin/j1/import — bulk import historical application records
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { records: ImportRecord[] }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { records } = body
    if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json({ error: 'No records provided.' }, { status: 400 })
    }
    if (records.length > 2000) {
        return NextResponse.json({ error: 'Too many records (max 2000 per import).' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'

    const docs = records
        .filter(r => r.discordUsername?.trim())
        .map(r => {
            const steamId64 = r.steamId64?.trim() || extractSteamId64(r.steamUrl)
            const additionalRoles = parseList(r.additionalRoles)
            const departmentInterest = parseList(r.departmentInterest)

            const doc: Record<string, unknown> = {
                discordUsername: r.discordUsername.trim(),
                inGameName: r.inGameName?.trim() || '',
                age: parseAge(r.age),
                experience: r.experience?.trim() || '',
                status: r.status || 'accepted',
                submittedAt: r.submittedAt ? new Date(r.submittedAt) : new Date(),
                notes: r.notes?.trim() || '',
                isDirectRecruit: false,
                recruiter: r.recruiter?.trim() || '',
                reviewedBy: displayName,
                reviewedAt: new Date(),
            }

            // Optional extended fields — only include if present
            if (r.discordId?.trim()) doc.discordId = r.discordId.trim()
            if (r.steamUrl?.trim()) doc.steamUrl = r.steamUrl.trim()
            if (steamId64) doc.steamId64 = steamId64
            if (r.region?.trim()) doc.region = r.region.trim()
            if (r.armaHours?.trim()) doc.armaHours = r.armaHours.trim()
            if (r.availableNights?.trim()) doc.availableNights = r.availableNights.trim()
            if (r.opsPerMonth?.trim()) doc.opsPerMonth = r.opsPerMonth.trim()
            if (r.primaryRole?.trim()) doc.primaryRole = r.primaryRole.trim()
            if (r.previousUnits?.trim()) doc.previousUnits = r.previousUnits.trim()
            if (additionalRoles?.length) doc.additionalRoles = additionalRoles
            if (departmentInterest?.length) doc.departmentInterest = departmentInterest

            const priorMilsim = parseBoolean(r.priorMilsim)
            if (priorMilsim !== undefined) doc.priorMilsim = priorMilsim

            const dualClan = parseBoolean(r.dualClan)
            if (dualClan !== undefined) doc.dualClan = dualClan

            const ownsArma = parseBoolean(r.ownsArma)
            if (ownsArma !== undefined) doc.ownsArma = ownsArma

            return doc
        })

    if (docs.length === 0) {
        return NextResponse.json({ error: 'No valid records to import.' }, { status: 400 })
    }

    // Cross-reference Discord usernames against the users DB to fill in names + link accounts
    const allUsers = await Db.users.find({}, { projection: { _id: 1, username: 1, globalName: 1, 'guild.nickname': 1 } }).toArray()
    const byUsername = new Map<string, typeof allUsers[0]>()
    const byId = new Map<string, typeof allUsers[0]>()
    for (const u of allUsers) {
        if (u.username) byUsername.set(u.username.toLowerCase(), u)
        byId.set(u._id, u)
    }

    for (const doc of docs) {
        // Strip legacy discriminator (#1234) from username if present
        const cleanUsername = (doc.discordUsername as string).toLowerCase().replace(/#\d+$/, '')
        const matched = (doc.discordId ? byId.get(doc.discordId as string) : null) ?? byUsername.get(cleanUsername)
        if (matched) {
            if (!doc.discordId) doc.discordId = matched._id
            if (!doc.inGameName) doc.inGameName = matched.guild?.nickname || matched.globalName || ''
            doc.linkedUserId = matched._id
            doc.linkedUserDisplayName = matched.guild?.nickname || matched.globalName || (matched as any).username || ''
        }
    }

    const result = await Db.j1Applications.insertMany(docs as Parameters<typeof Db.j1Applications.insertMany>[0], { ordered: false })
    return NextResponse.json({ inserted: result.insertedCount })
}
