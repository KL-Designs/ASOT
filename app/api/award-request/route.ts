import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { AWARDS } from '@/lib/military/awards'

const VALID_AWARDS = new Set(AWARDS.map(a => a.label))

// POST /api/award-request — any logged-in guild member can nominate another for an award
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { awardName, targetUserId, targetUserName, notes } = body

    if (!awardName || !targetUserId || !targetUserName) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!VALID_AWARDS.has(awardName)) {
        return NextResponse.json({ error: 'Invalid award' }, { status: 400 })
    }

    if (targetUserId === me.id) {
        return NextResponse.json({ error: 'Cannot request an award for yourself' }, { status: 400 })
    }

    const award = AWARDS.find(a => a.label === awardName)!
    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const result = await Db.tickets.insertOne({
        type: 'j4-award',
        department: 'j4',
        status: 'open',
        awardName,
        awardType: award.type,
        targetUserId,
        targetUserName,
        issuedById: me.id,
        issuedByName: displayName,
        issuedAt: new Date(),
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
    } as Ticket)

    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}
