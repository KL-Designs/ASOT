import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'recruitment')
const ALLOWED    = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let form: FormData
    try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad form data' }, { status: 400 }) }

    const file = form.get('image') as File | null
    if (!file || !ALLOWED.has(file.type))
        return NextResponse.json({ error: 'No valid image file' }, { status: 400 })

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
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

    // Only allow deleting files inside the recruitment upload folder
    const urlPath = body.url?.replace(/^\/+/, '')
    if (!urlPath?.startsWith('uploads/recruitment/'))
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

    const filePath = join(process.cwd(), 'public', urlPath)
    await unlink(filePath).catch(() => null)

    return NextResponse.json({ ok: true })
}
