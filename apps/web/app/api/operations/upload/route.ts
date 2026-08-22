import { NextRequest, NextResponse } from "next/server"
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import crypto from 'crypto'
import fs from 'fs'

import { OPERATION_PRESET, normaliseImage } from '@/lib/uploads/image'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

const MAGIC: Array<{ bytes: number[]; offset?: number }> = [
    { bytes: [0xFF, 0xD8, 0xFF] },
    { bytes: [0x89, 0x50, 0x4E, 0x47] },
    { bytes: [0x47, 0x49, 0x46, 0x38] },
    { bytes: [0x52, 0x49, 0x46, 0x46] },
]

function isAllowedImage(buffer: Buffer): boolean {
    return MAGIC.some(({ bytes, offset = 0 }) => bytes.every((b, i) => buffer[offset + i] === b))
}

export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (!isAllowedImage(buffer)) return NextResponse.json({ error: 'File content does not match an allowed image type' }, { status: 400 })

    // Bounded and re-encoded like every other upload but the gallery.
    // OPERATION_PRESET preserves the format so the stored extension still
    // describes the bytes — this route serves images back by that extension.
    const result = await normaliseImage(buffer, OPERATION_PRESET)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    // Taken from what was actually written rather than from the upload's own
    // name: re-encoding can change the format, and the URL below has to agree
    // with the file on disk.
    const outExt = result.image.format === 'jpeg' ? 'jpg' : result.image.format

    const id = crypto.randomUUID()

    if (!fs.existsSync('../../storage/uploads/operations')) fs.mkdirSync('../../storage/uploads/operations', { recursive: true })
    fs.writeFileSync(`../../storage/uploads/operations/${id}.${outExt}`, result.image.buffer)

    return NextResponse.json({ url: `/api/operations/image?id=${id}&ext=${outExt}` })
}
