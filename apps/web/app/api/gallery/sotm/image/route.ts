import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import db from '@/lib/mongo'

const SOTM_DIR = path.resolve('../../storage/gallery/sotm')
const SETTING_ID = 'screenshotOfMonth'

const MIME_MAP: Record<string, string> = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.webp': 'image/webp',
}

export async function GET() {
    const doc = await db.siteSettings.findOne({ _id: SETTING_ID })
    if (!doc) return NextResponse.json({ error: 'No screenshot of the month set' }, { status: 404 })

    const filename = (doc as unknown as ScreenshotOfMonth).filename
    const filePath = path.join(SOTM_DIR, path.basename(filename))

    if (!filePath.startsWith(SOTM_DIR + path.sep) || !fs.existsSync(filePath))
        return NextResponse.json({ error: 'Image not found' }, { status: 404 })

    const ext = path.extname(filename).toLowerCase()
    const contentType = MIME_MAP[ext] ?? 'image/jpeg'
    const buffer = fs.readFileSync(filePath)

    return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=0, must-revalidate',
        },
    })
}
