import { NextRequest, NextResponse } from "next/server"
import client from '@/lib/discord'
import crypto from 'crypto'
import fs from 'fs'


export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, ['HQ Staff'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const id = crypto.randomUUID()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'

    if (!fs.existsSync('./uploads/operations')) fs.mkdirSync('./uploads/operations', { recursive: true })
    fs.writeFileSync(`./uploads/operations/${id}.${ext}`, buffer)

    return NextResponse.json({ url: `/api/operations/image?id=${id}&ext=${ext}` })
}
