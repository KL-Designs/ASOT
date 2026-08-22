import { NextRequest, NextResponse } from 'next/server'
import { createWriteStream } from 'fs'
import { unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'
import busboy from 'busboy'
import type { FileInfo } from 'busboy'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { readStatus, applyUploadedZip, parseBackupParts, META_DIR } from '@/lib/backups'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

/**
 * POST /api/backups/upload — upload a backup ZIP and revert to it.
 *
 * Streamed to disk with busboy, not read with `request.formData()`.
 *
 * `formData()` materialises the entire multipart body in memory before the
 * handler sees any of it, so a backup archive that included the uploads or
 * gallery — the exact case this feature exists for — died with a bare
 * "Failed to parse form data" and no indication that size was the reason.
 * The archive is the whole point of this route and can legitimately be
 * gigabytes, so it never touches the heap now: bytes go from the socket to a
 * file as they arrive. Same approach as `api/training-videos/upload`.
 *
 * The incoming file lands beside the backups on the bind-mounted volume rather
 * than in `os.tmpdir()`, which inside a container is frequently tmpfs — writing
 * a multi-gigabyte archive there would just be buffering it in RAM again by
 * another name.
 */

/** Refused mid-stream, so an oversized archive costs a 413 rather than the
 *  disk. Generous: this is a whole-site restore point. */
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024 * 1024

const INCOMING_DIR = join(META_DIR, 'incoming')

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

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
        return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    }
    if (!request.body) return NextResponse.json({ error: 'No request body' }, { status: 400 })

    await mkdir(INCOMING_DIR, { recursive: true })

    return new Promise<NextResponse>(resolve => {
        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: { files: 1, fileSize: MAX_ARCHIVE_BYTES },
        })

        const fields: Record<string, string> = {}
        let tmpPath: string | null = null
        let filename = ''
        let fileStarted = false
        let writeClosed = false
        let parseFinished = false
        let settled = false

        /** Refusing the request means the partial archive is dead weight. */
        const discard = () => { if (tmpPath) unlink(tmpPath).catch(() => { }) }

        const fail = (res: NextResponse) => {
            if (settled) return
            settled = true
            discard()
            resolve(res)
        }

        // Both halves have to be in before the revert can start: the file is
        // only useful with the fields that say what to restore from it, and
        // multipart order is the client's choice, not something to rely on.
        const finish = async () => {
            if (settled || !parseFinished || !writeClosed) return

            if (!fileStarted || !tmpPath) return fail(NextResponse.json({ error: 'No file uploaded (field name: "backup")' }, { status: 400 }))

            // Absent means restore everything the archive holds; malformed is
            // refused rather than widened.
            const parts = parseBackupParts(fields.parts ?? null)
            if (!parts) return fail(NextResponse.json({ error: 'Invalid parts (expected any of: database, gallery, uploads)' }, { status: 400 }))

            // Compared against 'true' exactly rather than tested for
            // truthiness — this deletes live files, and the string "false" is
            // truthy.
            const wipeMedia = fields.wipeMedia === 'true'

            const path = tmpPath
            // Fire and forget; the archive is removed once the revert is done
            // with it, whether it succeeded or not.
            applyUploadedZip(path, parts, { wipeMedia })
                .finally(() => unlink(path).catch(() => { }))
                .catch(e => console.error('[backups] Upload-revert error:', e.message))

            await logAction({
                action: 'backup.upload_restore',
                category: 'system',
                performedBy: me.id,
                performedByName: me.name ?? me.id,
                details: { filename, parts, wipeMedia },
            })

            settled = true
            resolve(NextResponse.json({ message: 'Upload received, revert started' }, { status: 202 }))
        }

        bb.on('field', (name, value) => {
            fields[name] = value
            // Rejected as soon as it is known to be wrong. The client sends the
            // fields ahead of the file precisely so a bad request costs one
            // round trip instead of a multi-gigabyte upload.
            if (name === 'parts' && !parseBackupParts(value)) {
                fail(NextResponse.json({ error: 'Invalid parts (expected any of: database, gallery, uploads)' }, { status: 400 }))
            }
        })

        bb.on('file', (name, file, info: FileInfo) => {
            if (settled || name !== 'backup') { file.resume(); return }

            fileStarted = true
            filename = info.filename

            if (!filename.toLowerCase().endsWith('.zip')) {
                file.resume()
                return fail(NextResponse.json({ error: 'File must be a .zip archive' }, { status: 400 }))
            }

            tmpPath = join(INCOMING_DIR, `upload-${Date.now()}.zip`)
            const ws = createWriteStream(tmpPath)

            file.on('limit', () => {
                ws.destroy()
                fail(NextResponse.json({ error: `Archive is larger than ${MAX_ARCHIVE_BYTES / 1024 / 1024 / 1024}GB` }, { status: 413 }))
            })
            ws.on('error', err => fail(NextResponse.json({ error: `Write failed: ${err.message}` }, { status: 500 })))
            ws.on('close', () => { writeClosed = true; void finish() })

            file.pipe(ws)
        })

        bb.on('error', (err: Error) => fail(NextResponse.json({ error: `Parse error: ${err.message}` }, { status: 400 })))

        bb.on('finish', () => {
            parseFinished = true
            // No file at all: nothing will ever close a write stream, so this
            // is the only thing that can end the request.
            if (!fileStarted) { void finish(); return }
            void finish()
        })

        Readable.fromWeb(request.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(bb)
    })
}
