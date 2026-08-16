import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import { generateMilpacForUser } from '@/lib/milpac-gen/generate-for-user'
import { MilpacServiceError } from '@/lib/milpac-gen/client'

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ username: string }> }
) {
    const { username } = await params

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Still the legacy Discord-role gate, deliberately.
    //
    // apps/milpac/PLAN.md Phase 3 called for migrating this to
    // hasPermission(me, 'pages.admin'), but `pages.admin` has not actually been
    // migrated — its JSDoc carries no migration note and every other route that
    // gates on it still uses hasRoles. hasPermission deliberately does not fall
    // back to Discord role names and does not carry hasRoles' hardcoded
    // J4-Administration bypass, so switching this one route would have locked it
    // to the OVERRIDE list alone.
    //
    // When `pages.admin` migrates, it should migrate everywhere at once.
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
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
