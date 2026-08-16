import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getConnection } from '@/lib/teamspeak/cache'
import { checkResticHealth } from '@/lib/backups'
import { isMilpacServiceConfigured } from '@/lib/milpac-gen/client'

const CHECK_TIMEOUT_MS = 5_000

function withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS)),
    ])
}

async function checkDatabase(): Promise<boolean> {
    try {
        await withTimeout(Db.users.findOne({}, { projection: { _id: 1 } }))
        return true
    } catch {
        return false
    }
}

async function checkDiscord(): Promise<boolean> {
    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) return false
    try {
        const res = await withTimeout(fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bot ${token}` },
            cache: 'no-store',
        }))
        return res.ok
    } catch {
        return false
    }
}

async function checkTeamspeak(): Promise<boolean> {
    try {
        await withTimeout(getConnection())
        return true
    } catch {
        return false
    }
}

async function checkBackups(): Promise<boolean> {
    try {
        return await withTimeout(checkResticHealth())
    } catch {
        return false
    }
}

/**
 * Hits the render service's only unauthenticated route. It publishes no port,
 * so this is reachable from web's container and nowhere else — which is also
 * why the dashboard is the only place its state is visible.
 */
async function checkMilpac(): Promise<boolean> {
    if (!isMilpacServiceConfigured()) return false
    try {
        const res = await withTimeout(fetch(`${process.env.MILPAC_SERVICE_URL}/health`, { cache: 'no-store' }))
        return res.ok
    } catch {
        return false
    }
}

async function isDevModeEnabled(settingId: string): Promise<boolean> {
    const setting = await Db.siteSettings.findOne({ _id: settingId }).catch(() => null)
    return !!(setting as Record<string, unknown> | null)?.enabled
}

// GET /api/dashboard/status — connectivity + dev-mode state for the dashboard
// header status icons. Any authenticated staff member can read this (matches
// dashboard visibility) — no admin-specific gate.
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [database, backups, discord, teamspeak, milpac, discordDevMode, teamspeakDevMode] = await Promise.all([
        checkDatabase(),
        checkBackups(),
        checkDiscord(),
        checkTeamspeak(),
        checkMilpac(),
        isDevModeEnabled('discordDevMode'),
        isDevModeEnabled('teamspeakDevMode'),
    ])

    return NextResponse.json({
        website: { online: true },
        database: { online: database },
        backups: { online: backups },
        discord: { online: discord, devMode: discordDevMode },
        teamspeak: { online: teamspeak, devMode: teamspeakDevMode },
        milpac: { online: milpac },
    })
}
