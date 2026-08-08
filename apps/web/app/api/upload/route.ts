import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import crypto from 'crypto'
import fs from 'fs'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

const MAGIC: Array<{ ext: string; bytes: number[]; offset?: number }> = [
    { ext: 'jpg',  bytes: [0xFF, 0xD8, 0xFF] },
    { ext: 'png',  bytes: [0x89, 0x50, 0x4E, 0x47] },
    { ext: 'gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
    { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
]

function isAllowedImage(buffer: Buffer): boolean {
    for (const { bytes, offset = 0 } of MAGIC) {
        if (bytes.every((b, i) => buffer[offset + i] === b)) return true
    }
    return false
}

export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (!isAllowedImage(buffer)) return NextResponse.json({ error: 'File content does not match an allowed image type' }, { status: 400 })

    const id = crypto.randomUUID()

    if (!fs.existsSync('./uploads/documents')) fs.mkdirSync('./uploads/documents', { recursive: true })
    fs.writeFileSync(`./uploads/documents/${id}.${ext}`, buffer)

    return NextResponse.json({ url: `/api/upload/image?id=${id}&ext=${ext}` })
}
