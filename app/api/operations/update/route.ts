import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


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

    if (!id) return NextResponse.json({ error: 'Operation ID Missing' }, { status: 401 })

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

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

        return NextResponse.json({ success: true }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
