import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { can } from '@/lib/operations/permissions'

/** GET /api/operations/[id]/attendance/custom-units — return custom units for this op */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    try {
        await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const att = await Db.operationAttendance.findOne(
        { operationId: new ObjectId(id) },
        { projection: { customUnits: 1 } }
    )
    return NextResponse.json({ customUnits: att?.customUnits ?? [] })
}

/** POST /api/operations/[id]/attendance/custom-units — add a custom unit */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!(await can(me, 'attendance.roles'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: { name: string; color?: string } = await req.json()
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const newUnit = {
        id: new ObjectId().toHexString(),
        name: body.name.trim(),
        color: body.color || undefined,
    }

    await Db.operationAttendance.updateOne(
        { operationId: new ObjectId(id) },
        { $push: { customUnits: newUnit } as any },
        { upsert: false }
    )

    return NextResponse.json({ ok: true, unit: newUnit })
}

/** PATCH /api/operations/[id]/attendance/custom-units — update a unit name/color */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!(await can(me, 'attendance.roles'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: { unitId: string; name?: string; color?: string } = await req.json()
    if (!body.unitId) return NextResponse.json({ error: 'unitId required' }, { status: 400 })

    const setFields: Record<string, unknown> = {}
    if (body.name?.trim()) setFields['customUnits.$.name'] = body.name.trim()
    if (body.color !== undefined) setFields['customUnits.$.color'] = body.color

    if (Object.keys(setFields).length > 0) {
        await Db.operationAttendance.updateOne(
            { operationId: new ObjectId(id), 'customUnits.id': body.unitId },
            { $set: setFields }
        )
    }

    return NextResponse.json({ ok: true })
}

/** DELETE /api/operations/[id]/attendance/custom-units?unitId=... — remove a unit */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const unitId = new URL(req.url).searchParams.get('unitId')

    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
        if (!(await can(me, 'attendance.roles'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!unitId) return NextResponse.json({ error: 'unitId required' }, { status: 400 })

    await Db.operationAttendance.updateOne(
        { operationId: new ObjectId(id) },
        { $pull: { customUnits: { id: unitId } } as any }
    )

    return NextResponse.json({ ok: true })
}
