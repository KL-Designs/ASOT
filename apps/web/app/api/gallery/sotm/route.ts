import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import db from '@/lib/mongo'

const SOTM_DIR = path.resolve('./gallery/sotm')
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const SETTING_ID = 'screenshotOfMonth'

async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j5)) return null
    return me
}

/** GET — return current SOTM metadata, or null if none set */
export async function GET() {
    const doc = await db.siteSettings.findOne({ _id: SETTING_ID })
    if (!doc) return NextResponse.json(null)
    const { _id: _, ...sotm } = doc
    return NextResponse.json(sotm)
}

/** POST — upload a new SOTM image with metadata (multipart/form-data: file, dateTaken, credit) */
export async function POST(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const dateTaken = (formData.get('dateTaken') as string | null)?.trim()
    const credit = (formData.get('credit') as string | null)?.trim()
    const operationId = (formData.get('operationId') as string | null)?.trim() || undefined
    const operationTitle = (formData.get('operationTitle') as string | null)?.trim() || undefined

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!dateTaken) return NextResponse.json({ error: 'dateTaken is required' }, { status: 400 })
    if (!credit) return NextResponse.json({ error: 'credit is required' }, { status: 400 })
    if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })

    const safeName = path.basename(file.name).replace(/[^\w.\-() ]/g, '_')
    if (!safeName) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })

    const dest = path.join(SOTM_DIR, safeName)
    if (!dest.startsWith(SOTM_DIR + path.sep) && dest !== SOTM_DIR)
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })

    // Remove old file if different filename
    const existing = await db.siteSettings.findOne({ _id: SETTING_ID })
    if (existing && (existing as unknown as ScreenshotOfMonth).filename !== safeName) {
        const oldPath = path.join(SOTM_DIR, (existing as unknown as ScreenshotOfMonth).filename)
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
    }

    fs.mkdirSync(SOTM_DIR, { recursive: true })
    fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()))

    const me = await client.fetchMe().catch(() => null)
    const sotm: ScreenshotOfMonth = {
        filename: safeName,
        dateTaken,
        credit,
        setAt: new Date().toISOString(),
        setBy: me?.id ?? 'unknown',
        ...(operationId ? { operationId, operationTitle } : {}),
    }

    await db.siteSettings.updateOne(
        { _id: SETTING_ID },
        { $set: sotm as unknown as Record<string, unknown> },
        { upsert: true }
    )

    return NextResponse.json({ success: true })
}

/** DELETE — clear the current SOTM */
export async function DELETE() {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await db.siteSettings.findOne({ _id: SETTING_ID })
    if (existing) {
        const filePath = path.join(SOTM_DIR, (existing as unknown as ScreenshotOfMonth).filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        await db.siteSettings.deleteOne({ _id: SETTING_ID })
    }

    return NextResponse.json({ success: true })
}
