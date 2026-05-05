import { NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { downloadOcapRecording, parseOcapBuffer, matchPlayersToMembers, buildViewerUrl } from '@/lib/ocap'

// Allow up to 5 minutes — large JSON files can take time to download + parse
export const maxDuration = 300

interface SyncPayload {
    operationId: string
    ocapId: number
    ocapFilename: string
    ocapMissionName: string
    ocapWorldName: string
    ocapDate: string
    ocapMissionDuration: number
    ocapPlayerCount: number
    ocapKillCount: number
    ocapPlayerKillCount: number
    ocapSideComposition: Record<string, { players: number; units: number; dead: number; kills: number }>
}

export async function POST(request: NextRequest) {
    // ── Auth ────────────────────────────────────────────────────────────────
    try {
        const me = await client.fetchMe()
        const isHQ = await client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
        if (!isHQ) return new Response('Forbidden', { status: 403 })
    } catch {
        return new Response('Unauthorized', { status: 401 })
    }

    const body: SyncPayload = await request.json()
    const {
        operationId, ocapId, ocapFilename,
        ocapMissionName, ocapWorldName, ocapDate,
        ocapMissionDuration, ocapPlayerCount, ocapKillCount,
        ocapPlayerKillCount, ocapSideComposition,
    } = body

    if (!operationId || !ocapId || !ocapFilename) {
        return new Response('Missing required fields', { status: 400 })
    }

    const apiUrl = process.env.OCAP_API_URL
    if (!apiUrl) return new Response('OCAP_API_URL not configured', { status: 500 })

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: object) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
                } catch { /* stream closed */ }
            }

            try {
                // ── Stage 1: Download + decompress ────────────────────────────
                send({ stage: 'downloading', message: 'Downloading recording from OCAP server…' })
                const recordingBuffer = await downloadOcapRecording(apiUrl, ocapFilename)

                await processAndSave(recordingBuffer, send, controller, {
                    operationId, ocapId, ocapFilename,
                    ocapMissionName, ocapWorldName, ocapDate,
                    ocapMissionDuration, ocapPlayerCount, ocapKillCount,
                    ocapPlayerKillCount, ocapSideComposition,
                })

            } catch (err: any) {
                send({ stage: 'error', message: err?.message ?? 'Unknown error' })
                controller.close()
            }
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection':    'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    })
}

async function processAndSave(
    recordingBuffer: Buffer,
    send: (data: object) => void,
    controller: ReadableStreamDefaultController,
    payload: SyncPayload,
) {
    const {
        operationId, ocapId, ocapFilename,
        ocapMissionName, ocapWorldName, ocapDate,
        ocapMissionDuration, ocapPlayerCount, ocapKillCount,
        ocapPlayerKillCount, ocapSideComposition,
    } = payload

    // ── Stage 2: Parse (streaming — never converts to string) ────────────────
    send({ stage: 'parsing', message: 'Parsing kill events from recording…' })

    const playerStats = await parseOcapBuffer(recordingBuffer)
    send({
        stage:   'parsing',
        message: `Found ${playerStats.length} players, ${playerStats.reduce((s, p) => s + p.kills, 0)} total kills`,
    })

    // ── Stage 3: Match members ───────────────────────────────────────────────
    send({ stage: 'matching', message: 'Matching player names to website members…' })
    const matchedStats = await matchPlayersToMembers(playerStats)
    const matchedCount = matchedStats.filter(s => s.userId).length
    send({ stage: 'matching', message: `Matched ${matchedCount} of ${matchedStats.length} players to members` })

    // ── Stage 4: Save ────────────────────────────────────────────────────────
    send({ stage: 'saving', message: 'Saving stats to database…' })

    const ocapData: OcapData = {
        recordingId:     ocapId,
        filename:        ocapFilename,
        viewerUrl:       buildViewerUrl(ocapId, ocapFilename),
        worldName:       ocapWorldName,
        missionName:     ocapMissionName,
        missionDuration: ocapMissionDuration,
        date:            ocapDate,
        playerCount:     ocapPlayerCount,
        killCount:       ocapKillCount,
        playerKillCount: ocapPlayerKillCount,
        sideComposition: ocapSideComposition,
        playerStats:     matchedStats,
        syncedAt:        new Date(),
    }

    await Db.operations.updateOne(
        { _id: new ObjectId(operationId) },
        { $set: { ocap: ocapData } },
    )

    // ── Done ─────────────────────────────────────────────────────────────────
    send({
        stage:       'complete',
        message:     'OCAP data synced successfully',
        playerCount: matchedStats.length,
        matched:     matchedCount,
        viewerUrl:   ocapData.viewerUrl,
    })

    controller.close()
}
