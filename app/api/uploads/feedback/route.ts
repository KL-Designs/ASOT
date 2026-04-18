import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'


export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const file = searchParams.get('file')

    if (!id || !file) return NextResponse.json({ error: 'id and file are required' }, { status: 400 })
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const base = path.resolve(`./uploads/feedback/${id}`)
    const filePath = path.resolve(path.join(base, file))

    // Path traversal guard
    if (!filePath.startsWith(base + path.sep) && filePath !== base) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }

    if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ext = path.extname(filePath).toLowerCase()
    let contentType = 'application/octet-stream'
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
    else if (ext === '.png') contentType = 'image/png'
    else if (ext === '.webp') contentType = 'image/webp'

    const buffer = fs.readFileSync(filePath)

    return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    })
}
