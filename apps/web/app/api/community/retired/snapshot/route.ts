import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'

// GET /api/community/retired/snapshot?discordId=X
// Public — retired MilPac snapshots are intentionally visible on the memorial wall.
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const discordId = searchParams.get('discordId')
    if (!discordId) {
        return NextResponse.json({ error: 'discordId is required' }, { status: 400 })
    }

    const snapshot = await Db.dischargeSnapshots.findOne({ discordId })
    if (!snapshot) {
        return NextResponse.json({ snapshot: null })
    }

    return NextResponse.json({
        snapshot: {
            ...snapshot,
            _id: snapshot._id.toString(),
        },
    })
}
