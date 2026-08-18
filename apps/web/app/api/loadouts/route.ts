import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { parseLoadout, LoadoutParseError } from '@/lib/loadout/parse'
import { MAX_NAME, MAX_DESCRIPTION, MAX_RAW_BYTES, MAX_PER_MEMBER } from '@/lib/loadout/limits'
import { isKitIcon } from '@/lib/loadout/kit-icons'
import { normaliseTags } from '@/lib/loadout/tags'

export async function POST(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const raw = typeof body?.raw === 'string' ? body.raw.trim() : ''
    const name = (typeof body?.name === 'string' ? body.name : '').trim().slice(0, MAX_NAME) || 'Standard'
    const description = (typeof body?.description === 'string' ? body.description : '')
        .trim().slice(0, MAX_DESCRIPTION)

    // Private unless the member said otherwise. Publication is the one thing
    // here that cannot be quietly undone — a kit copied off the shelf is copied.
    const shared = body?.shared === true

    // Validated against the key list, not merely typed: it becomes a Record
    // lookup on a public page. An unknown value is dropped, not stored.
    const icon = isKitIcon(body?.icon) ? body.icon : undefined

    // Same treatment as the icon: validated against the vocabulary rather than
    // merely typed, de-duplicated and capped, because these become `Record`
    // lookups when chips render on the public shelf.
    const tags = normaliseTags(body?.tags)

    if (!raw) return NextResponse.json({ error: 'Paste your ACE arsenal export first.' }, { status: 400 })
    if (Buffer.byteLength(raw) > MAX_RAW_BYTES) {
        return NextResponse.json({ error: 'That export is too large to be a kit.' }, { status: 400 })
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
            { error: `You already have ${MAX_PER_MEMBER} kits — delete one first.` },
            { status: 400 },
        )
    }

    const now = new Date()
    const result = await Db.loadouts.insertOne({
        userId: me.id,
        name,
        ...(description ? { description } : {}),
        ...(icon ? { icon } : {}),
        ...(tags.length ? { tags } : {}),
        // The first loadout a member imports is their default; there is no
        // sensible alternative and it saves them a second click.
        isDefault: existing === 0,
        shared,
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
            { error: `You already have ${MAX_PER_MEMBER} kits — delete one first.` },
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
