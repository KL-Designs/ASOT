import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'

export async function GET(request: NextRequest) {
    const code  = request.nextUrl.searchParams.get('code')
    const error = request.nextUrl.searchParams.get('error')
    const base  = process.env.NEXT_PUBLIC_BASEURL!

    if (error || !code) {
        return NextResponse.redirect(`${base}/join?discord_error=cancelled`)
    }

    const redirectUri = `${base}/api/applications/discord-callback`

    // Exchange code for access token
    let tokenData: Record<string, string>
    try {
        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'authorization_code',
                client_id:     process.env.DISCORD_CLIENT_ID!,
                client_secret: process.env.DISCORD_CLIENT_SECRET!,
                code,
                redirect_uri:  redirectUri,
            }),
        })
        tokenData = await res.json()
        if (!tokenData.access_token) throw new Error('No access token')
    } catch {
        return NextResponse.redirect(`${base}/join?discord_error=failed`)
    }

    const auth = `${tokenData.token_type} ${tokenData.access_token}`

    // Fetch user info and guild list in parallel
    let user: Record<string, string>
    let guilds: Array<{ id: string }>
    try {
        const [userRes, guildsRes] = await Promise.all([
            fetch('https://discord.com/api/users/@me',        { headers: { authorization: auth } }),
            fetch('https://discord.com/api/users/@me/guilds', { headers: { authorization: auth } }),
        ])
        user   = await userRes.json()
        guilds = await guildsRes.json()
        if (!user.id) throw new Error('No user ID')
    } catch {
        return NextResponse.redirect(`${base}/join?discord_error=failed`)
    }

    // Check ASOT guild membership
    const guildId = process.env.DISCORD_GUILD_ID!
    const inServer = Array.isArray(guilds) && guilds.some(g => g.id === guildId)
    if (!inServer) {
        return NextResponse.redirect(`${base}/join?discord_error=not_member`)
    }

    // Block existing members from applying again (in ORBAT = confirmed member)
    const inOrbat = await Db.orbatPositions.findOne({ userId: user.id })
    if (inOrbat) {
        return NextResponse.redirect(`${base}/join?discord_error=already_member`)
    }

    // Store verified Discord identity in a short-lived httpOnly cookie
    const session = JSON.stringify({
        id:         user.id,
        username:   user.username,
        globalName: user.global_name ?? user.username,
        avatar:     user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || '0') % 5}.png`,
    })

    const response = NextResponse.redirect(`${base}/join?discord_verified=1`)
    response.cookies.set('discord_join_session', session, {
        httpOnly: true,
        maxAge:   60 * 30, // 30 minutes
        path:     '/',
        sameSite: 'lax',
    })
    return response
}
