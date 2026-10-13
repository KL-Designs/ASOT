import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { findClashes, type ClashCandidate } from '@/lib/training/clashes'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `GET /api/training/events/clashes?at=&duration=&exclude=` — what a training
 * booked at this time would overlap: missions, other training sessions, and
 * J2 or unit calendar events.
 *
 * A warning for the booking form, never a refusal — the booking routes do not
 * call this. For anybody who can book a training.
 *
 * Titles only. An operation still in development is reported as "A mission in
 * development" rather than by name, since a trainer is not necessarily
 * somebody who may see it.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.create)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const params = req.nextUrl.searchParams
    const at = new Date(params.get('at') ?? '')
    if (Number.isNaN(at.getTime())) return NextResponse.json({ clashes: [] })
    const duration = Math.min(24 * 60, Math.max(15, Number(params.get('duration')) || 60))
    const exclude = params.get('exclude')

    // A day either side is wide enough to catch anything that can overlap.
    const from = new Date(at.getTime() - DAY_MS)
    const to = new Date(at.getTime() + DAY_MS)

    const [trainings, operations, calendar] = await Promise.all([
        Db.trainingEvents.find({
            deletedAt: { $exists: false },
            status: 'Scheduled',
            approvalStatus: { $ne: 'rejected' },
            scheduledAt: { $gte: from, $lte: to },
            ...(exclude && ObjectId.isValid(exclude) ? { _id: { $ne: new ObjectId(exclude) } } : {}),
        }, { projection: { title: 1, scheduledAt: 1, durationMinutes: 1 } }).toArray(),
        Db.operations.find({
            deletedAt: { $exists: false },
            status: { $in: ['Upcoming', 'Active', 'In Development'] },
            date: { $gte: from, $lte: to },
        }, { projection: { title: 1, date: 1, status: 1 } }).toArray(),
        Db.calendarEvents.find({
            department: { $in: ['j2', 'unit'] },
            isPrivate: { $ne: true },
            isJ2Unavailability: { $ne: true },
            start: { $lte: to },
            end: { $gte: from },
        }, { projection: { title: 1, start: 1, end: 1 } }).toArray(),
    ])

    const candidates: ClashCandidate[] = [
        ...trainings.map(t => ({
            kind: 'training' as const, title: t.title, start: t.scheduledAt,
            end: new Date(new Date(t.scheduledAt).getTime() + (t.durationMinutes ?? 60) * 60_000),
        })),
        ...operations.map(o => ({
            kind: 'operation' as const,
            title: o.status === 'In Development' ? 'A mission in development' : o.title,
            start: o.date,
        })),
        ...calendar.map(c => ({ kind: 'calendar' as const, title: c.title, start: c.start, end: c.end })),
    ]

    return NextResponse.json({ clashes: findClashes(at, duration, candidates) })
}
