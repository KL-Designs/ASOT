import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const PAGE_SIZE = 25

// GET /api/admin/members
// Query params:
//   ?page=0          — zero-based page index (default 0)
//   ?limit=25        — page size (default 25, max 100)
//   ?search=         — case-insensitive name/username search
//   ?department=j3   — filter to members of a specific department
export async function GET(request: Request) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page   = Math.max(0, parseInt(searchParams.get('page')  ?? '0',  10) || 0)
    const limit  = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10) || PAGE_SIZE))
    const search = searchParams.get('search')?.trim() ?? ''
    const dept   = searchParams.get('department')

    const filter: Record<string, unknown> = {
        isSkeletonAccount: { $ne: true },
        discharged: { $exists: false },
    }
    if (dept) filter.departments = dept
    if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(escaped, 'i')
        filter.$or = [
            { name: re },
            { 'guild.nickname': re },
            { 'guild.displayName': re },
            { globalName: re },
            { username: re },
        ]
    }

    const projection = {
        id: 1, username: 1, name: 1, globalName: 1,
        'guild.nickname': 1, 'guild.displayName': 1,
        'milpac.currentRank': 1,
        teamLeadDepts: 1,
        avatar: 1, avatarDecoration: 1, hexAccentColor: 1,
    }

    const [users, total] = await Promise.all([
        Db.users
            .find(filter)
            .project(projection)
            .sort({ username: 1 })
            .skip(page * limit)
            .limit(limit)
            .toArray(),
        Db.users.countDocuments(filter),
    ])

    // Attach current ORBAT position for each member on this page
    const ids = users.map(u => u.id)
    const positions = ids.length
        ? await Db.orbatPositions
            .find({ userId: { $in: ids } })
            .project({ userId: 1, role: 1, sectionTitle: 1 })
            .toArray()
        : []

    const orbatMap: Record<string, { role: string; section: string }> = {}
    for (const p of positions) {
        if (p.userId && !orbatMap[p.userId]) {
            orbatMap[p.userId] = { role: p.role, section: p.sectionTitle }
        }
    }

    const members = users.map(u => {
        const displayName =
            u.name ||
            u.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() ||
            u.globalName ||
            u.username ||
            u.id

        return {
            id:             u.id,
            username:       u.username,
            name:           u.name           ?? null,
            globalName:     u.globalName     ?? null,
            guild:          u.guild          ?? null,
            milpac:         u.milpac         ?? null,
            avatar:         u.avatar         ?? null,
            avatarDecoration: u.avatarDecoration ?? null,
            hexAccentColor: u.hexAccentColor  ?? null,
            teamLeadDepts:  u.teamLeadDepts  ?? [],
            orbatEntry:     orbatMap[u.id]   ?? null,
            // Pre-computed fields for consumers that need flat shape (DeptMembersTab)
            displayName,
            currentRank:    u.milpac?.currentRank ?? null,
        }
    })

    return NextResponse.json({ members, total, page, limit })
}
