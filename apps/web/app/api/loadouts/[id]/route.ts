import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { MAX_NAME, MAX_DESCRIPTION } from '@/lib/loadout/limits'
import { isKitIcon } from '@/lib/loadout/kit-icons'

/**
 * Both handlers scope every query by `userId: me.id`. The id in the URL is
 * never trusted on its own — that filter is what stops one member editing
 * another's loadout, so it must stay on every query in this file.
 */
async function ownedLoadout(id: string) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

    const doc = await Db.loadouts.findOne({ _id: new ObjectId(id), userId: me.id })
    if (!doc) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
    return { me, doc }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const owned = await ownedLoadout(id)
    if (owned.error) return owned.error
    const { me, doc } = owned

    const body = await req.json().catch(() => null)
    const set: Partial<MemberLoadout> = { updatedAt: new Date() }

    if (typeof body?.name === 'string' && body.name.trim()) set.name = body.name.trim().slice(0, MAX_NAME)
    if (typeof body?.shared === 'boolean') set.shared = body.shared
    // Accepted with no UI behind it yet, so a description written at import time
    // is correctable rather than permanent-until-reimport.
    if (typeof body?.description === 'string') set.description = body.description.trim().slice(0, MAX_DESCRIPTION)
    // Same key-list check the create route uses — an unknown icon is ignored
    // rather than written, so a stored value is always renderable.
    if (isKitIcon(body?.icon)) set.icon = body.icon

    if (body?.isDefault === true) {
        // Exactly one default per member: clear the others first.
        // Best-effort, not atomic: two concurrent PATCHes can interleave and
        // leave two rows claiming default, or none. Deliberate — the cures
        // (a partial unique index, or a transaction needing a replica set) are
        // riskier than the defect, and the read side is already deterministic:
        // the profile picks `find(isDefault) ?? loadouts[0]` over a sorted
        // list, so exactly one loadout is ever shown either way.
        await Db.loadouts.updateMany({ userId: me.id }, { $set: { isDefault: false } })
        set.isDefault = true
    }

    await Db.loadouts.updateOne({ _id: doc._id, userId: me.id }, { $set: set })
    return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const owned = await ownedLoadout(id)
    if (owned.error) return owned.error
    const { me, doc } = owned

    await Db.loadouts.deleteOne({ _id: doc._id, userId: me.id })

    // Deleting the default would otherwise leave a member with loadouts but no
    // default, and the panel with nothing to show.
    if (doc.isDefault) {
        const next = await Db.loadouts.find({ userId: me.id }).sort({ updatedAt: -1 }).limit(1).toArray()
        if (next[0]) await Db.loadouts.updateOne({ _id: next[0]._id, userId: me.id }, { $set: { isDefault: true } })
    }

    return NextResponse.json({ ok: true })
}
