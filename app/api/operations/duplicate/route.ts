import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Mission ID Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, ['HQ Staff'])) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const originalMission = await Db.operations.findOne({_id: new ObjectId(id)})
        if (!originalMission) return NextResponse.json({ error: 'Mission ID Not Found' }, { status: 404 })

        const newOp = await Db.operations.insertOne({
            ...originalMission,
            _id: new ObjectId(),
        })

        return NextResponse.json({ success: true, id: newOp.insertedId }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}