import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const VALID_TYPES = ['qol', 'gfx', 'zeus', 'j2', 'j5'] as const
type OptType = typeof VALID_TYPES[number]


export async function POST(request: NextRequest) {

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.optionals.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { action, type, id, name, deps } = await request.json() as {
        action: 'add' | 'remove' | 'set-deps'
        type: OptType
        id: string
        name?: string
        deps?: string[]
    }

    if (!action || !type || !id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    if (action !== 'add' && action !== 'remove' && action !== 'set-deps') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    if (action === 'add' && !name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })
    if (action === 'set-deps' && !Array.isArray(deps)) return NextResponse.json({ error: 'deps must be an array' }, { status: 400 })

    try {
        if (action === 'add') {
            await Db.optionals.updateOne({ _id: type }, { $addToSet: { mods: { id, name: name! } } })
        }

        if (action === 'remove') {
            await Db.optionals.updateOne({ _id: type }, { $pull: { mods: { id } } })
            // Remove from all users' enabled lists so no orphaned entries remain
            await Db.users.updateMany({}, { $pull: { [`optionals.${type}`]: { id } } })
        }

        if (action === 'set-deps') {
            await Db.optionals.updateOne(
                { _id: type },
                { $set: { 'mods.$[elem].deps': deps } },
                { arrayFilters: [{ 'elem.id': id }] }
            )
        }

        return NextResponse.json({ success: true }, { status: 200 })
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}
