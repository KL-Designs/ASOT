import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

const CONTENT_TYPES: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4',
    mp3: 'audio/mpeg', wav: 'audio/wav', txt: 'text/plain',
}

// GET /api/admin/meetings/attachment?id=<uuid>&ext=<ext>
export async function GET(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = request.nextUrl.searchParams.get('id')
    const ext = request.nextUrl.searchParams.get('ext') || 'bin'
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const path = `../../storage/uploads/meetings/${id}.${ext}`
    if (!fs.existsSync(path)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const buffer = fs.readFileSync(path)
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' },
    })
}
