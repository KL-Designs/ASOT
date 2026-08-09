import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { GenerateToken } from '@/lib/encryption'
import { logAction } from '@/lib/logAction'

// POST /api/me/reset-token
// Regenerates the caller's session token, invalidating every other device's cookie
// (they all store the old token, which no longer matches any user). The response
// sets the new token as this device's cookie so the current session stays logged in.
export async function POST() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const newToken = GenerateToken()
    await Db.users.updateOne({ _id: me.id }, { $set: { token: newToken } })

    await logAction({
        action: 'member.reset-login-token',
        category: 'member',
        performedBy: me.id,
        performedByName: me.name || me.globalName || me.username,
        entityType: 'user',
        entityId: me.id,
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set('token', newToken, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
    return res
}
