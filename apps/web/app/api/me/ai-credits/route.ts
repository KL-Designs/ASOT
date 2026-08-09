import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getMemberCreditSummary } from '@/lib/ai/budget'

export async function GET() {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.use)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const summary = await getMemberCreditSummary(me.id, me.guild?.roles ?? [])
        return NextResponse.json({ summary })
    } catch (err) {
        console.error('[api/me/ai-credits GET]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
