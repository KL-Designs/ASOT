import { NextRequest, NextResponse } from "next/server"

import client from '@/lib/discord'



export async function GET(request: NextRequest) {

    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASEURL!}/optionals`)

    const token = request.nextUrl.searchParams.get('token')
    if (!token) NextResponse.json({ error: 'No token provided' }, { status: 400 })

    try {
        const Member = await client.fetchMember(token as string)

        if (Member.token) response.cookies.set('token', Member.token, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })

        return response
    }

    catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Internal server error', context: error.message }, { status: 500 })
    }

}