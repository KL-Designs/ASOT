import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'tfar')
const ALLOWED_EXTS = new Set(['.ts3_plugin', '.zip'])

async function ensureUploadDir() {
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
}

async function requireLead() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const isLead = client.hasRoles(me, PERMISSIONS.departmentLeads.j1)
    const isJ4 = client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!isLead && !isJ4) return null
    return me
}

export async function GET() {
    const me = await requireLead()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const plugins = await Db.tfarPlugins.find({}).sort({ uploadedAt: -1 }).toArray()
    return NextResponse.json({ plugins })
}

export async function POST(req: NextRequest) {
    const me = await requireLead()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const originalName = file.name
    const ext = path.extname(originalName).toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
        return NextResponse.json({ error: 'Only .ts3_plugin and .zip files are allowed' }, { status: 400 })
    }

    await ensureUploadDir()

    const timestamp = Date.now()
    const storedName = `tfar_${timestamp}${ext}`
    const filePath = path.join(UPLOAD_DIR, storedName)

    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    const userName: string = (me as unknown as { inGameName?: string; username?: string }).inGameName
        ?? (me as unknown as { username?: string }).username
        ?? 'Unknown'

    const doc = {
        originalName,
        storedName,
        ext,
        size: file.size,
        uploadedAt: new Date(),
        uploadedBy: userName,
        isCurrent: true,
    }

    await Db.tfarPlugins.updateMany({}, { $set: { isCurrent: false } })
    await Db.tfarPlugins.insertOne(doc)

    return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
    const me = await requireLead()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { storedName } = await req.json()
    if (!storedName) return NextResponse.json({ error: 'storedName required' }, { status: 400 })

    const doc = await Db.tfarPlugins.findOne({ storedName })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const filePath = path.join(UPLOAD_DIR, storedName)
    if (existsSync(filePath)) await unlink(filePath).catch(() => {})

    await Db.tfarPlugins.deleteOne({ storedName })

    if (doc.isCurrent) {
        const next = await Db.tfarPlugins.findOne({}, { sort: { uploadedAt: -1 } })
        if (next) await Db.tfarPlugins.updateOne({ _id: next._id }, { $set: { isCurrent: true } })
    }

    return NextResponse.json({ ok: true })
}
