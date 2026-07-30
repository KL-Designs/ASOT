import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// POST /api/admin/j1/check-duplicates
// Body: { usernames: string[] }  (normalised lowercase, no #discriminator)
// Returns: { duplicates: string[] }  — which usernames already have application records
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const usernames: string[] = Array.isArray(body?.usernames)
        ? body.usernames.filter((u: unknown) => typeof u === 'string' && u.trim()).map((u: string) => u.toLowerCase().replace(/#\d+$/, '').trim())
        : []

    if (usernames.length === 0) return NextResponse.json({ duplicates: [] })

    const existing = await Db.j1Applications.find(
        { discordUsername: { $in: usernames } },
        { projection: { discordUsername: 1 } },
    ).toArray()

    const duplicates = [...new Set(existing.map(r => (r.discordUsername as string).toLowerCase().replace(/#\d+$/, '').trim()))]

    return NextResponse.json({ duplicates })
}
