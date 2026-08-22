import { NextRequest, NextResponse } from 'next/server'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { Readable } from 'stream'
import busboy from 'busboy'
import type { FileInfo } from 'busboy'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

const ALLOWED_EXTS = new Set([
    '.mp4', '.mov', '.mp3', '.webm', '.avi', '.mkv',
    '.ogg', '.m4v', '.m4a', '.flv', '.wmv', '.ts', '.3gp',
])

const ALLOWED_MIME = new Set([
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
    'video/ogg', 'video/x-matroska', 'video/mp2t', 'video/3gpp',
    'video/x-flv', 'video/x-ms-wmv', 'video/x-m4v',
    'audio/mpeg', 'audio/mp4', 'audio/ogg',
])

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !(await hasPermission(me, 'departmentLeads.j1'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
        return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    }

    if (!req.body) {
        return NextResponse.json({ error: 'No request body' }, { status: 400 })
    }

    const dir = join(process.cwd(), 'public', 'uploads', 'recruitment')
    try {
        await mkdir(dir, { recursive: true })
    } catch (e) {
        return NextResponse.json({ error: `Failed to create upload directory: ${e instanceof Error ? e.message : e}` }, { status: 500 })
    }

    return new Promise<NextResponse>((resolve) => {
        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: { files: 1, fileSize: 2 * 1024 * 1024 * 1024 },
        })

        let settled = false
        let fileStarted = false
        const done = (r: NextResponse) => { if (!settled) { settled = true; resolve(r) } }

        bb.on('file', (_field: string, file: NodeJS.ReadableStream, info: FileInfo) => {
            fileStarted = true
            const ext = extname(info.filename).toLowerCase()

            if (!ALLOWED_EXTS.has(ext)) {
                file.resume()
                done(NextResponse.json({ error: `File type "${ext}" not allowed` }, { status: 400 }))
                return
            }

            const mime = info.mimeType
            if (mime && !ALLOWED_MIME.has(mime) && !mime.startsWith('video/') && !mime.startsWith('audio/')) {
                file.resume()
                done(NextResponse.json({ error: 'MIME type not allowed' }, { status: 400 }))
                return
            }

            const filename = `${crypto.randomUUID()}${ext}`
            const ws = createWriteStream(join(dir, filename))

            file.on('limit', () => {
                ws.destroy()
                done(NextResponse.json({ error: 'File too large (max 2 GB)' }, { status: 413 }))
            })
            ws.on('error', err => done(NextResponse.json({ error: `Write failed: ${err.message}` }, { status: 500 })))
            ws.on('close', () => done(NextResponse.json({ url: `/uploads/recruitment/${filename}` })))

            file.pipe(ws)
        })

        bb.on('error', (err: Error) => done(NextResponse.json({ error: `Parse error: ${err.message}` }, { status: 400 })))
        // Only error when no file was found at all — if fileStarted is true, ws.on('close') will resolve
        bb.on('finish', () => { if (!fileStarted && !settled) done(NextResponse.json({ error: 'No file received' }, { status: 400 })) })

        Readable.fromWeb(req.body as any).pipe(bb)
    })
}
