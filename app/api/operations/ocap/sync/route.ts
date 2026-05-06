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
                const startedAt = new Date()
                await Db.operations.updateOne(
                    { _id: new ObjectId(operationId) },
                    { $set: { ocapSync: { stage: 'downloading', message: 'Downloading recording from OCAP server…', startedAt } } },
                )
                send({ stage: 'downloading', message: 'Downloading recording from OCAP server…' })
                const recordingBuffer = await downloadOcapRecording(apiUrl, ocapFilename)

                await processAndSave(recordingBuffer, send, controller, {
                    operationId, ocapId, ocapFilename,
                    ocapMissionName, ocapWorldName, ocapDate,
                    ocapMissionDuration, ocapPlayerCount, ocapKillCount,
                    ocapPlayerKillCount, ocapSideComposition,
                })

            } catch (err: any) {
                const msg = err?.message ?? 'Unknown error'
                send({ stage: 'error', message: msg })
                await Db.operations.updateOne(
                    { _id: new ObjectId(operationId) },
                    { $set: { 'ocapSync.stage': 'error', 'ocapSync.message': msg, 'ocapSync.completedAt': new Date() } },
                ).catch(() => {})
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

    const syncStage = async (stage: string, message: string) => {
        await Db.operations.updateOne(
            { _id: new ObjectId(operationId) },
            { $set: { 'ocapSync.stage': stage, 'ocapSync.message': message } },
        ).catch(() => {})
    }

    // ── Stage 2: Parse (streaming — never converts to string) ────────────────
    let msg = 'Parsing kill events from recording…'
    send({ stage: 'parsing', message: msg })
    await syncStage('parsing', msg)

    const playerStats = await parseOcapBuffer(recordingBuffer)
    msg = `Found ${playerStats.length} players, ${playerStats.reduce((s, p) => s + p.kills, 0)} total kills`
    send({ stage: 'parsing', message: msg })
    await syncStage('parsing', msg)

    // ── Stage 3: Match members ───────────────────────────────────────────────
    msg = 'Matching player names to website members…'
    send({ stage: 'matching', message: msg })
    await syncStage('matching', msg)

    const matchedStats = await matchPlayersToMembers(playerStats)
    const matchedCount = matchedStats.filter(s => s.userId).length
    msg = `Matched ${matchedCount} of ${matchedStats.length} players to members`
    send({ stage: 'matching', message: msg })
    await syncStage('matching', msg)

    // ── Stage 4: Save ────────────────────────────────────────────────────────
    msg = 'Saving stats to database…'
    send({ stage: 'saving', message: msg })
    await syncStage('saving', msg)

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
    await Db.operations.updateOne(
        { _id: new ObjectId(operationId) },
        { $set: { 'ocapSync.stage': 'complete', 'ocapSync.message': 'OCAP data synced successfully', 'ocapSync.completedAt': new Date() } },
    ).catch(() => {})
    send({
        stage:       'complete',
        message:     'OCAP data synced successfully',
        playerCount: matchedStats.length,
        matched:     matchedCount,
        viewerUrl:   ocapData.viewerUrl,
    })

    controller.close()
}
