import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const title = searchParams.get('title')
    const date = searchParams.get('date')
    const loreDate = searchParams.get('loreDate')
    const department = searchParams.get('department')
    const themeColor = searchParams.get('themeColor')
    const pageTheme = searchParams.get('pageTheme')
    const coverImage = searchParams.get('coverImage')
    const status = searchParams.get('status')
    const mapWorld = searchParams.get('mapWorld')
    const customTheme = searchParams.get('customTheme')
    const isSingleMission = searchParams.get('isSingleMission')
    const ownedBy = searchParams.get('ownedBy')
    const ownedByName = searchParams.get('ownedByName')
    const billetPoints = searchParams.get('billetPoints')

    if (!id) return NextResponse.json({ error: 'Operation ID Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const isJ2LeadOrJ4 = client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
            || client.hasRoles(me, PERMISSIONS.members.editRestricted)

        if (title) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { title } })
        if (date) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { date: new Date(date) } })
        if (loreDate !== null) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { loreDate } })
        if (department) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { department } })
        if (themeColor) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { themeColor } })
        if (pageTheme) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { pageTheme: pageTheme as Operation['pageTheme'] } })
        if (coverImage !== null) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { coverImage } })
        if (status) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { status: status as Operation['status'] } })
        if (mapWorld !== null) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { mapWorld: mapWorld || undefined } })
        if (customTheme !== null) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { customTheme } })
        if (isSingleMission !== null) await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { isSingleMission: isSingleMission === 'true' } })
        if (ownedBy !== null && ownedByName !== null) {
            if (!isJ2LeadOrJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { ownedBy, ownedByName } })
        }
        if (billetPoints !== null) {
            if (!isJ2LeadOrJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            const pts = Math.max(0, Math.floor(Number(billetPoints)) || 2)
            await Db.operations.updateOne({ _id: new ObjectId(id) }, { $set: { billetPoints: pts } })
        }

        const changed = [title && 'title', date && 'date', department && 'department', status && 'status',
            ownedBy && 'owner', billetPoints && 'billetPoints'].filter(Boolean)
        if (changed.length > 0) {
            const editorName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
            logAction({
                action: 'operation.edit',
                category: 'operation',
                performedBy: me.id,
                performedByName: editorName,
                target: id ?? '',
                details: { changedFields: changed, operationId: id },
            })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
