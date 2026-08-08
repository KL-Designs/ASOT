import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


async function authStructure() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)
}

const UPLOAD_DIR = '../../storage/uploads/orbat'

const MIME_TO_EXT: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
}


// ── POST /api/admin/orbat/meta/patch ─────────────────────────────────────────
// Multipart form: category (string), sectionTitle (string, '' for category-level), file (File)
// Saves the file to ./uploads/orbat/ and upserts the patch filename in OrbatSectionMeta.

export async function POST(request: NextRequest) {
    if (!await authStructure()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const category = formData.get('category') as string | null
    const sectionTitleRaw = formData.get('sectionTitle') as string | null
    const file = formData.get('file') as File | null

    if (!category || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const ext = MIME_TO_EXT[file.type]
    if (!ext) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })

    const title: string | null = sectionTitleRaw === '' || sectionTitleRaw == null ? null : sectionTitleRaw

    // Delete old patch file if one exists
    const existing = await Db.orbatSectionMeta.findOne({ category, sectionTitle: title })
    if (existing?.patch) {
        const oldPath = path.join(UPLOAD_DIR, existing.patch)
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
    }

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

    const filename = `${category}-${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)

    await Db.orbatSectionMeta.updateOne(
        { category, sectionTitle: title },
        { $set: { patch: filename } },
        { upsert: true }
    )

    return NextResponse.json({ success: true, filename })
}


// ── DELETE /api/admin/orbat/meta/patch ────────────────────────────────────────
// Body: { category, sectionTitle }
// Removes the patch file from disk and clears the field in the DB.

export async function DELETE(request: NextRequest) {
    if (!await authStructure()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { category, sectionTitle } = await request.json()
    if (!category) return NextResponse.json({ error: 'Missing category' }, { status: 400 })

    const title: string | null = sectionTitle === '' || sectionTitle == null ? null : sectionTitle

    const doc = await Db.orbatSectionMeta.findOne({ category, sectionTitle: title })
    if (doc?.patch) {
        const filePath = path.join(UPLOAD_DIR, doc.patch)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    await Db.orbatSectionMeta.updateOne(
        { category, sectionTitle: title },
        { $unset: { patch: '' } }
    )

    return NextResponse.json({ success: true })
}
