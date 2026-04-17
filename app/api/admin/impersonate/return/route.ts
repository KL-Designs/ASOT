import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
    const cookieStore = await cookies()
    const originalToken = cookieStore.get('original_token')?.value

    if (!originalToken) {
        return NextResponse.json({ error: 'Not impersonating' }, { status: 400 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set('token', originalToken, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
    response.cookies.delete('original_token')
    response.cookies.delete('is_impersonating')
    return response
}
