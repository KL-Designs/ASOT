import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'

export const dynamic = 'force-dynamic'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [videos, types] = await Promise.all([
        Db.trainingTypeVideos.find({ deletedAt: { $exists: false } }).sort({ createdAt: -1 }).toArray(),
        Db.trainingTypes.find({}).project<{ _id: string; name: string }>({ name: 1 }).toArray(),
    ])

    const typeMap = new Map(types.map(t => [String(t._id), t.name]))

    const result = videos.map(v => ({
        ...v,
        typeName: v.trainingTypeId ? typeMap.get(v.trainingTypeId) ?? null : null,
    }))

    return NextResponse.json({ videos: result })
}
