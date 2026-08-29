import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'

// POST /api/operations/[id]/attendance/manage
// HQ-only: add, move, or remove individual attendance records.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await can(me, 'attendance.manage'))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const body: {
        // Move a member to a different section (set reservistSection; null = own section)
        moves: { userId: string; targetSection: string | null }[]
        // Remove records entirely
        removals: string[]
        // Add new records for users not yet in this operation
        additions: { userId: string; sectionTitle: string; orbatRole: string }[]
        // Update orbatRole for existing records
        roleChanges: { userId: string; orbatRole: string }[]
    } = await req.json()

    const attendance = await Db.operationAttendance.findOne({ operationId })
    if (!attendance) return NextResponse.json({ error: 'Attendance doc not found' }, { status: 404 })

    let records: OperationAttendanceRecord[] = attendance.records ?? []

    // Apply removals
    const removedSet = new Set(body.removals ?? [])
    records = records.filter(r => !removedSet.has(r.userId))

    // Apply moves (update reservistSection)
    const moveMap = new Map((body.moves ?? []).map(m => [m.userId, m.targetSection]))
    records = records.map(r => {
        if (!moveMap.has(r.userId)) return r
        const target = moveMap.get(r.userId)
        const { reservistSection: _drop, ...rest } = r as any
        return target ? { ...rest, reservistSection: target } : rest
    })

    // Apply additions (skip if userId already present)
    const existingIds = new Set(records.map(r => r.userId))
    for (const a of (body.additions ?? [])) {
        if (existingIds.has(a.userId)) continue
        records.push({
            userId: a.userId,
            unit: a.sectionTitle,
            orbatSection: a.sectionTitle,
            orbatRole: a.orbatRole,
            reservistSection: a.sectionTitle,
            rsvp: null,
            confirmed: false,
            confirmedBy: null,
            confirmedAt: null,
        })
    }

    // Apply role changes
    const roleChangeMap = new Map((body.roleChanges ?? []).map(rc => [rc.userId, rc.orbatRole]))
    records = records.map(r => {
        if (!roleChangeMap.has(r.userId)) return r
        return { ...r, orbatRole: roleChangeMap.get(r.userId)! }
    })

    await Db.operationAttendance.updateOne({ operationId }, { $set: { records } })

    return NextResponse.json({ ok: true })
}
