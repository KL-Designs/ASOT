import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import Db from '@/lib/mongo'



export async function GET(request: NextRequest) {

    try {
        const me = await client.fetchMe()
        if (!me) throw new Error('Not logged in')

        Db.users.updateOne({ _id: me._id }, { $set: { 'optionals.qol': [] } })
        Db.users.updateOne({ _id: me._id }, { $set: { 'optionals.gfx': [] } })
        Db.users.updateOne({ _id: me._id }, { $set: { 'optionals.zeus': [] } })
        Db.users.updateOne({ _id: me._id }, { $set: { 'optionals.j2': [] } })
        Db.users.updateOne({ _id: me._id }, { $set: { 'optionals.j5': [] } })

        return NextResponse.json({ success: true }, { status: 200 })
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}