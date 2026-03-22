import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, ['HQ Staff'])) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const rawDate = new Date()
        const day = String(rawDate.getDate()).padStart(2, '0')
        const month = String(rawDate.getMonth() + 1).padStart(2, '0') // months are 0-indexed
        const year = rawDate.getFullYear()
        const formatted = `${day}/${month}/${year}`

        const newOp = await Db.operations.insertOne({
            _id: new ObjectId(),
            title: `New Mission ${formatted}`,
            department: '1-0 HQ',
            date: new Date(),
            loreDate: new Date(),
            fields: []
        })

        return NextResponse.json({ success: true, id: newOp.insertedId }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}