import { NextRequest, NextResponse } from 'next/server'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { SNAPSHOTS_DIR } from '@/lib/snapshots'

const FILENAME_RE = /^snapshot-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/

// DELETE /api/snapshots/[filename] — delete a stored snapshot (J4 only)
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
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

    const { filename } = await params
    if (!FILENAME_RE.test(filename)) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const filePath = join(SNAPSHOTS_DIR, filename)
    if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    unlinkSync(filePath)
    return NextResponse.json({ message: 'Deleted' })
}
