import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Mission ID Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const op = await Db.operations.findOne({ _id: new ObjectId(id) }, { projection: { title: 1 } })

        await Db.operations.updateOne(
            { _id: new ObjectId(id) },
            { $set: { deletedAt: new Date(), deletedBy: me.id, deletedByName: me.guild.displayName } }
        )

        const deleterName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
        logAction({
            action: 'operation.delete',
            category: 'operation',
            performedBy: me.id,
            performedByName: deleterName,
            target: op?.title ?? id,
            details: { operationId: id },
        })

        return NextResponse.json({ success: true }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}