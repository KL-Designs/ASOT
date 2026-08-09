import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join, resolve, sep } from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'recruitment')

// The extension is derived from this validated MIME type, never from the
// client-supplied filename — an attacker-chosen filename extension served
// statically out of public/ is a stored-XSS vector (e.g. a "recruit-bg.html"
// upload that spoofs an image/* Content-Type in the multipart form).
const EXT_BY_TYPE: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let form: FormData
    try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad form data' }, { status: 400 }) }

    const file = form.get('image') as File | null
    const ext = file ? EXT_BY_TYPE[file.type] : undefined
    if (!file || !ext)
        return NextResponse.json({ error: 'No valid image file' }, { status: 400 })

    const name = `recruit-bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    await mkdir(UPLOAD_DIR, { recursive: true })
    await writeFile(join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()))

    return NextResponse.json({ url: `/uploads/recruitment/${name}` })
}

export async function DELETE(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: { url: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    // Only allow deleting a single file directly inside the recruitment
    // upload folder — reject anything containing a path separator or '..'
    // (a prefix-only check like startsWith('uploads/recruitment/') would
    // still let 'uploads/recruitment/../../.env' through), then re-verify
    // containment against the resolved absolute path as defense in depth.
    const urlPath = body.url?.replace(/^\/+/, '') ?? ''
    const rel = urlPath.startsWith('uploads/recruitment/') ? urlPath.slice('uploads/recruitment/'.length) : ''
    if (!rel || rel.includes('/') || rel.includes('\\') || rel.includes('..'))
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

    const resolvedDir = resolve(UPLOAD_DIR) + sep
    const filePath = resolve(UPLOAD_DIR, rel)
    if (!filePath.startsWith(resolvedDir))
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

    await unlink(filePath).catch(() => null)

    return NextResponse.json({ ok: true })
}
