/**
 * POST /api/operations/import/match
 *
 * Body: { query: string }
 * Returns campaign/mission match candidates for a given search string.
 */

import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'
import { matchCampaignMission } from '@/lib/operations/import/campaign-matcher'

export async function POST(request: NextRequest) {
    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const permitted =
        await hasPermission(me as unknown as User, 'operations.write') ||
        client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
    if (!permitted) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    let body: { query?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { query } = body
    if (!query?.trim()) return NextResponse.json({ error: 'query is required' }, { status: 400 })

    try {
        const [campaigns, missions] = await Promise.all([
            Db.operationCampaigns.find({ isDeleted: { $ne: true } }).toArray(),
            Db.campaignMissions.find({ isDeleted: { $ne: true } }).toArray(),
        ])

        const matches = await matchCampaignMission(
            query,
            campaigns as unknown as OperationCampaign[],
            missions as unknown as CampaignMission[]
        )

        return NextResponse.json({ matches })
    } catch (err) {
        console.error('[import/match] Error:', err)
        return NextResponse.json({ error: 'Match failed' }, { status: 500 })
    }
}
