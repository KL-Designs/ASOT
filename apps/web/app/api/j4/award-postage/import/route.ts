import { NextRequest, NextResponse } from 'next/server'
import { RANKS_FLAT } from '@asot/lib'
import Db from '@/lib/mongo'
import { memberName, setPostagePreference } from '@/lib/military/award-postage-db'
import { matchRows, parseImport } from '@/lib/military/award-postage-import'
import { postageGate } from '../gate'

/**
 * POST /api/j4/award-postage/import — `{ text, apply }`. Two columns pasted or
 * read from a file: member, and yes / no / blank. Without `apply` it only
 * reports what it would do; with it, each changed preference is set exactly
 * as a click on the register would (and logged the same way).
 */
export async function POST(req: NextRequest) {
    const g = await postageGate()
    if (g.error) return g.error
    const body = await req.json().catch(() => ({})) as { text?: unknown; apply?: unknown }
    if (typeof body.text !== 'string' || !body.text.trim()) return NextResponse.json({ error: 'Paste two columns: member and yes or no.' }, { status: 400 })
    if (body.text.length > 500_000) return NextResponse.json({ error: 'That is too long to import in one go.' }, { status: 400 })

    const rows = parseImport(body.text)
    const [users, prefs] = await Promise.all([
        Db.users.find(
            { isSkeletonAccount: { $ne: true } },
            { projection: { id: 1, name: 1, username: 1, globalName: 1, 'guild.nickname': 1, 'guild.displayName': 1 } },
        ).toArray(),
        Db.awardPostagePrefs.find({}, { projection: { userId: 1, preference: 1 } }).toArray(),
    ])
    const members = users.filter(u => u.id).map(u => ({
        userId: u.id,
        names: [memberName(u), u.guild?.nickname, u.guild?.displayName, u.globalName, u.username].filter((n): n is string => !!n),
    }))
    const { matched, unmatched } = matchRows(rows, members, RANKS_FLAT.map(r => r.abbr))

    const current = new Map(prefs.map(p => [p.userId, p.preference]))
    const changes = matched.filter(m => (current.get(m.userId) ?? 'unassigned') !== m.preference)

    if (body.apply === true) {
        for (const c of changes) await setPostagePreference(c.userId, c.preference, g.actor)
    }

    return NextResponse.json({
        applied: body.apply === true,
        rows: rows.length,
        matched: matched.length,
        changes: changes.map(c => ({ member: c.member, userId: c.userId, from: current.get(c.userId) ?? 'unassigned', to: c.preference })),
        unmatched,
    })
}
