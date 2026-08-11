import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

// Must match exactly what POST /api/admin/diagnostics/cpu-profile generates —
// also blocks path traversal (`..`, `/`) since nothing else can match this shape.
const FILENAME_PATTERN = /^cpu-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.cpuprofile$/

/**
 * GET /api/admin/diagnostics/cpu-profile/[filename]
 *
 * Serves a previously captured .cpuprofile file for download, so it can be
 * loaded into Chrome DevTools (chrome://inspect -> "Open dedicated DevTools
 * for Node" -> Profiler -> Load) without needing SSH/SCP access to the host.
 *
 * J4-Administration only.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { filename } = await params

    if (!FILENAME_PATTERN.test(filename)) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const filePath = resolve(process.cwd(), '../../storage/diagnostics', filename)
    if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const contents = readFileSync(filePath)
    return new NextResponse(contents, {
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    })
}
