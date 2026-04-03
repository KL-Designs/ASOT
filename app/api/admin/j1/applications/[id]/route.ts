import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// PATCH /api/admin/j1/applications/[id] — update status and/or notes
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    let objectId: ObjectId
    try {
        objectId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid application ID.' }, { status: 400 })
    }

    let body: Record<string, string>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { status, notes, linkedUserId, linkedUserDisplayName } = body
    const validStatuses = ['pending', 'reviewing', 'accepted', 'rejected']

    if (status && !validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'

    const update: Record<string, unknown> = {
        reviewedBy: displayName,
        reviewedAt: new Date(),
    }
    if (status) update.status = status
    if (notes !== undefined) update.notes = notes.trim()
    if (linkedUserId !== undefined) update.linkedUserId = linkedUserId || null
    if (linkedUserDisplayName !== undefined) update.linkedUserDisplayName = linkedUserDisplayName || null

    const result = await Db.j1Applications.updateOne(
        { _id: objectId },
        { $set: update }
    )

    if (result.matchedCount === 0) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
}
