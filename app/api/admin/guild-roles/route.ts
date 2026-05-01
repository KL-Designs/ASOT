import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

// GET /api/admin/guild-roles
// Returns all Discord guild roles sorted by name.
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Roles are synced from Discord into the roles collection
    const roles = await Db.roles
        .find({ name: { $ne: '@everyone' } })
        .sort({ name: 1 })
        .project({ _id: 0, id: 1, name: 1 })
        .toArray()

    return NextResponse.json(roles)
}
