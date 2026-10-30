import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'
import { newMissionContent } from '@/lib/operations/default-template'


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

        // Starts from the J2 default template when one is set; otherwise from
        // the two system pages alone, as it always has. `?kind=campaign` is a
        // campaign's mission slot, which has a default of its own.
        const kind = searchParams.get('kind') === 'campaign' ? 'campaign' : 'single'
        const template = await Db.operationTemplates.findOne(kind === 'campaign' ? { isCampaignDefault: true } : { isDefault: true })
        const content = newMissionContent(template, () => new ObjectId().toHexString())

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
            ...content,
            // The template's document itself, so the mission opens with its
            // content; see OperationTemplate.yjsState.
            ...(template?.yjsState ? { yjsState: template.yjsState } : {}),
        })

        logAction({
            action: 'operation.create',
            category: 'operation',
            performedBy: me.id,
            performedByName: ownerName,
            target: `New Mission ${formatted}`,
            details: { operationId: newOp.insertedId.toString(), ...(template ? { fromDefaultTemplate: template.name } : {}) },
        })

        return NextResponse.json({ success: true, id: newOp.insertedId }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}