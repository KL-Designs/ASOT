import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'



export async function GET(request: NextRequest) {

    try {
        const me = await client.fetchMe()
        return NextResponse.json({ ...me }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}


export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    const update: Record<string, any> = {}
    for (const [key, value] of Object.entries(body)) {
        update[`bio.${key}`] = value
    }

    await Db.users.updateOne({ _id: me._id }, { $set: update }, { upsert: true })

    return NextResponse.json({ success: true }, { status: 200 })
}