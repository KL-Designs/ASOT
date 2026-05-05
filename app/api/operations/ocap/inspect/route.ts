import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { downloadOcapRecording } from '@/lib/ocap'
import { Readable } from 'node:stream'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import pick from 'stream-json/filters/pick.js'
import streamArray from 'stream-json/streamers/stream-array.js'

export const maxDuration = 120

async function* bufferChunks(buf: Buffer, size = 65536): AsyncGenerator<Buffer> {
    for (let i = 0; i < buf.length; i += size) {
        yield buf.subarray(i, Math.min(i + size, buf.length))
    }
}

// GET /api/operations/ocap/inspect?filename=<ocapFilename>
// Returns unique event types found in the recording and a sample entity frame.
export async function GET(req: NextRequest) {
    try {
        const me = await client.fetchMe()
        const isHQ = await client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
        if (!isHQ) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const filename = req.nextUrl.searchParams.get('filename')
    if (!filename) return NextResponse.json({ error: 'Missing filename param' }, { status: 400 })

    const apiUrl = process.env.OCAP_API_URL
    if (!apiUrl) return NextResponse.json({ error: 'OCAP_API_URL not configured' }, { status: 500 })

    const buf = await downloadOcapRecording(apiUrl, filename)

    // ── Collect unique event types ────────────────────────────────────────────
    const eventTypes = new Map<string, number>() // type → count
    const eventSamples: Record<string, any> = {}  // one sample per type

    const evStream = chain([
        Readable.from(bufferChunks(buf)),
        parser(),
        pick({ filter: 'events' }),
        streamArray(),
    ])

    for await (const { value } of evStream as AsyncIterable<{ value: any }>) {
        const evType: string = Array.isArray(value) ? String(value[1]) : String(value.type ?? value[0] ?? 'unknown')
        eventTypes.set(evType, (eventTypes.get(evType) ?? 0) + 1)
        if (!eventSamples[evType]) eventSamples[evType] = value
    }

    // ── Sample entity fields ──────────────────────────────────────────────────
    let entityFrameSample: any = null
    let entityTopLevelSample: any = null
    let framesFiredSample: any = null  // raw value from first player with non-empty framesFired

    const entStream = chain([
        Readable.from(bufferChunks(buf)),
        parser(),
        pick({ filter: 'entities' }),
        streamArray(),
    ])

    for await (const { value } of entStream as AsyncIterable<{ value: any }>) {
        const isPlayer = value.isPlayer === 1 || value.isPlayer === true
        if (!entityTopLevelSample && isPlayer) entityTopLevelSample = value

        if (isPlayer && !entityFrameSample && Array.isArray(value.positions) && value.positions.length > 0) {
            entityFrameSample = {
                topLevelKeys: Object.keys(value),
                sampleFrameKeys: Array.isArray(value.positions[0])
                    ? `array of length ${value.positions[0].length}`
                    : Object.keys(value.positions[0]),
                sampleFrame: value.positions[0],
            }
        }

        // Grab a real framesFired value — prefer one that's non-empty
        if (isPlayer && framesFiredSample === null && value.framesFired !== undefined) {
            framesFiredSample = {
                type:   typeof value.framesFired,
                isArray: Array.isArray(value.framesFired),
                length: Array.isArray(value.framesFired) ? value.framesFired.length : null,
                sample: Array.isArray(value.framesFired) ? value.framesFired.slice(0, 5) : value.framesFired,
                playerName: value.name,
            }
        }
        // Prefer a player who actually fired something
        if (isPlayer && Array.isArray(value.framesFired) && value.framesFired.length > 0 && framesFiredSample?.length === 0) {
            framesFiredSample = {
                type:   typeof value.framesFired,
                isArray: true,
                length: value.framesFired.length,
                sample: value.framesFired.slice(0, 5),
                playerName: value.name,
            }
        }

        if (entityFrameSample && framesFiredSample?.length > 0) break
    }

    return NextResponse.json({
        filename,
        eventTypes: Object.fromEntries(
            [...eventTypes.entries()].sort((a, b) => b[1] - a[1])
        ),
        eventSamples,
        entityFrameSample,
        framesFiredSample,
        entityTopLevelKeys: entityTopLevelSample ? Object.keys(entityTopLevelSample) : null,
    })
}
