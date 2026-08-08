import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { CERTIFICATIONS } from '@/lib/military/certifications'
import { createNotification } from '@/lib/notifications'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const event = await Db.trainingEvents.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } })
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (event.approvalStatus !== 'approved') return NextResponse.json({ error: 'Event must be approved' }, { status: 400 })
    if (event.status !== 'Completed') return NextResponse.json({ error: 'Event must be completed before awarding qualifications' }, { status: 400 })

    const cert = CERTIFICATIONS.find(c => c.label === event.trainingTypeName)

    const unawarded = await Db.trainingAttendance.find({
        eventId: id,
        attended: true,
        qualificationAwarded: { $ne: true },
    }).toArray()

    if (unawarded.length === 0) {
        return NextResponse.json({ awarded: 0, certLabel: cert?.label ?? null })
    }

    const now = new Date()
    const issuedById = me.id
    const issuedByName = me.guild?.displayName ?? me.username
    const dateStr = now.toISOString().slice(0, 10)

    await Promise.all(unawarded.map(async record => {
        if (cert) {
            await Db.users.updateOne(
                { id: record.memberId },
                {
                    $push: {
                        'milpac.qualifications': {
                            date: dateStr,
                            qualification: cert.label,
                            issuedById,
                            issuedByName,
                        },
                    } as never,
                    ...(cert.points > 0 ? { $inc: { 'milpac.promotionPoints': cert.points } } : {}),
                }
            )
        }

        await Db.trainingAttendance.updateOne(
            { _id: record._id },
            { $set: { qualificationAwarded: true, updatedAt: now } }
        )

        await createNotification({
            userId: record.memberId,
            type: 'training_qualification_awarded',
            title: 'Qualification Awarded',
            body: cert
                ? `You have been awarded the ${cert.label} qualification${cert.points > 0 ? ` (+${cert.points} promotion points)` : ''}.`
                : `Your attendance at "${event.title}" has been confirmed.`,
            actionUrl: '/dashboard/milpac/me',
            relatedId: id,
        }).catch(console.error)
    }))

    return NextResponse.json({ awarded: unawarded.length, certLabel: cert?.label ?? null })
}
