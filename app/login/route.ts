import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const returnTo = request.nextUrl.searchParams.get('returnTo') || ''
    // Only allow relative paths to prevent open redirect
    const safeReturnTo = returnTo.startsWith('/') ? returnTo : ''

    const clientId = process.env.DISCORD_CLIENT_ID!
    const redirectUri = encodeURIComponent(process.env.NEXT_PUBLIC_BASEURL! + process.env.DISCORD_REDIRECT_URI!)
    const scope = process.env.DISCORD_SCOPE!.split(' ').join('+')

    const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`

    const response = NextResponse.redirect(url)

    // Store returnTo in a short-lived cookie so the callback can redirect there
    if (safeReturnTo) {
        response.cookies.set('login_return_to', safeReturnTo, { httpOnly: true, maxAge: 600, path: '/' })
    }

    return response
}
