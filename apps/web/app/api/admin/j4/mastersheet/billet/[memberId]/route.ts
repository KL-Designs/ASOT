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

    const existing = await Db.billetExtras.findOne({ memberId })
    if (existing) {
        await Db.billetExtras.updateOne({ memberId }, { $set: updates })
    } else {
        const user = await Db.users.findOne(
            { _id: memberId as any },
            { projection: { name: 1, 'guild.nickname': 1, 'guild.displayName': 1, globalName: 1, username: 1 } }
        )
        const memberName = user?.guild?.nickname || user?.guild?.displayName || user?.name || user?.globalName || user?.username || memberId
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
