import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'

const LOCK_KEYS: Record<MeetingDepartment, string> = {
    j1: 'meetings.lockJ1',
    j2: 'meetings.lockJ2',
    j3: 'meetings.lockJ3',
    j4: 'meetings.lockJ4',
    j5: 'meetings.lockJ5',
    j6: 'meetings.lockJ6',
    j7: 'meetings.lockJ7',
}

// POST /api/admin/meetings/[id]/lock  { locked: boolean }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!(await hasPermission(me, LOCK_KEYS[meeting.department]))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: { locked: boolean }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'

    if (body.locked) {
        await Db.meetings.updateOne({ _id: new ObjectId(id) }, {
            $set: { locked: true, lockedBy: me.id, lockedByName: displayName, lockedAt: new Date(), updatedAt: new Date() }
        })
    } else {
        await Db.meetings.updateOne({ _id: new ObjectId(id) }, {
            $set: { locked: false, updatedAt: new Date() },
            $unset: { lockedBy: '', lockedByName: '', lockedAt: '' },
        })
    }

    return NextResponse.json({ ok: true })
}
