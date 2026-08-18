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

export type NavStatus = {
    /** The soonest operation the public can see, or null if none is scheduled. */
    nextOp: { id: string, title: string, date: string } | null
    /** Members currently connected to TeamSpeak, or null if the cache is cold. */
    teamspeakOnline: number | null
    /** Filled ORBAT slots — the active roster size. */
    roster: number | null
}

/**
 * Operations stay listed for a while after their start time (an op runs for
 * hours), so "next" means the soonest one that started less than six hours ago
 * or hasn't started at all — not simply `date >= now`.
 */
const RUNNING_WINDOW_MS = 6 * 60 * 60 * 1000

async function findNextOp(): Promise<NavStatus['nextOp']> {
    const op = await Db.operations.findOne(
        {
            deletedAt: { $exists: false },
            // 'In Development' is HQ-only and this route is public.
            status: { $in: ['Upcoming', 'Active'] },
            date: { $gte: new Date(Date.now() - RUNNING_WINDOW_MS) },
        },
        { sort: { date: 1 }, projection: { title: 1, date: 1 } },
    )
    if (!op) return null
    return { id: String(op._id), title: op.title, date: new Date(op.date).toISOString() }
}

export async function GET() {
    const [nextOp, roster] = await Promise.all([
        findNextOp().catch(() => null),
        Db.orbatPositions.countDocuments({ userId: { $ne: null } }).catch(() => null),
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
