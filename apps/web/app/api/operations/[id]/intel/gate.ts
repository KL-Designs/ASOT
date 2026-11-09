import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import { loadIntelContext, type IntelContext } from '@/lib/intel/report-db'

/**
 * Shared opening for every Intelligence Report route: a signed-in member, a
 * real operation, and the context the rules need. Returns a response to send
 * instead when any of that fails.
 */
export async function intelGate(id: string): Promise<{ me: User; ctx: IntelContext; operationId: ObjectId } | { error: NextResponse }> {
    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return { error: NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 }) }
    }
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const ctx = await loadIntelContext(operationId, me)
    if (!ctx) return { error: NextResponse.json({ error: 'Operation not found' }, { status: 404 }) }
    return { me, ctx, operationId }
}
