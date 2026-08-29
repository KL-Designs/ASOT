import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

const slugify = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function canManage() {
    const me = await client.fetchMe().catch(() => null)
    return !!me && await hasPermission(me, 'gallery.tags')
}

/** Public: the facet rail and the submit form both need the vocabulary, and
 *  the gallery is a public page. Retired tags are included only for a manager,
 *  who has to see them to bring one back. */
export async function GET() {
    const all = await canManage()
    const tags = await Db.galleryTags
        .find(all ? {} : { retired: false })
        .sort({ order: 1 })
        .toArray()

    return NextResponse.json({
        tags: tags.map(t => ({ id: t._id.toString(), slug: t.slug, label: t.label, order: t.order, retired: t.retired })),
    })
}

export async function POST(request: NextRequest) {
    if (!await canManage()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { label } = await request.json().catch(() => ({}))
    const trimmed = String(label ?? '').trim().slice(0, 40)
    if (!trimmed) return NextResponse.json({ error: 'A label is required' }, { status: 400 })

    const slug = slugify(trimmed)
    if (!slug) return NextResponse.json({ error: 'That label has no usable characters' }, { status: 400 })

    // A slug that already exists is un-retired rather than duplicated: the
    // unique index would refuse the insert anyway, and bringing one back is the
    // likely intent.
    const existing = await Db.galleryTags.findOne({ slug })
    if (existing) {
        await Db.galleryTags.updateOne({ _id: existing._id }, { $set: { retired: false, label: trimmed } })
        return NextResponse.json({ id: existing._id.toString(), slug, revived: true })
    }

    const order = await Db.galleryTags.countDocuments()
    const { insertedId } = await Db.galleryTags.insertOne({ slug, label: trimmed, order, retired: false } as GalleryTag)
    return NextResponse.json({ id: insertedId.toString(), slug })
}

/** Rename, reorder or retire. The slug never changes — media carry it, and a
 *  rename that cascaded across every document is exactly what retiring exists
 *  to avoid. */
export async function PATCH(request: NextRequest) {
    if (!await canManage()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, label, order, retired } = await request.json().catch(() => ({}))
    if (!ObjectId.isValid(String(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const set: Partial<GalleryTag> = {}
    if (typeof label === 'string' && label.trim()) set.label = label.trim().slice(0, 40)
    if (typeof order === 'number') set.order = order
    if (typeof retired === 'boolean') set.retired = retired
    if (!Object.keys(set).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

    await Db.galleryTags.updateOne({ _id: new ObjectId(String(id)) }, { $set: set })
    return NextResponse.json({ success: true })
}
