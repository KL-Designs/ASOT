import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const raw = request.cookies.get('discord_join_session')?.value
    if (!raw) return NextResponse.json({ verified: false })
    try {
        const session = JSON.parse(raw)
        return NextResponse.json({ verified: true, ...session })
    } catch {
        return NextResponse.json({ verified: false })
    }
}

export async function DELETE() {
    const response = NextResponse.json({ ok: true })
    response.cookies.delete('discord_join_session')
    return response
}
