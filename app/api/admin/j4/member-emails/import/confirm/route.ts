import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// POST /api/admin/j4/member-emails/import/confirm
// Body: { entries: { memberId: string; email: string }[] }
// Deduplicates and inserts accepted email matches from the dry-run review.
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entries } = await req.json() as { entries: { memberId: string; email: string }[] }
    if (!Array.isArray(entries) || entries.length === 0) {
        return NextResponse.json({ ok: true, inserted: 0, duplicates: 0 })
    }

    const addedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const now = new Date()

    const memberIds = [...new Set(entries.map(e => e.memberId))]
    const existing = await Db.memberEmails.find({ memberId: { $in: memberIds } }).toArray()
    const existingByMember = new Map(existing.map(d => [d.memberId, d]))

    let inserted = 0
    let duplicates = 0

    for (const { memberId, email } of entries) {
        if (!memberId || !email?.includes('@')) continue

        const doc = existingByMember.get(memberId)
        if (doc) {
            const alreadyExists = doc.emails.some(e => e.email.toLowerCase() === email.toLowerCase())
            if (alreadyExists) { duplicates++; continue }
            await Db.memberEmails.updateOne(
                { memberId },
                { $push: { emails: { email, addedAt: now, addedByName } as any } }
            )
            doc.emails.push({ email, addedAt: now, addedByName } as any)
        } else {
            const newDoc = {
                _id: new ObjectId() as MemberEmail['_id'],
                memberId,
                emails: [{ email, addedAt: now, addedByName }],
            }
            await Db.memberEmails.insertOne(newDoc as any)
            existingByMember.set(memberId, newDoc as any)
        }
        inserted++
    }

    return NextResponse.json({ ok: true, inserted, duplicates })
}
