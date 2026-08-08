import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const rawDate = new Date()
        const day = String(rawDate.getDate()).padStart(2, '0')
        const month = String(rawDate.getMonth() + 1).padStart(2, '0') // months are 0-indexed
        const year = rawDate.getFullYear()
        const formatted = `${day}/${month}/${year}`

        const defaultDate = new Date()
        defaultDate.setDate(defaultDate.getDate() + 7)
        defaultDate.setMinutes(0, 0, 0) // round to the hour

        const zeusPageId = new ObjectId().toHexString()
        const ocapPageId = new ObjectId().toHexString()

        const meUser = await Db.users.findOne({ _id: me.id as any }, { projection: { displayName: 1 } })
        const ownerName: string = (meUser as any)?.displayName ?? me.username ?? 'Unknown'

        const newOp = await Db.operations.insertOne({
            _id: new ObjectId(),
            title: `New Mission ${formatted}`,
            department: '1-0 HQ',
            date: defaultDate,
            loreDate: '',
            status: 'In Development' as const,
            ownedBy: me.id,
            ownedByName: ownerName,
            pages: [
                { id: zeusPageId, title: 'Zeus Notes', isMain: false, pageType: 'zeus', pageColor: '' },
                { id: ocapPageId, title: 'OCAP', isMain: false, pageType: 'ocap', pageColor: '#10b981' },
            ],
        })

        logAction({
            action: 'operation.create',
            category: 'operation',
            performedBy: me.id,
            performedByName: ownerName,
            target: `New Mission ${formatted}`,
            details: { operationId: newOp.insertedId.toString() },
        })

        return NextResponse.json({ success: true, id: newOp.insertedId }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}