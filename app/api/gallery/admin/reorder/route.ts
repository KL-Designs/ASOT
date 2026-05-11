import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

const CONTENT_BASE = path.resolve('./gallery/content')

function resolveSafe(year: string, operation: string, stage: string): string {
    for (const part of [year, operation, stage]) {
        if (!part || part.includes('/') || part.includes('\\') || part.includes('\x00') || part === '..' || part === '.') {
            throw new Error('Invalid path component')
        }
    }
    const resolved = path.resolve(CONTENT_BASE, year, operation, stage)
    if (!resolved.startsWith(CONTENT_BASE + path.sep)) throw new Error('Path escapes content directory')
    return resolved
}

/** POST — rename files in a stage directory to enforce a given display order */
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.gallery.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { year, operation, stage, order } = body as {
        year: string; operation: string; stage: string; order: string[]
    }

    if (!year || !operation || !stage || !Array.isArray(order) || !order.length)
        return NextResponse.json({ error: 'year, operation, stage and order are required' }, { status: 400 })

    let targetDir: string
    try { targetDir = resolveSafe(year, operation, stage) }
    catch { return NextResponse.json({ error: 'Invalid path' }, { status: 400 }) }

    const existing = new Set(fs.readdirSync(targetDir))

    // Sanitize and filter to only files that exist in the directory
    const validOrder = order
        .map(name => path.basename(name))
        .filter(name => existing.has(name))

    if (!validOrder.length) return NextResponse.json({ success: true, renamed: 0 })

    const ts = Date.now()
    const steps = validOrder.map((original, i) => ({
        from: original,
        tmp: `__reorder_${ts}_${i}`,
        // Strip any existing numeric prefix (e.g. "0003_") before adding the new one
        to: `${String(i + 1).padStart(4, '0')}_${original.replace(/^\d+_/, '')}`,
    }))

    // Two-pass rename prevents collisions when new names overlap old names
    for (const { from, tmp } of steps) {
        fs.renameSync(path.join(targetDir, from), path.join(targetDir, tmp))
    }
    for (const { tmp, to } of steps) {
        fs.renameSync(path.join(targetDir, tmp), path.join(targetDir, to))
    }

    return NextResponse.json({ success: true, renamed: steps.length })
}
