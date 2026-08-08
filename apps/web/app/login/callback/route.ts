import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { ExchangeToken, GetUser } from "@/lib/discord/oauth"

function cdnAssetURL(base: 'avatars' | 'banners', id: string, hash: string | null | undefined): string | null {
    if (!hash) return null
    return `https://cdn.discordapp.com/${base}/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}`
}



export async function GET(request: NextRequest) {

    // Read the returnTo cookie set before the Discord redirect
    const returnTo = request.cookies.get('login_return_to')?.value || '/me'

    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASEURL!}${returnTo}`)
    response.cookies.delete('login_return_to')

    const code = request.nextUrl.searchParams.get('code')
    if (!code) NextResponse.json({ error: 'No code provided' }, { status: 400 })

    try {
        const TokenExchange = await ExchangeToken(code as string)
        if (!TokenExchange) return NextResponse.json({ error: 'Token exchange failed' }, { status: 400 })

        const User = await GetUser(TokenExchange)
        if (!User) return NextResponse.json({ error: 'User retrieval failed' }, { status: 400 })

        // Refresh the stored profile with the latest Discord data on every login.
        // fetchMember() below only reads the existing DB record — without this, avatar/name/
        // banner stay frozen at whatever they were when the account was first created (CSV
        // import / init-db) and never pick up changes made on Discord afterward.
        await Db.users.updateOne({ _id: User.id }, {
            $set: {
                username:       User.username,
                globalName:     User.global_name ?? User.username,
                tag:            User.discriminator && User.discriminator !== '0'
                                    ? `${User.username}#${User.discriminator}`
                                    : User.username,
                avatar:         User.avatar ?? null,
                avatarURL:      cdnAssetURL('avatars', User.id, User.avatar)
                                    ?? `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(User.id) >> BigInt(22)) % 6}.png`,
                banner:         User.banner ?? null,
                bannerURL:      cdnAssetURL('banners', User.id, User.banner),
                hexAccentColor: User.accent_color ? `#${User.accent_color.toString(16).padStart(6, '0')}` : '#000000',
                accentColor:    User.accent_color ?? 0,
            },
        }).catch(e => console.error('[login/callback] Profile refresh failed:', e.message))

        const Member = await client.fetchMember(User.id)

        if (Member.token) response.cookies.set('token', Member.token, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })

        return response
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}