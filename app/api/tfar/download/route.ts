import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { readFile, access } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'tfar')

export async function GET() {
    const current = await Db.tfarPlugins.findOne({ isCurrent: true })
    if (!current) {
        return NextResponse.json({ error: 'No TFAR plugin available' }, { status: 404 })
    }

    const filePath = path.join(UPLOAD_DIR, current.storedName as string)

    try {
        await access(filePath)
    } catch {
        return NextResponse.json({ error: 'Plugin file not found on server' }, { status: 404 })
    }

    const buffer = await readFile(filePath)
    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${current.originalName}"`,
            'Content-Length': String(buffer.length),
        },
    })
}
