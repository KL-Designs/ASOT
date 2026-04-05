import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function GET(request: NextRequest) {

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const month = searchParams.get('month')   // 1–12
    const year = searchParams.get('year')
    const statusFilter = searchParams.get('status') // comma-separated, e.g. "Active,Upcoming"
    const search = searchParams.get('search')

    let isHQ = false
    try {
        const me = await client.fetchMe()
        isHQ = !!(await client.hasRoles(me, PERMISSIONS.operations.viewInDevelopment))
    } catch { }

    try {
        if (id) {
            const mission = await Db.operations.findOne({ _id: new ObjectId(id) })
            if (mission?.status === 'In Development' && !isHQ) {
                return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
            }
            return NextResponse.json({ mission }, { status: 200 })
        }

        const query: Record<string, any> = { deletedAt: { $exists: false } }

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

        // Optional full-text search on title
        if (search) {
            query.title = { $regex: search, $options: 'i' }
        }

        // Optional month + year filter (or year-only)
        if (year) {
            const y = parseInt(year)
            if (month) {
                const m = parseInt(month) - 1  // JS months are 0-indexed
                const start = new Date(y, m, 1)
                const end = new Date(y, m + 1, 1)
                query.date = { $gte: start, $lt: end }
            } else {
                const start = new Date(y, 0, 1)
                const end = new Date(y + 1, 0, 1)
                query.date = { $gte: start, $lt: end }
            }
        }

        const missions = await Db.operations.find(query).sort({ date: -1 }).toArray()
        return NextResponse.json({ missions, isHQ }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 })
    }
}
