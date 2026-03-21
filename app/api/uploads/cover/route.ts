import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import fs from 'fs'


export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    const path = `./uploads/cover/${id}.png`
    if (!fs.existsSync(path)) return NextResponse.json('Not found', { status: 404 })

    const output = fs.readFileSync(path)
    return new NextResponse(output as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache',
        },
    })
}


export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    fs.mkdirSync('./uploads/cover', { recursive: true })
    fs.writeFileSync(`./uploads/cover/${me.id}.png`, buffer)

    return NextResponse.json({ success: true })
}


export async function DELETE() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const path = `./uploads/cover/${me.id}.png`
    if (fs.existsSync(path)) fs.unlinkSync(path)

    return NextResponse.json({ success: true })
}
