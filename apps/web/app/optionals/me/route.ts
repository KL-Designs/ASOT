import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const VALID_TYPES = ['qol', 'gfx', 'zeus', 'j2', 'j5'] as const
type OptType = typeof VALID_TYPES[number]


export async function GET(request: NextRequest) {

    const type = request.nextUrl.searchParams.get('type') as OptType
    const id = request.nextUrl.searchParams.get('id') as string
    const mode = request.nextUrl.searchParams.get('mode') as 'all' | 'check' | 'add' | 'remove'
    const name = request.nextUrl.searchParams.get('name') as string

    if (!mode) return NextResponse.json({ error: 'Missing mode' }, { status: 400 })
    if (mode !== 'all' && (!type || !id)) return NextResponse.json({ error: 'Missing type or id' }, { status: 400 })
    if (type && !VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

    try {
        const me = await client.fetchMe()
        if (!me) throw new Error('Not logged in')

        if (!me.optionals) await Db.users.updateOne({ _id: me._id }, { $set: { optionals: { qol: [], gfx: [], zeus: [], j2: [], j5: [] } } })

        if (mode === 'all') {
            const user = await Db.users.findOne({ _id: me._id }, { projection: { optionals: 1 } })
            const isAdmin = client.hasRoles(me, PERMISSIONS.optionals.manage)
            return NextResponse.json({ ...(user?.optionals ?? { qol: [], gfx: [], zeus: [], j2: [], j5: [] }), isAdmin }, { status: 200 })
        }

        if (mode === 'check') {
            const user = await Db.users.findOne({ _id: me._id }, { projection: { optionals: 1 } })
            const enabled = user?.optionals?.[type]?.some((m: { id: string }) => m.id === id) ?? false
            return NextResponse.json({ enabled }, { status: 200 })
        }

        if (mode === 'add') {
            await Db.users.updateOne({ _id: me._id }, { $addToSet: { [`optionals.${type}`]: { id, name } } })
            return NextResponse.json({ success: true }, { status: 200 })
        }

        if (mode === 'remove') {
            await Db.users.updateOne({ _id: me._id }, { $pull: { [`optionals.${type}`]: { id } } })
            return NextResponse.json({ success: true }, { status: 200 })
        }

        return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}