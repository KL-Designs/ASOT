import { NextResponse } from 'next/server'
import { getAvailableWorlds } from '@/lib/maps'

export async function GET() {
    return NextResponse.json(getAvailableWorlds())
}
