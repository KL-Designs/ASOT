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

/**
 * Public: the facet rail and the submit form both need the vocabulary, and
 * the gallery is a public page. Retired tags are included only for a manager,
 * who has to see them to bring one back.
 *
 * Usage counts are computed here too, but only for a manager who explicitly
 * asks with `?counts=1` — GalleryTagsTab is the only caller that does.
 * Permission alone is the wrong guard: the other three callers
 * (gallery/submit/SubmitClient.tsx, j5/tabs/media/MediaTab.tsx,
 * j5/tabs/submissions/useSubmissions.ts) all discard the count, so gating on
 * the key alone means a J5 lead opening the *public* submit page pays for an
 * unindexed $match/$unwind/$group across every live gallery_media document,
 * on the public site's critical path, for a value nobody reads.
 *
 * They are NOT read from GET /api/gallery/admin/facets, which already
 * computes the identical `{ slug, label, count }` shape: that route is
 * gated on `gallery.manage`, and the tag vocabulary editor
 * (GalleryTagsTab.tsx) is gated on the separate `gallery.tags` key — the two
 * are granted independently (see lib/permissions.ts), so a J5 lead holding
 * `gallery.tags` without `gallery.manage` would get a silent 403 (no counts,
 * no error surfaced) from admin/facets despite being fully entitled to see
 * this vocabulary. Aggregating again here, gated the same way this route's
 * write endpoints already are, is what keeps the tab's counts working for
 * everyone who can reach the tab, at the cost of one small aggregation only
 * a manager's request ever pays for.
 */
export async function GET(request: NextRequest) {
    const all = await canManage()
    const wantsCounts = all && new URL(request.url).searchParams.get('counts') === '1'
    const tags = await Db.galleryTags
        .find(all ? {} : { retired: false })
        // `_id` tie-break, per the rule library-query.ts states: `order`
        // values are not guaranteed unique across active and retired tags
        // (POST assigns countDocuments(), which counts retired ones), and
        // Mongo's order between equal sort keys is unspecified — without
        // this the tab and the public facet rail can list a colliding pair
        // in different sequences, and the tie can flip between requests.
        .sort({ order: 1, _id: 1 })
        .toArray()

    let counts = new Map<string, number>()
    if (wantsCounts) {
        const rows = await Db.galleryMedia.aggregate<{ _id: string, count: number }>([
            { $match: { status: 'live' } },
            { $unwind: '$tags' },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
        ]).toArray()
        counts = new Map(rows.map(r => [r._id, r.count]))
    }

    return NextResponse.json({
        tags: tags.map(t => ({
            id: t._id.toString(),
            slug: t.slug,
            label: t.label,
            order: t.order,
            retired: t.retired,
            // Omitted rather than 0 for a caller that didn't ask — the
            // public facet rail and submit form have never carried this
            // field, and sending a fabricated 0 would claim knowledge this
            // response deliberately didn't pay to compute.
            ...(wantsCounts ? { count: counts.get(t.slug) ?? 0 } : {}),
        })),
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
