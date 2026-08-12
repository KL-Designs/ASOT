/**
 * DEV-ONLY endpoint — grants all department + lead roles to the currently
 * authenticated user for testing purposes.
 *
 * DELETE THIS FILE before deploying to production.
 */
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { addGuildRole, botRequest } from '@/lib/discord/bot'

const TARGET_ROLE_NAMES = [
    // Member roles
    // NOTE: 'ASOT Member' alone no longer grants dashboard access. Dashboard
    // access (`hasDashboardAccess()`, `lib/orbat/hasDashboardAccess.ts`) is
    // implicit for anyone with any department/ORBAT-position/reservist role
    // holding — a developer using this endpoint for local test access also
    // needs to be in a department or hold a position/reservist role.
    'ASOT Member',
    'All Staff',
    'HQ Staff',
    // Department member roles
    'J1 - Recruitment',
    'J2 - Mission Making',
    'J3 - Training',
    'J4 - Administration',
    'J5 - Media',
    'J6 - Game Master',
    'J7 - Community Development',
    // Department lead roles
    'J1 - Department Leader',
    'J1 - Head Recruiter',
    'J2 - Department Leader',
    'J2 - Team Leader',
    'J3 - Department Leader',
    'J3 - Head Trainer',
    'J5 - Department Leader',
    'J5 - Team Leader',
    'J6 - Department Lead',
    'J6 - Team Leader',
    'J7 - Department Leader',
    'J7 - Team Leader',
]

export async function POST() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all roles directly from Discord (not the DB cache)
    const guildId = process.env.DISCORD_GUILD_ID
    const guildRoles = await botRequest<{ id: string; name: string }[]>('GET', `/guilds/${guildId}/roles`)

    const matched = guildRoles.filter(r => TARGET_ROLE_NAMES.includes(r.name))
    const notFound = TARGET_ROLE_NAMES.filter(n => !guildRoles.some(r => r.name === n))

    const results: { role: string; ok: boolean; error?: string }[] = []

    for (const role of matched) {
        try {
            await addGuildRole(me.id, role.id)
            results.push({ role: role.name, ok: true })
        } catch (err: any) {
            results.push({ role: role.name, ok: false, error: err?.message })
        }
        // Avoid Discord rate limit on role assignment endpoint
        await new Promise(r => setTimeout(r, 1000))
    }

    return NextResponse.json({
        userId: me.id,
        granted: results.filter(r => r.ok).map(r => r.role),
        failed: results.filter(r => !r.ok),
        notFoundInDiscord: notFound,
    })
}
