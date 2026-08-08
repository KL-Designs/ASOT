import { NextResponse } from 'next/server'

export async function GET() {
    const clientId   = process.env.DISCORD_CLIENT_ID!
    const baseUrl    = process.env.NEXT_PUBLIC_BASEURL!
    const redirectUri = encodeURIComponent(`${baseUrl}/api/applications/discord-callback`)
    const scope      = 'identify%20guilds'

    const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`

    return NextResponse.redirect(url)
}
