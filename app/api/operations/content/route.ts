import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'


export async function POST(request: NextRequest) {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, ['HQ Staff'])) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const { id, content } = await request.json()
        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

        await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { content } })
        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
