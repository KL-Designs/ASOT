import { NextResponse } from 'next/server'

/**
 * GET /api/admin/discord-bot-test
 * Temporary diagnostic endpoint — verifies the bot token and DM capability.
 * Delete once confirmed working.
 */
export async function GET() {
    const token = process.env.DISCORD_BOT_TOKEN

    if (!token) return NextResponse.json({ error: 'DISCORD_BOT_TOKEN is not set' }, { status: 500 })

    const BASE = 'https://discord.com/api'

    // Step 1: verify bot identity
    const meRes = await fetch(`${BASE}/users/@me`, {
        headers: { 'authorization': `Bot ${token}` },
        cache: 'no-store',
    })
    const meData = await meRes.json()

    if (!meRes.ok) {
        return NextResponse.json({
            step: 'GET /users/@me',
            status: meRes.status,
            body: meData,
            tokenPrefix: token.slice(0, 20) + '…',
        }, { status: 500 })
    }

    // Step 2: try opening a DM channel with the bot itself (harmless, just tests auth)
    const dmRes = await fetch(`${BASE}/users/@me/channels`, {
        method: 'POST',
        headers: { 'authorization': `Bot ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ recipient_id: meData.id }),
        cache: 'no-store',
    })
    const dmData = await dmRes.json()

    return NextResponse.json({
        botIdentity: { id: meData.id, username: meData.username },
        dmChannelTest: { status: dmRes.status, body: dmData },
    })
}
