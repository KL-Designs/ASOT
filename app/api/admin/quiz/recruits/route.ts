import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/quiz/recruits
// Returns all users with the 'Recruit' role for the quiz assignment selector.
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.quiz.assign)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await Db.users
        .find({})
        .project({ id: 1, globalName: 1, username: 1, 'guild.nickname': 1, 'guild.displayName': 1, 'guild.roles': 1, discharged: 1, isSkeletonAccount: 1 })
        .toArray()

    // Filter to Recruit role only; exclude discharged skeleton accounts
    const recruits = users
        .filter(u => !u.discharged && !u.isSkeletonAccount && client.hasRoles(u as User, ['Recruit']))
        .map(u => ({
            id: u.id,
            displayName: u.guild?.nickname || u.guild?.displayName || u.globalName || u.username || u.id,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return NextResponse.json({ recruits })
}
