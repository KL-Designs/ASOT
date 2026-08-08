import { NextResponse } from 'next/server'

// Lightweight endpoint for applicant follow-along page connection latency check.
export async function GET() {
    return new NextResponse(null, { status: 204 })
}
