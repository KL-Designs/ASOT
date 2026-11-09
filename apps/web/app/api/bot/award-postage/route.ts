import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { setPostagePreference } from '@/lib/military/award-postage-db'

/**
 * `POST /api/bot/award-postage` — the Yes / No buttons on the row 384
 * preference DM. Server to server from the bot:
 *
 *   Authorization: Bearer ${BOT_API_SECRET}
 *   { discordId, answer: 'yes' | 'no' }
 *
 * Sets the preference and nothing else. Postal details are sent to LT GEN
 * Thomas directly; nothing here could take them. `message` is shown to the member.
 */

function authorised(req: NextRequest): boolean {
    const secret = process.env.BOT_API_SECRET
    if (!secret) return false
    return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
    if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { discordId?: string; answer?: string }
    if (typeof body.discordId !== 'string' || !/^\d{5,25}$/.test(body.discordId) || (body.answer !== 'yes' && body.answer !== 'no')) {
        return NextResponse.json({ ok: false, message: 'That button is no longer valid.' }, { status: 400 })
    }
    const user = await Db.users.findOne({ id: body.discordId, isSkeletonAccount: { $ne: true } }, { projection: { id: 1, discharged: 1 } })
    if (!user || user.discharged) {
        return NextResponse.json({ ok: false, message: 'Only current members can answer this.' }, { status: 403 })
    }
    await setPostagePreference(body.discordId, body.answer, 'member')
    return NextResponse.json({
        ok: true,
        message: body.answer === 'yes'
            ? 'Thanks, noted. Please send your full name, address (or a PO box) and case colour to LT GEN Thomas directly in a DM. The website does not store them.'
            : 'No problem, noted. You will not be asked again; let LT GEN Thomas know if you change your mind.',
    })
}
