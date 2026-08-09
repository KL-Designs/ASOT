import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const limitParam = parseInt(searchParams.get('limit') ?? '200', 10)
    const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10)
    const trainerFilter = searchParams.get('trainerId') || undefined
    const typeFilter = searchParams.get('trainingTypeId') || undefined
    const statusFilter = searchParams.get('status') || undefined // event status

    const match: Record<string, unknown> = { deletedAt: { $exists: false } }
    if (trainerFilter) match.trainerId = trainerFilter
    if (typeFilter && ObjectId.isValid(typeFilter)) match.trainingTypeId = typeFilter
    if (statusFilter) match.status = statusFilter

    const pipeline = [
        { $match: match },
        { $sort: { scheduledAt: -1 } },
        { $skip: offsetParam },
        { $limit: limitParam },
        // Join with ticket
        {
            $lookup: {
                from: 'training_tickets',
                localField: '_id',
                foreignField: 'eventId',
                as: '_tickets',
                pipeline: [{ $project: { status: 1, billetPointsAwarded: 1, qualificationsAwarded: 1, reviewedByName: 1, reviewedAt: 1, attendees: 1 } }],
            },
        },
        {
            $addFields: {
                ticket: { $arrayElemAt: ['$_tickets', 0] },
            },
        },
        { $unset: '_tickets' },
    ]

    const events = await Db.trainingEvents.aggregate(pipeline).toArray()
    const total = await Db.trainingEvents.countDocuments(match)

    // Distinct trainers for filter dropdown
    const trainerList = await Db.trainingEvents.distinct('trainerId', { deletedAt: { $exists: false } })
    const trainerNames = await Db.trainingEvents
        .find({ trainerId: { $in: trainerList }, deletedAt: { $exists: false } })
        .project({ trainerId: 1, trainerName: 1 })
        .toArray()
    const trainers = Array.from(
        new Map(trainerNames.map(e => [e.trainerId, e.trainerName])).entries()
    ).map(([id, name]) => ({ id, name }))

    // Training types for filter
    const types = await Db.trainingTypes.find({}).project({ _id: 1, name: 1 }).toArray()

    return NextResponse.json({ events, total, trainers, types, limit: limitParam, offset: offsetParam })
}
