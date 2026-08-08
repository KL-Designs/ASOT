import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

        const result = await Db.mapPresets.deleteOne({ _id: new ObjectId(id), userId: me.id })
        if (result.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
