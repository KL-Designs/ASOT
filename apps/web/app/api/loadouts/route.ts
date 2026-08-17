import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { parseLoadout, LoadoutParseError } from '@/lib/loadout/parse'

/** Bounds, not preferences — see the plan's Global Constraints. */
const MAX_RAW_BYTES = 65536
const MAX_PER_MEMBER = 12
const MAX_NAME = 40

export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const raw = typeof body?.raw === 'string' ? body.raw.trim() : ''
    const name = (typeof body?.name === 'string' ? body.name : '').trim().slice(0, MAX_NAME) || 'Standard'

    if (!raw) return NextResponse.json({ error: 'Paste your ACE arsenal export first.' }, { status: 400 })
    if (Buffer.byteLength(raw) > MAX_RAW_BYTES) {
        return NextResponse.json({ error: 'That export is too large to be a loadout.' }, { status: 400 })
    }

    // Parse to validate only — the parsed form is never stored.
    try {
        parseLoadout(raw)
    } catch (err) {
        const message = err instanceof LoadoutParseError ? err.message : 'That export could not be read.'
        return NextResponse.json({ error: message }, { status: 400 })
    }

    const existing = await Db.loadouts.countDocuments({ userId: me.id })
    if (existing >= MAX_PER_MEMBER) {
        return NextResponse.json(
            { error: `You already have ${MAX_PER_MEMBER} loadouts — delete one first.` },
            { status: 400 },
        )
    }

    const now = new Date()
    const result = await Db.loadouts.insertOne({
        userId: me.id,
        name,
        // The first loadout a member imports is their default; there is no
        // sensible alternative and it saves them a second click.
        isDefault: existing === 0,
        shared: false,
        raw,
        createdAt: now,
        updatedAt: now,
    } as MemberLoadout)

    // countDocuments above is a check-then-act, so a burst of concurrent POSTs
    // can each see room and all insert. Re-check after the fact and undo our
    // own insert rather than reaching for a transaction: this is a bound on
    // storage abuse, not an invariant anything reads.
    if (await Db.loadouts.countDocuments({ userId: me.id }) > MAX_PER_MEMBER) {
        await Db.loadouts.deleteOne({ _id: result.insertedId, userId: me.id })
        return NextResponse.json(
            { error: `You already have ${MAX_PER_MEMBER} loadouts — delete one first.` },
            { status: 400 },
        )
    }

    await logAction({
        action: 'loadout.create',
        // 'member', singular — the ActionCategory union in types/logs.d.ts.
        category: 'member',
        performedBy: me.id,
        performedByName: me.username,
        entityType: 'loadout',
        entityId: String(result.insertedId),
    })

    return NextResponse.json({ id: String(result.insertedId) })
}
