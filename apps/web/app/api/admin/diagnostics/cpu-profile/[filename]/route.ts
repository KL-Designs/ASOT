import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { cpuProfilePath } from '@/lib/diagnostics/cpu-profiles'

/**
 * GET /api/admin/diagnostics/cpu-profile/[filename]
 *
 * Serves a previously captured .cpuprofile file for download, so it can be
 * loaded into Chrome DevTools (chrome://inspect -> "Open dedicated DevTools
 * for Node" -> Profiler -> Load) without needing SSH/SCP access to the host.
 *
 * cpuProfilePath() returns null for anything that is not a name the capture
 * route generated, which is also what blocks path traversal — see
 * lib/diagnostics/cpu-profiles.ts.
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

    const filePath = cpuProfilePath(filename)
    if (!filePath) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }
    if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const contents = await readFile(filePath)
    return new NextResponse(contents, {
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    })
}
