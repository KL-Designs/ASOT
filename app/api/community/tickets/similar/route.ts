import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'


function normalise(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function similarity(a: string, b: string): number {
    const na = normalise(a)
    const nb = normalise(b)
    if (na === nb) return 1
    const wordsA = new Set(na.split(' '))
    const wordsB = new Set(nb.split(' '))
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length
    const union = new Set([...wordsA, ...wordsB]).size
    return union === 0 ? 0 : intersection / union
}


export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const title = searchParams.get('title')?.trim()
    const category = searchParams.get('category')

    if (!title || title.length < 6) return NextResponse.json([])

    const filter: Record<string, unknown> = {
        visibility: 'public',
        isDeleted: { $ne: true },
    }
    if (category && category !== 'all') filter.category = category

    const candidates = await Db.communityTickets
        .find(filter, { projection: { _id: 1, title: 1, category: 1, subtype: 1, status: 1 } })
        .limit(200)
        .toArray()

    const scored = candidates
        .map(c => ({ ...c, score: similarity(title, c.title) }))
        .filter(c => c.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

    return NextResponse.json(scored)
}
