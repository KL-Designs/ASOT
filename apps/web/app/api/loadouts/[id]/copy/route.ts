import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

/**
 * How many people have taken a kit off the shelf.
 *
 * A popularity signal, not an audit. The shelf is public, so most copies come
 * from visitors who are not signed in; counting only members would undercount
 * the majority, and requiring a sign-in to copy would put a wall in front of
 * the shelf's whole purpose. Signed-out visitors are therefore identified by a
 * long-lived cookie, which means the number is inflatable by anyone willing to
 * clear cookies repeatedly. That was the accepted trade.
 */

const VISITOR_COOKIE = 'kit_visitor'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * A signed-in member is their Discord id. Everyone else is a cookie. The
 * `anon:` prefix keeps the two id spaces from ever colliding — a Discord
 * snowflake is all digits, so nothing else could produce this string.
 *
 * Returns the cookie value to set when a visitor did not have one, since only
 * the response can set it.
 */
async function resolveActor(): Promise<{ actorId: string; freshCookie: string | null }> {
    const me = await client.fetchMe().catch(() => null)
    if (me) return { actorId: me.id, freshCookie: null }

    const jar = await cookies()
    const existing = jar.get(VISITOR_COOKIE)?.value
    if (existing) return { actorId: existing, freshCookie: null }

    const fresh = `anon:${randomUUID()}`
    return { actorId: fresh, freshCookie: fresh }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const loadoutId = new ObjectId(id)

    const doc = await Db.loadouts.findOne(
        { _id: loadoutId, shared: true },
        { projection: { userId: 1, copyCount: 1 } },
    )
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { actorId, freshCookie } = await resolveActor()

    // An owner copying their own kit is not a signal of anything.
    if (actorId === doc.userId) return NextResponse.json({ copyCount: doc.copyCount ?? 0 })

    const now = new Date()
    const result = await Db.loadoutCopies.updateOne(
        { loadoutId, actorId },
        { $inc: { copies: 1 }, $set: { lastCopiedAt: now }, $setOnInsert: { firstCopiedAt: now } },
        { upsert: true },
    )

    let copyCount = doc.copyCount ?? 0
    // Only a first copy by this actor moves the headline number. That single
    // condition is what makes it distinct people rather than total clicks.
    if (result.upsertedCount > 0) {
        await Db.loadouts.updateOne({ _id: loadoutId }, { $inc: { copyCount: 1 } })
        copyCount += 1
    }

    const res = NextResponse.json({ copyCount })
    if (freshCookie) {
        res.cookies.set(VISITOR_COOKIE, freshCookie, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: ONE_YEAR_SECONDS,
            secure: process.env.NODE_ENV === 'production',
        })
    }
    return res
}
