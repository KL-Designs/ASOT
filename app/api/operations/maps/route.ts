import { NextResponse } from 'next/server'
import { getAvailableWorlds } from '@/lib/maps'

export const dynamic = 'force-dynamic'

export async function GET() {
    return NextResponse.json(getAvailableWorlds())
}
