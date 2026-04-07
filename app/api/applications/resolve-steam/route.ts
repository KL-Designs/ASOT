import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/applications/resolve-steam?url=...
 *
 * Accepts:
 *   - A raw SteamID64 (17-digit number starting with 765)
 *   - https://steamcommunity.com/profiles/76561198XXXXXXX  → extract directly
 *   - https://steamcommunity.com/id/VANITYNAME             → resolve via Steam XML API (no key needed)
 */
export async function GET(request: NextRequest) {
    const input = request.nextUrl.searchParams.get('url')?.trim()
    if (!input) return NextResponse.json({ error: 'URL required' }, { status: 400 })

    // Raw SteamID64
    if (/^765\d{14}$/.test(input)) {
        return NextResponse.json({ steamId64: input })
    }

    // /profiles/STEAMID64
    const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17,})/)
    if (profileMatch) {
        return NextResponse.json({ steamId64: profileMatch[1] })
    }

    // /id/VANITYNAME → Steam community XML endpoint (no API key required)
    const vanityMatch = input.match(/steamcommunity\.com\/id\/([a-zA-Z0-9_-]+)/)
    if (vanityMatch) {
        try {
            const res = await fetch(`https://steamcommunity.com/id/${vanityMatch[1]}/?xml=1`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                cache: 'no-store',
            })
            const xml = await res.text()
            const m = xml.match(/<steamID64>(\d+)<\/steamID64>/)
            if (m) return NextResponse.json({ steamId64: m[1] })
            return NextResponse.json({ error: 'Profile not found or set to private.' }, { status: 404 })
        } catch {
            return NextResponse.json({ error: 'Could not reach Steam. Please try again.' }, { status: 502 })
        }
    }

    return NextResponse.json({ error: 'Unrecognised format. Paste your full Steam profile URL or SteamID64.' }, { status: 400 })
}
