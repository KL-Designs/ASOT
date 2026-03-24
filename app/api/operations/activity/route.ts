import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { cookies } from 'next/headers'
import { ObjectId } from 'mongodb'


export async function GET(request: NextRequest) {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const me = await client.fetchMe(token)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const logs = await Db.operationActivity
        .find({ operationId: new ObjectId(id) })
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray()

    return NextResponse.json({ logs })
}
