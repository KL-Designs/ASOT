import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'

import fs from 'fs'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')

    if (!fs.existsSync(`./uploads/bio/${id}.jpg`)) return NextResponse.json('Media does not exist', { status: 404 })
    const path = `./uploads/bio/${id}.jpg`
    const ext = path.split('.').pop()?.toString().toLowerCase()
    const output = fs.readFileSync(path)

    let contentType: string
    switch (ext) {
        case 'jpg':
        case 'jpeg': contentType = 'image/jpeg'; break
        case 'png': contentType = 'image/png'; break
        default: contentType = 'image/jpeg';
    }

    return new NextResponse(output as BodyInit, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable"
        }
    })
}


export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!client.hasRoles(me, ['HQ Staff'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) return NextResponse.json({ error: 'No File provided' }, { status: 401 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    fs.writeFileSync(`./uploads/bio/${me.id}.jpg`, buffer)

    return NextResponse.json({ success: true })
}