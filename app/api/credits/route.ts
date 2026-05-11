import { NextResponse } from 'next/server'
import { getCreditsData } from '@/lib/credits'

export async function GET() {
    return NextResponse.json(await getCreditsData())
}
