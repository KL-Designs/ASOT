import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { callsignOf, callsignStaff, staffedCallsigns, type CallsignPosition, type ReviewScope } from './callsign'

/**
 * The database half of `lib/gallery/callsign.ts`: reads the ORBAT and answers
 * the two questions the pure half defines. Every gallery route that reviews,
 * previews or files a submission asks here, so "who may review this" cannot
 * mean two things in two routes.
 */

async function positions(filter: Record<string, unknown>): Promise<CallsignPosition[]> {
    const docs = await Db.orbatPositions
        .find(filter, { projection: { userId: 1, sectionTitle: 1, isSenior: 1 } })
        .toArray()
    return docs.map(p => ({ userId: p.userId, sectionTitle: p.sectionTitle ?? '', isSenior: p.isSenior }))
}

/** What this member may review: everything (J5), or their own section's. */
export async function reviewScope(me: User): Promise<ReviewScope> {
    if (await hasPermission(me, 'gallery.review')) return { all: true, callsigns: [] }
    return { all: false, callsigns: staffedCallsigns(await positions({ userId: me.id }), me.id) }
}

/** The callsign this member may file a submission under, or null. */
export async function memberCallsign(userId: string): Promise<string | null> {
    return callsignOf(await positions({ userId }), userId)
}

/** The section staff to tell when something is filed under this callsign. */
export async function staffOfCallsign(callsign: string): Promise<string[]> {
    return callsignStaff(await positions({ sectionTitle: callsign }), callsign)
}
