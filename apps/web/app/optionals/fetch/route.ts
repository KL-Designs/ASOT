import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import Db from '@/lib/mongo'



export async function GET(request: NextRequest) {

    const type = request.nextUrl.searchParams.get('type') as 'qol' | 'gfx' | 'zeus' | 'j2' | 'j5'
    if (type !== 'qol' && type !== 'gfx' && type !== 'zeus' && type !== 'j2' && type !== 'j5') NextResponse.json({ error: 'Incorrect type provided' }, { status: 400 })

    try {
        const list = await Db.optionals.findOne({ _id: type })
        if (!list) throw new Error('Failed to find optionals list')

        return NextResponse.json(list.mods, { status: 200 })
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}