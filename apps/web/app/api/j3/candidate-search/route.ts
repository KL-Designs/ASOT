import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const q = req.nextUrl.searchParams.get('q')?.trim()
    const courseInstanceId = req.nextUrl.searchParams.get('courseInstanceId')

    if (!q || q.length < 2) return NextResponse.json({ results: [] })

    // Exclude users already in the course
    let excludedUserIds: string[] = []
    if (courseInstanceId) {
        const existing = await Db.courseCandidates.find({ courseInstanceId }).toArray()
        excludedUserIds = existing.filter(c => c.userId).map(c => c.userId as string)
    }

    const filter: Record<string, unknown> = {
        $or: [
            { username: { $regex: q, $options: 'i' } },
            { globalName: { $regex: q, $options: 'i' } },
            { 'guild.nickname': { $regex: q, $options: 'i' } },
            { 'guild.displayName': { $regex: q, $options: 'i' } },
        ],
        isSkeletonAccount: { $ne: true },
    }

    if (excludedUserIds.length > 0) {
        filter.id = { $nin: excludedUserIds }
    }

    const users = await Db.users.find(filter).limit(15).toArray()

    const results = users.map(u => ({
        userId: u.id,
        displayName: u.guild?.nickname || u.guild?.displayName || u.globalName || u.username || u.id,
        discordUsername: u.username,
        type: 'member' as const,
    }))

    return NextResponse.json({ results })
}
