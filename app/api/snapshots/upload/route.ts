import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { readStatus, revertSnapshot, ensureSnapshotsDir, SNAPSHOTS_DIR } from '@/lib/snapshots'

// POST /api/snapshots/upload — upload a snapshot ZIP and revert to it (J4 only)
// Note: large uploads (1.8GB+) are buffered in memory via arrayBuffer().
// Ensure the server runs with --max-old-space-size=4096.
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = await readStatus()
    if (status.state !== 'idle') {
        return NextResponse.json({ error: `Operation already in progress: ${status.state}` }, { status: 409 })
    }

    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
    }

    const file = formData.get('snapshot') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded (field name: "snapshot")' }, { status: 400 })

    if (!file.name.endsWith('.zip')) {
        return NextResponse.json({ error: 'File must be a .zip archive' }, { status: 400 })
    }

    ensureSnapshotsDir()
    const tmpPath = join(SNAPSHOTS_DIR, `upload-${Date.now()}.zip.tmp`)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(tmpPath, buffer)

    // Fire and forget; delete the tmp file after revert completes
    revertSnapshot(tmpPath)
        .finally(() => unlink(tmpPath).catch(() => {}))
        .catch(e => console.error('[snapshots] Upload-revert error:', e.message))

    return NextResponse.json({ message: 'Upload received, revert started' }, { status: 202 })
}
