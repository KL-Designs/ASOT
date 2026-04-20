import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// DELETE /api/admin/members/[id] — permanently delete a user from the database (J4 only)
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const user = await Db.users.findOne({ id })
    if (!user) {
        return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
    }

    await Db.users.deleteOne({ id })

    return NextResponse.json({ ok: true })
}
