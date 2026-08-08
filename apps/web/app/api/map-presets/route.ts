import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'

export async function GET() {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

        const presets = await Db.mapPresets
            .find({ userId: me.id })
            .sort({ createdAt: -1 })
            .toArray()

        return NextResponse.json({
            presets: presets.map(p => ({
                _id: p._id.toString(),
                name: p.name,
                type: p.type,
                a3Props: p.a3Props,
                createdAt: (p.createdAt as Date).toISOString(),
            })),
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

        const { name, type, a3Props } = await request.json()
        if (!name || !type || !a3Props) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
        if (type !== 'a3icon' && type !== 'a3metis') return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

        const doc = { userId: me.id, name, type, a3Props, createdAt: new Date() }
        const result = await Db.mapPresets.insertOne(doc)

        return NextResponse.json({
            preset: {
                _id: result.insertedId.toString(),
                name,
                type,
                a3Props,
                createdAt: doc.createdAt.toISOString(),
            },
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
