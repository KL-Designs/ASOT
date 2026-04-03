import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'

// GET /api/applications/check-name?name=xxx
// Public — returns { available: boolean }
export async function GET(request: NextRequest) {
    const name = request.nextUrl.searchParams.get('name')?.trim()
    if (!name || name.length < 2) return NextResponse.json({ available: true })

    const existing = await Db.users.findOne(
        { name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        { projection: { _id: 1 } }
    )

    return NextResponse.json({ available: !existing })
}
