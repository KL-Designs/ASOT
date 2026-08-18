import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { readStatus, applyUploadedZip, parseBackupParts } from '@/lib/backups'
import { logAction } from '@/lib/logAction'

// POST /api/backups/upload — upload a backup ZIP and revert to it (backups.restore)
// Note: large uploads are buffered in memory via arrayBuffer(). Ensure the
// server runs with --max-old-space-size set appropriately for expected sizes.
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!await hasPermission(me, 'backups.restore')) {
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

    const file = formData.get('backup') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded (field name: "backup")' }, { status: 400 })
    if (!file.name.endsWith('.zip')) {
        return NextResponse.json({ error: 'File must be a .zip archive' }, { status: 400 })
    }

    // Comma-separated form field; absent means restore everything the archive
    // holds, malformed is refused rather than widened.
    const partsField = formData.get('parts')
    const parts = parseBackupParts(typeof partsField === 'string' ? partsField : null)
    if (!parts) {
        return NextResponse.json({ error: 'Invalid parts (expected any of: database, gallery, uploads)' }, { status: 400 })
    }

    // A form field, so it arrives as a string. Compared against 'true' exactly
    // rather than tested for truthiness — this deletes live files, and the
    // string "false" is truthy.
    const wipeMedia = formData.get('wipeMedia') === 'true'

    const uploadDir = join(tmpdir(), 'asot-backup-uploads')
    await mkdir(uploadDir, { recursive: true })
    const tmpPath = join(uploadDir, `upload-${Date.now()}.zip`)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(tmpPath, buffer)

    // Fire and forget; delete the tmp file after revert completes
    applyUploadedZip(tmpPath, parts, { wipeMedia })
        .finally(() => unlink(tmpPath).catch(() => {}))
        .catch(e => console.error('[backups] Upload-revert error:', e.message))

    await logAction({
        action: 'backup.upload_restore',
        category: 'system',
        performedBy: me.id,
        performedByName: me.name ?? me.id,
        details: { filename: file.name, parts, wipeMedia },
    })

    return NextResponse.json({ message: 'Upload received, revert started' }, { status: 202 })
}
