import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

// GET /api/community/members
// Returns all active members for use in community-facing forms (complaint, nomination, etc.)
// Requires authenticated member — does NOT require admin.
export async function GET() {
    try {
        await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const users = await Db.users
        .find(
            { isSkeletonAccount: { $ne: true }, discharged: { $exists: false } },
            {
                projection: {
                    id: 1, name: 1, globalName: 1, username: 1,
                    'guild.nickname': 1, 'guild.displayName': 1,
                    'milpac.currentRank': 1,
                },
            }
        )
        .toArray()

    const members = users
        .map(u => {
            const nick = (u.guild?.nickname ?? '').replace(/\s*\[[^\]]*\]/g, '').trim()
            const nickParts = nick.split(' ')
            const parsedName = nickParts.length > 1 ? nickParts.slice(1).join(' ') : nick
            const baseName = u.name || parsedName || u.globalName || u.username || ''
            const rank = u.milpac?.currentRank || (nickParts.length > 1 ? nickParts[0] : '')
            const displayName = rank ? `${rank} ${baseName}` : baseName
            return { id: u.id || String(u._id), displayName: displayName.trim() }
        })
        .filter(m => m.displayName)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return NextResponse.json({ members })
}
