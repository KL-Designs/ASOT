import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

const CATEGORY_LABELS: Record<string, string> = {
    companyHQ:  'India Company HQ',
    platoon11:  'Platoon 1-1 Infantry',
    platoon12:  'Platoon 1-2 Infantry',
    support:    'Platoon 1-3 Support',
    gamemaster: 'Gamemasters',
}

// GET /api/community/callsigns
// Returns distinct ORBAT section titles for the complaint department/callsign form.
export async function GET() {
    try {
        await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const positions = await Db.orbatPositions
        .find({}, { projection: { category: 1, sectionTitle: 1 } })
        .toArray()

    // Collect distinct section titles, preserving first-seen order
    const seen = new Set<string>()
    const callsigns: { label: string; group: string }[] = []

    for (const pos of positions) {
        const title = pos.sectionTitle?.trim()
        if (!title || seen.has(title)) continue
        seen.add(title)
        callsigns.push({
            label: title,
            group: CATEGORY_LABELS[pos.category] ?? pos.category,
        })
    }

    // Ensure top-level category entries exist even if they have no named sections
    for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
        if (!callsigns.some(c => c.label === label)) {
            callsigns.push({ label, group: '' })
        }
    }

    return NextResponse.json({ callsigns })
}
