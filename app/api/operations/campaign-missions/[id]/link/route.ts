import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/**
 * POST { daySlot: 'saturday' | 'sunday', operationId }
 * Links an operation to a campaign mission slot.
 * Also stamps campaignMissionId + daySlot on the operation document.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.operations.write)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    let missionId: ObjectId
    try {
        missionId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid mission ID' }, { status: 400 })
    }

    const { daySlot, operationId } = await request.json()
    if (!daySlot || !operationId) {
        return NextResponse.json({ error: 'daySlot and operationId are required' }, { status: 400 })
    }
    if (daySlot !== 'saturday' && daySlot !== 'sunday') {
        return NextResponse.json({ error: 'daySlot must be "saturday" or "sunday"' }, { status: 400 })
    }

    let opId: ObjectId
    try {
        opId = new ObjectId(operationId)
    } catch {
        return NextResponse.json({ error: 'Invalid operationId' }, { status: 400 })
    }

    // Check operation exists
    const operation = await Db.operations.findOne({ _id: opId })
    if (!operation) return NextResponse.json({ error: 'Operation not found' }, { status: 404 })

    const slotField = daySlot === 'saturday' ? 'saturdayOpId' : 'sundayOpId'

    // Update mission document
    await Db.campaignMissions.updateOne(
        { _id: missionId },
        { $set: { [slotField]: operationId } }
    )

    // Stamp the operation with the mission reference
    await Db.operations.updateOne(
        { _id: opId },
        { $set: { campaignMissionId: id, daySlot } }
    )

    return NextResponse.json({ ok: true })
}

/**
 * DELETE ?daySlot=saturday|sunday
 * Unlinks an operation from a mission slot.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.operations.write)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    let missionId: ObjectId
    try {
        missionId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid mission ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const daySlot = searchParams.get('daySlot')
    if (daySlot !== 'saturday' && daySlot !== 'sunday') {
        return NextResponse.json({ error: 'daySlot must be "saturday" or "sunday"' }, { status: 400 })
    }

    const slotField = daySlot === 'saturday' ? 'saturdayOpId' : 'sundayOpId'

    const mission = await Db.campaignMissions.findOne({ _id: missionId })
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const linkedOpId = mission[slotField]
    if (linkedOpId) {
        try {
            await Db.operations.updateOne(
                { _id: new ObjectId(linkedOpId) },
                { $unset: { campaignMissionId: '', daySlot: '' } }
            )
        } catch { /* ignore */ }
    }

    await Db.campaignMissions.updateOne(
        { _id: missionId },
        { $unset: { [slotField]: '' } }
    )

    return NextResponse.json({ ok: true })
}
