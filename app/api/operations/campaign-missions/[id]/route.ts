import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/** PATCH — update mission name */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const body = await request.json()
    const updateFields: Record<string, unknown> = {}
    if (body.name !== undefined) updateFields.name = body.name
    if (body.sequence !== undefined) updateFields.sequence = body.sequence

    if (Object.keys(updateFields).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    await Db.campaignMissions.updateOne({ _id: missionId }, { $set: updateFields })
    return NextResponse.json({ ok: true })
}

/** DELETE — remove mission and unlink from operations */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    // Find the mission first to get linked op IDs
    const mission = await Db.campaignMissions.findOne({ _id: missionId })
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Unlink operations
    const unsetFields: Record<string, string> = {}
    if (mission.saturdayOpId) {
        try {
            await Db.operations.updateOne(
                { _id: new ObjectId(mission.saturdayOpId) },
                { $unset: { campaignMissionId: '', daySlot: '' } }
            )
        } catch { /* ignore invalid id */ }
    }
    if (mission.sundayOpId) {
        try {
            await Db.operations.updateOne(
                { _id: new ObjectId(mission.sundayOpId) },
                { $unset: { campaignMissionId: '', daySlot: '' } }
            )
        } catch { /* ignore invalid id */ }
    }

    await Db.campaignMissions.deleteOne({ _id: missionId })
    return NextResponse.json({ ok: true })
}
