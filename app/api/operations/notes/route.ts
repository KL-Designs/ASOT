import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function POST(request: NextRequest) {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write))
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const { id, notes } = await request.json()
        if (!id) return NextResponse.json({ error: 'Mission ID required' }, { status: 400 })

        await Db.operations.updateOne(
            { _id: new ObjectId(id) },
            { $set: { internalNotes: notes ?? '' } }
        )

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
