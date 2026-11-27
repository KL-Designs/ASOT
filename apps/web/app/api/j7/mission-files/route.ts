import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

/** GET /api/j7/mission-files — list all mission file submissions across operations. J7 + J4 only. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ7 = client.hasRoles(me, ['J7 - Team Leader', 'J7 - Department Leader', 'J7 - Assistant Team Leader', 'J4-Administration'])
    if (!isJ7) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const files = await Db.missionFiles
        .find({})
        .sort({ uploadedAt: -1 })
        .limit(500)
        .toArray()

    return NextResponse.json({ files: files.map(f => ({ ...f, _id: f._id!.toString() })) })
}
