import { NextRequest, NextResponse } from 'next/server'
import busboy, { type FileInfo } from 'busboy'
import { Readable } from 'stream'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'training-guides')
const MAX_BYTES = 10 * 1024 * 1024  // 10 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    fs.mkdirSync(UPLOAD_DIR, { recursive: true })

    return new Promise<NextResponse>((resolve) => {
        let settled = false
        let fileStarted = false
        const done = (r: NextResponse) => { if (!settled) { settled = true; resolve(r) } }

        const bb = busboy({ headers: Object.fromEntries(req.headers), limits: { fileSize: MAX_BYTES } })

        bb.on('file', (_field: string, file: NodeJS.ReadableStream, info: FileInfo) => {
            fileStarted = true
            const { mimeType } = info
            if (!ALLOWED.has(mimeType)) {
                file.resume()
                return done(NextResponse.json({ error: 'Unsupported file type' }, { status: 415 }))
            }

            const ext = mimeType.split('/')[1].replace('jpeg', 'jpg')
            const filename = `tg-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
            const dest = path.join(UPLOAD_DIR, filename)
            const ws = fs.createWriteStream(dest)

            file.on('limit', () => {
                ws.destroy()
                fs.unlink(dest, () => {})
                done(NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 }))
            })

            file.pipe(ws)
            ws.on('close', () => done(NextResponse.json({ url: `/uploads/training-guides/${filename}` })))
            ws.on('error', (err: Error) => done(NextResponse.json({ error: err.message }, { status: 500 })))
        })

        bb.on('finish', () => {
            if (!fileStarted && !settled) done(NextResponse.json({ error: 'No file received' }, { status: 400 }))
        })

        bb.on('error', (err: Error) => done(NextResponse.json({ error: err.message }, { status: 400 })))

        Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb)
    })
}
