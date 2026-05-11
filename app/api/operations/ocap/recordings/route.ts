import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { decodeMissionName, formatDuration } from '@/lib/ocap'

export interface OcapRecording {
    id: number
    filename: string
    missionName: string
    worldName: string
    date: string
    missionDuration: number
    durationLabel: string
    playerCount: number
    killCount: number
    playerKillCount: number
    sideComposition: Record<string, { players: number; units: number; dead: number; kills: number }>
}

export async function GET() {
    try {
        const me = await client.fetchMe()
        const isHQ = await client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
        if (!isHQ) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiUrl = process.env.OCAP_API_URL
    if (!apiUrl) return NextResponse.json({ error: 'OCAP_API_URL not configured' }, { status: 500 })

    try {
        const res = await fetch(`${apiUrl}/api/v1/operations`, {
            next: { revalidate: 0 },
        })
        if (!res.ok) throw new Error(`OCAP API returned ${res.status}`)

        const raw: any[] = await res.json()

        const recordings: OcapRecording[] = raw
            .filter(r => r.conversionStatus === 'completed')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(r => ({
                id:              r.id,
                filename:        r.filename,
                missionName:     decodeMissionName(r.mission_name),
                worldName:       r.world_name,
                date:            r.date,
                missionDuration: r.mission_duration,
                durationLabel:   formatDuration(r.mission_duration),
                playerCount:     r.player_count,
                killCount:       r.kill_count,
                playerKillCount: r.player_kill_count,
                sideComposition: r.side_composition ?? {},
            }))

        return NextResponse.json(recordings)
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 502 })
    }
}
