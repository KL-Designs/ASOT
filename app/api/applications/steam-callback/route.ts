import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams
    const claimedId = params.get('openid.claimed_id') ?? ''
    const mode = params.get('openid.mode')

    if (mode !== 'id_res' || !claimedId) {
        return NextResponse.redirect(new URL('/join?steam_error=cancelled', request.url))
    }

    // Extract SteamID64 from the claimed_id URL
    const match = claimedId.match(/\/openid\/id\/(\d{17,})/)
    if (!match) {
        return NextResponse.redirect(new URL('/join?steam_error=invalid', request.url))
    }

    // Verify the assertion with Steam
    const verifyParams = new URLSearchParams()
    params.forEach((value, key) => verifyParams.set(key, value))
    verifyParams.set('openid.mode', 'check_authentication')

    try {
        const verify = await fetch('https://steamcommunity.com/openid/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: verifyParams.toString(),
        })
        const text = await verify.text()
        if (!text.includes('is_valid:true')) {
            return NextResponse.redirect(new URL('/join?steam_error=invalid', request.url))
        }
    } catch {
        return NextResponse.redirect(new URL('/join?steam_error=failed', request.url))
    }

    const steamId64 = match[1]
    return NextResponse.redirect(new URL(`/join?steamId64=${steamId64}`, request.url))
}
