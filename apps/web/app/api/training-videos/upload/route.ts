import { NextRequest, NextResponse } from 'next/server'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { Readable } from 'stream'
import busboy from 'busboy'
import type { FileInfo } from 'busboy'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const ALLOWED_EXTS = new Set([
    '.mp4', '.mov', '.webm', '.avi', '.mkv',
    '.ogg', '.m4v', '.flv', '.wmv', '.ts', '.3gp',
])

const ALLOWED_MIME = new Set([
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
    'video/ogg', 'video/x-matroska', 'video/mp2t', 'video/3gpp',
    'video/x-flv', 'video/x-ms-wmv', 'video/x-m4v',
])

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.trainer)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    if (!req.body) return NextResponse.json({ error: 'No request body' }, { status: 400 })

    const dir = join(process.cwd(), 'public', 'uploads', 'training-videos')
    await mkdir(dir, { recursive: true })

    return new Promise<NextResponse>((resolve) => {
        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: { files: 1, fileSize: 4 * 1024 * 1024 * 1024 },
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
            if (mime && !ALLOWED_MIME.has(mime) && !mime.startsWith('video/')) {
                file.resume()
                done(NextResponse.json({ error: 'MIME type not allowed' }, { status: 400 }))
                return
            }

            const filename = `${crypto.randomUUID()}${ext}`
            const ws = createWriteStream(join(dir, filename))

            file.on('limit', () => { ws.destroy(); done(NextResponse.json({ error: 'File too large (max 4 GB)' }, { status: 413 })) })
            ws.on('error', err => done(NextResponse.json({ error: `Write failed: ${err.message}` }, { status: 500 })))
            ws.on('close', () => done(NextResponse.json({ url: `/uploads/training-videos/${filename}`, filename })))

            file.pipe(ws)
        })

        bb.on('error', (err: Error) => done(NextResponse.json({ error: `Parse error: ${err.message}` }, { status: 400 })))
        bb.on('finish', () => { if (!fileStarted && !settled) done(NextResponse.json({ error: 'No file received' }, { status: 400 })) })

        Readable.fromWeb(req.body as any).pipe(bb)
    })
}
