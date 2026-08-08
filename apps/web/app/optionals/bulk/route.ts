import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import Db from '@/lib/mongo'

const VALID_TYPES = ['qol', 'gfx', 'zeus', 'j2', 'j5'] as const
type OptType = typeof VALID_TYPES[number]


export async function POST(request: NextRequest) {

    const { type, action, mods } = await request.json() as {
        type: OptType
        action: 'enable-all' | 'disable-all'
        mods?: { id: string; name: string }[]
    }

    if (!type || !action) return NextResponse.json({ error: 'Missing type or action' }, { status: 400 })
    if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    if (action !== 'enable-all' && action !== 'disable-all') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    if (action === 'enable-all' && !Array.isArray(mods)) return NextResponse.json({ error: 'Missing mods list' }, { status: 400 })

    try {
        const me = await client.fetchMe()
        if (!me) throw new Error('Not logged in')

        if (!me.optionals) await Db.users.updateOne({ _id: me._id }, { $set: { optionals: { qol: [], gfx: [], zeus: [], j2: [], j5: [] } } })

        const value = action === 'enable-all' ? mods : []
        await Db.users.updateOne({ _id: me._id }, { $set: { [`optionals.${type}`]: value } })

        return NextResponse.json({ success: true }, { status: 200 })
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}
