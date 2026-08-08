import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'

/** Lightweight poll endpoint for the operation viewing page status bar. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const [op, att] = await Promise.all([
        Db.operations.findOne(
            { _id: operationId },
            { projection: { status: 1, date: 1 } }
        ),
        Db.operationAttendance.findOne(
            { operationId },
            { projection: { rsvpOpen: 1, rsvpOpenAt: 1, rsvpCloseOffsetMins: 1, confirmationOpen: 1, confirmationOpenedAt: 1, stage: 1 } }
        ),
    ])

    return NextResponse.json({
        operationStatus: op?.status ?? null,
        operationDate: op?.date ?? null,
        rsvpOpen: att?.rsvpOpen ?? false,
        rsvpOpenAt: att?.rsvpOpenAt ?? null,
        rsvpCloseOffsetMins: att?.rsvpCloseOffsetMins ?? 60,
        confirmationOpen: att?.confirmationOpen ?? false,
        confirmationOpenedAt: att?.confirmationOpenedAt ?? null,
        stage: att?.stage ?? null,
    })
}
