import { NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { getOnlineCache } from '@/lib/teamspeak/cache'

/**
 * The numbers behind the navbar's status rail.
 *
 * Public and unauthenticated — the rail renders on every page including the
 * signed-out landing, so this can't sit behind `fetchMe()`. Everything it
 * returns is already visible on public pages (the operations board, the ORBAT),
 * so nothing is leaked by not gating it.
 *
 * Every field is independently nullable and each source is caught separately:
 * a rail that loses its TeamSpeak count should still show the next operation,
 * and a rail that can't reach Mongo should still render rather than 500 the
 * page it's mounted in.
 */

export const dynamic = 'force-dynamic'

export type NavOp = {
    id: string
    title: string
    date: string
    status: 'Upcoming' | 'Active'
    /** Attendance lifecycle stage; null when the op has no attendance doc yet. */
    stage: NonNullable<OperationAttendance['stage']> | null
    /** Whether members can still self-report. Distinguishes "nobody has signed
        on yet" from "nobody can sign on yet", which read very differently. */
    rsvpOpen: boolean
    /** Members who have self-reported as attending (`rsvp === 'attending'`). */
    attending: number
    /** Members a section leader has confirmed actually turned up. */
    confirmed: number
}

export type NavStatus = {
    /** The soonest operation the public can see, or null if none is scheduled. */
    nextOp: NavOp | null
    /** Members currently connected to TeamSpeak, or null if the cache is cold. */
    teamspeakOnline: number | null
    /** Filled ORBAT slots, excluding inactive reservists — the active roster. */
    roster: number | null
}

/**
 * Reservists share the `orbat_positions` collection with platoon, HQ and
 * gamemaster slots and are told apart only by `category`, so a plain
 * "filled slots" count silently includes members flagged as inactive. Active
 * reservists are part of the roster; inactive ones are the whole point of the
 * distinction.
 */
const INACTIVE_CATEGORIES = ['inactiveReservist']

/**
 * Operations stay listed for a while after their start time (an op runs for
 * hours), so "next" means the soonest one that started less than six hours ago
 * or hasn't started at all — not simply `date >= now`.
 */
const RUNNING_WINDOW_MS = 6 * 60 * 60 * 1000

async function findNextOp(): Promise<NavOp | null> {
    const op = await Db.operations.findOne(
        {
            deletedAt: { $exists: false },
            // 'In Development' is HQ-only and this route is public.
            status: { $in: ['Upcoming', 'Active'] },
            date: { $gte: new Date(Date.now() - RUNNING_WINDOW_MS) },
        },
        { sort: { date: 1 }, projection: { title: 1, date: 1, status: 1 } },
    )
    if (!op) return null

    /* Only the two per-record booleans are projected. `records` carries a
       snapshot of every member's unit, section and role for the op, and the
       rail needs two counts off it — pulling the whole array into a public,
       uncached route would be a lot of document for two numbers. */
    const attendance = await Db.operationAttendance.findOne(
        { operationId: op._id },
        { projection: { 'records.rsvp': 1, 'records.confirmed': 1, stage: 1, rsvpOpen: 1 } },
    ).catch(() => null)

    const records = attendance?.records ?? []

    return {
        id: String(op._id),
        title: op.title,
        date: new Date(op.date).toISOString(),
        status: op.status === 'Active' ? 'Active' : 'Upcoming',
        stage: attendance?.stage ?? null,
        rsvpOpen: !!attendance?.rsvpOpen,
        attending: records.filter(r => r.rsvp === 'attending').length,
        confirmed: records.filter(r => r.confirmed).length,
    }
}

export async function GET() {
    const [nextOp, roster] = await Promise.all([
        findNextOp().catch(() => null),
        // `distinct` rather than a count: the rail says "N active", which should
        // be a headcount, and one member can occupy more than one slot.
        Db.orbatPositions
            .distinct('userId', { userId: { $ne: null }, category: { $nin: INACTIVE_CATEGORIES } })
            .then(ids => ids.length)
            .catch(() => null),
    ])

    // Read-only — the cron job owns refreshing this. A cold cache yields null
    // and the rail simply drops that segment rather than blocking on a
    // TeamSpeak connection while someone is waiting for a page to paint.
    let teamspeakOnline: number | null = null
    try {
        teamspeakOnline = getOnlineCache()?.clients.length ?? null
    } catch { }

    const body: NavStatus = { nextOp, teamspeakOnline, roster }
    return NextResponse.json(body, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
    })
}
