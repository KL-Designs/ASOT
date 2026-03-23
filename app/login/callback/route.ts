import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'
import { ExchangeToken, GetUser } from "@/lib/discord/oauth"



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

        const Member = await client.fetchMember(User.id)

        if (Member.token) response.cookies.set('token', Member.token, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })

        return response
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}