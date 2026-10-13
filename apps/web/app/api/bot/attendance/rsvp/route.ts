import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { applyRsvp } from '@/lib/attendance/rsvp'

/**
 * `POST /api/bot/attendance/rsvp` — a button on the Discord attendance post.
 *
 * Called by the bot, server to server, when a member presses *Attending* or
 * *Not attending*. The bot says who pressed it; this applies the same answer
 * the site's own RSVP route would (`applyRsvp`).
 *
 *   Authorization: Bearer ${BOT_API_SECRET}
 *   { operationId, discordId, status: 'attending' | 'not_attending' }
 *
 * The response's `message` is what the bot shows the member, so every outcome
 * — including the refusals — is written to be read by them.
 *
 * Only somebody the site knows as a current member can answer: the buttons sit
 * in a Discord channel, and who can see that channel is not the site's to
 * decide.
 */

function authorised(req: NextRequest): boolean {
    const secret = process.env.BOT_API_SECRET
    // No secret configured means the route is closed, not open.
    if (!secret) return false
    return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
    if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { operationId, discordId, status } = body as { operationId?: string; discordId?: string; status?: string }

    if (typeof operationId !== 'string' || !ObjectId.isValid(operationId) || typeof discordId !== 'string' || !/^\d{5,25}$/.test(discordId)) {
        return NextResponse.json({ ok: false, message: 'That button is no longer valid.' }, { status: 400 })
    }
    if (status !== 'attending' && status !== 'not_attending') {
        return NextResponse.json({ ok: false, message: 'That button is no longer valid.' }, { status: 400 })
    }

    const user = await Db.users.findOne(
        { id: discordId, isSkeletonAccount: { $ne: true } },
        { projection: { id: 1, discharged: 1 } },
    )
    if (!user || user.discharged) {
        return NextResponse.json({
            ok: false,
            message: 'You need to be a current ASOT member with a website account to sign up. Log in to the website once, then try again.',
        }, { status: 403 })
    }

    const operation = await Db.operations.findOne(
        { _id: new ObjectId(operationId), deletedAt: { $exists: false } },
        { projection: { title: 1 } },
    )
    if (!operation) return NextResponse.json({ ok: false, message: 'That operation no longer exists.' }, { status: 404 })

    const result = await applyRsvp(operation._id, discordId, status)
    if (!result.ok) {
        return NextResponse.json({
            ok: false,
            message: result.status === 403 ? `Sign-ups for ${operation.title} are closed.` : 'Sign-ups for that operation are not open.',
        }, { status: result.status })
    }

    const base = (process.env.NEXT_PUBLIC_BASEURL ?? '').replace(/\/+$/, '')
    return NextResponse.json({
        ok: true,
        message: status === 'attending'
            ? `You are down as attending ${operation.title}. Pick or change your position on the website: ${base}/operations/${operationId}/attendance`
            : `You are down as not attending ${operation.title}. You can change your answer until sign-ups close.`,
    })
}
