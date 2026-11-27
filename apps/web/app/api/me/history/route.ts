import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

export interface HistoryEvent {
    type: 'promotion' | 'award' | 'qualification' | 'loa' | 'enlistment'
    date: string
    title: string
    detail?: string
    issuedByName?: string
}

/** GET /api/me/history — aggregated chronological history for the signed-in member. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const events: HistoryEvent[] = []

    const milpac = me.milpac ?? {}

    // Enlistment
    if (milpac.enlistedDate) {
        events.push({ type: 'enlistment', date: milpac.enlistedDate, title: 'Enlisted in ASOT' })
    }

    // Promotions
    for (const p of milpac.promotions ?? []) {
        events.push({
            type: 'promotion',
            date: p.date,
            title: p.rank,
            issuedByName: p.issuedByName,
        })
    }

    // Awards
    for (const a of milpac.awards ?? []) {
        events.push({
            type: 'award',
            date: a.date,
            title: a.name,
            detail: a.type,
            issuedByName: a.issuedByName,
        })
    }

    // Qualifications
    for (const q of milpac.qualifications ?? []) {
        events.push({
            type: 'qualification',
            date: q.date,
            title: q.qualification,
            issuedByName: q.issuedByName,
        })
    }

    // LOAs
    const loas = await Db.memberLoas
        .find({ userId: me.id, status: 'approved' })
        .toArray()

    for (const l of loas) {
        events.push({
            type: 'loa',
            date: l.startDate,
            title: `Leave of Absence`,
            detail: `${l.startDate} – ${l.endDate}`,
        })
    }

    // Sort descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ events })
}
