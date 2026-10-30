import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { logAction } from '@/lib/logAction'
import { normaliseModUrl, sanitiseMod } from '@/lib/mods/mod-database'
import { canEditMods, toModView } from '@/lib/mods/access'

/** `PATCH` edits one Mod Database entry, `DELETE` removes it. J2 and J7 only. */

async function editor() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!canEditMods(me)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { me }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { me, error: denied } = await editor()
    if (denied) return denied

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const _id = new ObjectId(id)

    const existing = await Db.modDatabase.findOne({ _id })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { fields, error } = sanitiseMod(await req.json().catch(() => ({})), true)
    if (error) return NextResponse.json({ error }, { status: 400 })
    if (!Object.keys(fields).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

    const set: Record<string, unknown> = { ...fields }
    const unset: Record<string, ''> = {}
    if (fields.workshopUrl !== undefined) {
        const urlKey = normaliseModUrl(fields.workshopUrl)
        if (urlKey) {
            const clash = await Db.modDatabase.findOne({ urlKey, _id: { $ne: _id } })
            if (clash) return NextResponse.json({ error: `That link is already listed as "${clash.name}".` }, { status: 409 })
            set.urlKey = urlKey
        } else {
            unset.urlKey = ''
        }
    }

    const name = me.guild?.displayName || me.globalName || me.username || me.id
    set.updatedAt = new Date()
    set.updatedByName = name

    await Db.modDatabase.updateOne({ _id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) })

    logAction({
        action: 'mods.update', category: 'system', performedBy: me.id, performedByName: name,
        entityType: 'mod', entityId: id, target: fields.name ?? existing.name,
        details: { changed: Object.keys(fields) },
    }).catch(console.error)

    const fresh = await Db.modDatabase.findOne({ _id })
    return NextResponse.json(fresh ? toModView(fresh) : { ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { me, error: denied } = await editor()
    if (denied) return denied

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const existing = await Db.modDatabase.findOne({ _id: new ObjectId(id) })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await Db.modDatabase.deleteOne({ _id: existing._id })

    logAction({
        action: 'mods.delete', category: 'system', performedBy: me.id,
        performedByName: me.guild?.displayName || me.globalName || me.username || me.id,
        entityType: 'mod', entityId: id, target: existing.name,
        // Kept in the log, since the row itself is gone.
        before: { name: existing.name, workshopUrl: existing.workshopUrl, status: existing.status, notes: existing.notes },
    }).catch(console.error)

    return NextResponse.json({ ok: true })
}
