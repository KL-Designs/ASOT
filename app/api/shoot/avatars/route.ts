import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'

// GET /api/shoot/avatars — public list of member avatar URLs for the /shoot minigame
export async function GET() {
    const users = await Db.users
        .find({
            isSkeletonAccount: { $ne: true },
            $or: [
                { 'guild.avatarURL': { $exists: true, $ne: '' } },
                { avatarURL:         { $exists: true, $ne: '' } },
            ],
        })
        .project({ 'guild.avatarURL': 1, avatarURL: 1, 'guild.nickname': 1, globalName: 1, username: 1 })
        .toArray()

    const avatars = users
        .map(u => ({
            name: (u.guild?.nickname || u.globalName || u.username || 'Unknown') as string,
            url:  (u.guild?.avatarURL || u.avatarURL) as string,
        }))
        .filter(a => !!a.url)

    return NextResponse.json(avatars)
}
