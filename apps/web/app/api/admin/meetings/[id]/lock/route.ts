import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const LOCK_PERMISSIONS: Record<MeetingDepartment, string[]> = {
    j1: PERMISSIONS.meetings.lockJ1,
    j2: PERMISSIONS.meetings.lockJ2,
    j3: PERMISSIONS.meetings.lockJ3,
    j4: PERMISSIONS.meetings.lockJ4,
    j5: PERMISSIONS.meetings.lockJ5,
    j6: PERMISSIONS.meetings.lockJ6,
    j7: PERMISSIONS.meetings.lockJ7,
}

// POST /api/admin/meetings/[id]/lock  { locked: boolean }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meeting = await Db.meetings.findOne({ _id: new ObjectId(id) })
    if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!client.hasRoles(me, LOCK_PERMISSIONS[meeting.department])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
