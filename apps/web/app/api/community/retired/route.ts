import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'

// Returns true only for genuine Discord Snowflake IDs.
// Rejects: empty, zero, Excel scientific notation string, Steam IDs (17 digits
// starting with 76561), and any normalised Steam ID that slipped through (e.g.
// "76561200000000000" from parseFloat("7.65612E+16")).
function isValidDiscordId(id: string | null | undefined): boolean {
    if (!id || id === '0' || id === '' || id === '7.65612E+16') return false
    if (/^\d+$/.test(id)) {
        if (id.startsWith('76561'))  return false   // Steam ID prefix
        if (id.length < 18)          return false   // too short for a Discord Snowflake
    }
    return true
}

export async function GET() {
    const raw = await Db.retiredMembers
        .find({ dischargeType: { $in: ['GD', 'HD'] } })
        .sort({ dischargeDate: -1 })
        .toArray()

    // Use the "ASOT Member" Discord role as the definitive indicator of a current
    // serving member. Anyone with that role is excluded from the memorial wall.
    // We build both a Discord-ID set (for records with valid IDs) and a normalised
    // callsign set (fallback for records whose Discord ID was mangled by Excel).
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

    const activeIds       = new Set<string>()
    const activeCallsigns = new Set<string>()

    const asotMemberRole = await Db.roles.findOne({ name: 'ASOT Member' })
    if (asotMemberRole) {
        const currentMembers = await Db.users
            .find({ 'guild.roles': asotMemberRole.id })
            .project({ _id: 1, 'guild.nickname': 1, globalName: 1, username: 1 })
            .toArray()

        for (const u of currentMembers) {
            activeIds.add(String(u._id))

            // Guild nickname format is "RANK.Callsign" (e.g. "MAJ.Dempsey")
            // Extract the callsign after the last dot; fall back to globalName
            const raw = (u as Record<string, unknown> & {
                guild?: { nickname?: string }; globalName?: string; username?: string
            }).guild?.nickname
                ?? (u as { globalName?: string }).globalName
                ?? (u as { username?: string }).username
                ?? ''

            if (raw) {
                const afterDot   = raw.includes('.')  ? raw.split('.').pop()!   : raw
                const afterSpace = afterDot.includes(' ') ? afterDot.split(' ').pop()! : afterDot
                activeCallsigns.add(norm(afterSpace))
            }
        }
    }

    // Deduplicate only when a valid Discord ID confirms it's the same person.
    // Records with a garbage/missing Discord ID are treated as unique entries —
    // different members can share the same callsign across different years.
    // A person with both an HD and a GD discharge appears in both sections.
    const seen = new Map<string, RetiredMember>()
    for (const m of raw) {
        const valid = isValidDiscordId(m.discordId)

        // Skip current active members — check by Discord ID first (reliable),
        // then fall back to normalised callsign match (catches garbage-ID records)
        const isActiveById       = valid && !!m.discordId && activeIds.has(m.discordId)
        const isActiveByCallsign = activeCallsigns.has(norm(m.callsign))
        if (isActiveById || isActiveByCallsign) continue

        if (valid) {
            // Dedup per person per discharge type; list is sorted date-desc so
            // first occurrence = most recent discharge
            const key = `${m.dischargeType}:${m.discordId}`
            if (!seen.has(key)) seen.set(key, m)
        } else {
            // No reliable ID — every record is its own entry on the wall
            seen.set(m._id!.toString(), m)
        }
    }
    const members = Array.from(seen.values())

    // ── Join year lookup ──────────────────────────────────────────────────────
    const realIds = members
        .map(m => m.discordId)
        .filter((id): id is string => isValidDiscordId(id))

    const joinYearMap = new Map<string, number>()

    if (realIds.length > 0) {
        const [users, apps] = await Promise.all([
            Db.users
                .find({ _id: { $in: realIds } })
                .project({ _id: 1, 'milpac.enlistedDate': 1 })
                .toArray(),
            Db.j1Applications
                .find({ discordId: { $in: realIds } })
                .project({ discordId: 1, submittedAt: 1 })
                .sort({ submittedAt: 1 })
                .toArray(),
        ])

        for (const u of users) {
            const raw = (u as Record<string, unknown> & { milpac?: { enlistedDate?: string } }).milpac?.enlistedDate
            if (raw) {
                const yr = new Date(raw).getFullYear()
                if (!isNaN(yr)) joinYearMap.set(u._id as string, yr)
            }
        }
        for (const app of apps) {
            if (app.discordId && !joinYearMap.has(app.discordId)) {
                const yr = new Date(app.submittedAt).getFullYear()
                if (!isNaN(yr)) joinYearMap.set(app.discordId, yr)
            }
        }
    }

    const result = members
        .sort((a, b) => a.callsign.localeCompare(b.callsign))
        .map(m => ({
            _id:           m._id!.toString(),
            callsign:      m.callsign,
            dischargeYear: m.dischargeYear ?? null,
            joinYear:      m.joinYear ?? (m.discordId ? joinYearMap.get(m.discordId) ?? null : null),
            dischargeType: m.dischargeType,
            dischargeDate: m.dischargeDate ?? null,
            discordId:     isValidDiscordId(m.discordId) ? m.discordId! : null,
        }))

    return NextResponse.json({ members: result })
}
