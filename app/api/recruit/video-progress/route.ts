import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'

export async function POST(req: NextRequest) {
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const { sessionKey, videoUrl, event, maxReachedPct, totalWatchSeconds, continueClickedAtPct, exitType } = body as Record<string, unknown>

    if (typeof sessionKey !== 'string' || sessionKey.length < 4 || sessionKey.length > 128) {
        return NextResponse.json({ error: 'invalid key' }, { status: 400 })
    }

    const now = new Date()
    const maxPct  = typeof maxReachedPct === 'number'    ? Math.min(100, Math.max(0, maxReachedPct))    : 0
    const watchSec = typeof totalWatchSeconds === 'number' ? Math.min(86400, Math.max(0, totalWatchSeconds)) : 0

    const existing = await Db.recruitVideoProgress.findOne({ sessionKey }).catch(() => null)

    if (!existing) {
        await Db.recruitVideoProgress.insertOne({
            sessionKey,
            videoUrl: typeof videoUrl === 'string' ? videoUrl.slice(0, 2000) : '',
            startedAt: now,
            updatedAt: now,
            maxReachedPct: maxPct,
            totalWatchSeconds: watchSec,
            completed: false,
            exitEvents: [],
            userAgent: req.headers.get('user-agent')?.slice(0, 512) ?? undefined,
        })
        return NextResponse.json({ ok: true })
    }

    const setFields: Record<string, unknown> = {
        updatedAt: now,
        maxReachedPct: Math.max(existing.maxReachedPct, maxPct),
        totalWatchSeconds: Math.max(existing.totalWatchSeconds, watchSec),
    }

    if (event === 'complete' && !existing.completed) {
        setFields.completed = true
        setFields.completedAt = now
    }
    if (event === 'continue_click' && !existing.continueClickedAt) {
        setFields.continueClickedAt = now
        setFields.continueClickedAtPct = typeof continueClickedAtPct === 'number' ? continueClickedAtPct : maxPct
    }

    if (event === 'exit') {
        await Db.recruitVideoProgress.updateOne(
            { sessionKey },
            {
                $set: setFields,
                $push: { exitEvents: { at: now, atPct: maxPct, type: typeof exitType === 'string' ? exitType : 'visibilitychange' } } as never,
            }
        )
    } else {
        await Db.recruitVideoProgress.updateOne({ sessionKey }, { $set: setFields })
    }

    return NextResponse.json({ ok: true })
}
