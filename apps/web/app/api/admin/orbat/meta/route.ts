import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


async function authStructure() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)
}


// ── GET /api/admin/orbat/meta ─────────────────────────────────────────────────
// Returns all OrbatSectionMeta documents. Public — used by the public ORBAT and
// Milpacs pages to apply colors and patch images.

export async function GET() {
    const docs = await Db.orbatSectionMeta.find({}).toArray()
    return NextResponse.json(JSON.parse(JSON.stringify(docs)))
}


// ── PATCH /api/admin/orbat/meta ───────────────────────────────────────────────
// Body: { category, sectionTitle, color }
// Upserts the color field for the given category+section (or category-level if
// sectionTitle is null / empty string).

export async function PATCH(request: NextRequest) {
    if (!await authStructure()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { category, sectionTitle, color, discordRoleId, tsGroupId } = await request.json()
    if (!category) {
        return NextResponse.json({ error: 'Missing category' }, { status: 400 })
    }

    const setFields: Record<string, string | number> = {}
    if (typeof color === 'string') setFields.color = color
    if (typeof discordRoleId === 'string') setFields.discordRoleId = discordRoleId
    if (typeof tsGroupId === 'number') setFields.tsGroupId = tsGroupId

    if (Object.keys(setFields).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Normalise: empty string sent from client means category-level (null in DB)
    const title: string | null = sectionTitle === '' || sectionTitle == null ? null : sectionTitle

    await Db.orbatSectionMeta.updateOne(
        { category, sectionTitle: title },
        { $set: setFields },
        { upsert: true }
    )

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/meta ──────────────────────────────────────────────
// Body: { category, sectionTitle, field: 'patch' | 'color' }
// Clears one field. For 'patch', also removes the file from disk.

export async function DELETE(request: NextRequest) {
    if (!await authStructure()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { category, sectionTitle, field } = await request.json()
    if (!category || !field) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const title: string | null = sectionTitle === '' || sectionTitle == null ? null : sectionTitle

    if (field === 'patch') {
        const doc = await Db.orbatSectionMeta.findOne({ category, sectionTitle: title })
        if (doc?.patch) {
            const path = `./uploads/orbat/${doc.patch}`
            if (fs.existsSync(path)) fs.unlinkSync(path)
        }
    }

    await Db.orbatSectionMeta.updateOne(
        { category, sectionTitle: title },
        { $unset: { [field]: '' } }
    )

    return NextResponse.json({ success: true })
}
