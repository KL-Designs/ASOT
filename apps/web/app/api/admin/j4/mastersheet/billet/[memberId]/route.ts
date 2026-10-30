import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// PATCH — create or update billet_extras for a specific member
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { memberId } = await params
    const body = await req.json()
    const ALLOWED = ['billet', 'upToDate', 'lastUpdate']
    const updates: Partial<Pick<BilletExtra, 'billet' | 'upToDate' | 'lastUpdate'>> = {}
    for (const key of ALLOWED) {
        if (key in body) (updates as any)[key] = body[key]
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
    }

    /*
     * Find the SAME record the sheet is showing for this row. The list
     * (`GET ../billet`) attaches a row's billet data three ways, and looking
     * only for the first is why Apply appeared to do nothing on the others:
     *
     *  1. by `memberId` — a CSV row that was matched to an account;
     *  2. by the extras document's own `_id` — the stub rows for discharged
     *     members with no account, whose row id IS that `_id`;
     *  3. by display name — a CSV row never matched to an account, which the
     *     list still shows against the member of the same name.
     *
     * Missing (2) and (3) meant the edit was written to a brand-new document
     * the list never reads for that row, so the old value came straight back.
     */
    const user = await Db.users.findOne(
        { _id: memberId as any },
        { projection: { name: 1, 'guild.nickname': 1, 'guild.displayName': 1, globalName: 1, username: 1 } }
    )
    const memberName = user?.guild?.nickname || user?.guild?.displayName || user?.name || user?.globalName || user?.username || memberId

    let existing = await Db.billetExtras.findOne({ memberId })
    if (!existing && ObjectId.isValid(memberId)) {
        existing = await Db.billetExtras.findOne({ _id: new ObjectId(memberId) as BilletExtra['_id'] })
    }
    let adopt = false
    if (!existing && user) {
        const escaped = memberName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        existing = await Db.billetExtras.findOne({
            memberId: { $exists: false },
            memberName: { $regex: `^${escaped}$`, $options: 'i' },
        })
        // Now that it is known whose row this is, record it, so the next
        // edit takes the first path.
        adopt = !!existing
    }

    if (existing) {
        await Db.billetExtras.updateOne({ _id: existing._id }, { $set: { ...updates, ...(adopt ? { memberId } : {}) } })
    } else {
        await Db.billetExtras.insertOne({
            _id: new ObjectId() as BilletExtra['_id'],
            memberName,
            memberId,
            billet: (updates.billet ?? '') as string,
            upToDate: (updates.upToDate ?? false) as boolean,
            lastUpdate: (updates.lastUpdate ?? '') as string,
            importedAt: new Date(),
        })
    }

    return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { memberId } = await params

    const already = await Db.mastersheetRecycleBin.findOne({ originalTab: 'billet', originalId: memberId })
    if (already) return NextResponse.json({ error: 'Already in recycle bin' }, { status: 409 })

    const user = await Db.users.findOne({ _id: memberId as any },
        { projection: { name: 1, username: 1, 'guild.nickname': 1, 'guild.displayName': 1, globalName: 1 } })
    const displayName = (user as any)?.guild?.nickname || (user as any)?.guild?.displayName || (user as any)?.name || (user as any)?.globalName || (user as any)?.username || memberId
    const extra = await Db.billetExtras.findOne({ memberId })

    const byName = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    await Db.mastersheetRecycleBin.insertOne({
        _id: new ObjectId(),
        originalTab: 'billet',
        originalId: memberId,
        record: { memberId, displayName, extra },
        deletedAt: new Date(),
        deletedBy: me.id,
        deletedByName: byName,
    })
    return NextResponse.json({ ok: true })
}
