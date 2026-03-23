import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const month = searchParams.get('month')   // 1–12
    const year = searchParams.get('year')
    const statusFilter = searchParams.get('status') // comma-separated, e.g. "Active,Upcoming"

    let isHQ = false
    try {
        const me = await client.fetchMe()
        isHQ = !!(await client.hasRoles(me, ['HQ Staff']))
    } catch { }

    try {
        if (id) {
            const mission = await Db.operations.findOne({ _id: new ObjectId(id) })
            if (mission?.status === 'In Development' && !isHQ) {
                return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
            }
            return NextResponse.json({ mission }, { status: 200 })
        }

        const query: Record<string, any> = {}

        // Always hide "In Development" from non-HQ users
        if (!isHQ) {
            query.status = { $ne: 'In Development' }
        }

        // Optional status filter (comma-separated)
        if (statusFilter) {
            const statuses = statusFilter.split(',').map(s => s.trim())
            const allowed = isHQ ? statuses : statuses.filter(s => s !== 'In Development')
            if (allowed.length > 0) {
                query.status = { $in: allowed }
            }
        }

        // Optional month + year filter
        if (month && year) {
            const m = parseInt(month) - 1  // JS months are 0-indexed
            const y = parseInt(year)
            const start = new Date(y, m, 1)
            const end = new Date(y, m + 1, 1)
            query.date = { $gte: start, $lt: end }
        }

        const missions = await Db.operations.find(query).sort({ date: -1 }).toArray()
        return NextResponse.json({ missions, isHQ }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
