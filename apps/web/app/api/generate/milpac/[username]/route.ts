import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { generateMilpacForUser } from '@/lib/milpac-gen/generate-for-user'
import { MilpacServiceError } from '@/lib/milpac-gen/client'

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ username: string }> }
) {
    const { username } = await params

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Migrated off the legacy client.hasRoles(me, PERMISSIONS.pages.admin)
    // Discord-role array, per apps/web/CLAUDE.md's permission-system note.
    if (!(await hasPermission(me, 'pages.admin'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await Db.users.findOne({ username, discharged: { $exists: false } })
    if (!user) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    try {
        await generateMilpacForUser(user as unknown as User)
    } catch (err) {
        if (err instanceof MilpacServiceError) {
            console.error('[milpac] render failed for', username, err.status, err.detail)
            return NextResponse.json(
                { error: 'Render service unavailable' },
                { status: 502 },
            )
        }
        throw err
    }

    return NextResponse.json({ success: true })
}
