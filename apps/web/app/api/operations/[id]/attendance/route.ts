import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { createAttendanceTasksForOperation } from '@/lib/attendance/tasks'
import { toBoardUser } from '@/lib/attendance/board-user'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const attendance = await Db.operationAttendance.findOne({ operationId })

    const assignedPlatoons: string[] = attendance?.assignedPlatoons ?? []
    const existingRecords: OperationAttendanceRecord[] = attendance?.records ?? []

    // Build a map of existing records keyed by userId for quick lookup
    const recordByUserId = new Map<string, OperationAttendanceRecord>()
    for (const r of existingRecords) recordByUserId.set(r.userId, r)

    // category priority order — determines display order in the UI
    const CATEGORY_ORDER = ['companyHQ', 'platoon11', 'platoon12', 'support', 'gamemaster']

    // Build the ordered record list from ORBAT positions (preserves sectionOrder).
    // Each entry gets a `category` field so the UI can group and nest correctly.
    type RecordWithCategory = OperationAttendanceRecord & { category: string }
    const orderedRecords: RecordWithCategory[] = []
    const coveredUserIds = new Set<string>()

    let sectionRolesMap: Record<string, { role: string; userId: string | null }[]> = {}
    let sectionMeta: Array<{ category: string; sectionTitle: string | null; color?: string; patch?: string }> = []

    if (true) {
        const categoriesToFetch = [...new Set([
            ...CATEGORY_ORDER.filter(c => assignedPlatoons.includes(c)),
            'gamemaster',
        ])]

        const metaRecords = await Db.orbatSectionMeta.find(
            { category: { $in: categoriesToFetch } },
            { projection: { category: 1, sectionTitle: 1, color: 1, patch: 1, discordRoleId: 1 } },
        ).toArray()

        // Resolve Discord role colors for entries that have no explicit color
        const roleIds = metaRecords
            .filter(m => !m.color && m.discordRoleId)
            .map(m => m.discordRoleId!)
        const roleColorMap = new Map<string, number>()
        if (roleIds.length > 0) {
            const roles = await Db.roles.find({ id: { $in: roleIds } } as any).toArray() as any[]
            for (const role of roles) {
                if (role.id && role.color) roleColorMap.set(role.id, role.color)
            }
        }

        sectionMeta = metaRecords.map(m => {
            let color = m.color
            if (!color && m.discordRoleId) {
                const n = roleColorMap.get(m.discordRoleId)
                if (n && n > 0) color = `#${n.toString(16).padStart(6, '0')}`
            }
            return { category: m.category, sectionTitle: m.sectionTitle ?? null, color, patch: m.patch }
        })

        const positions = await Db.orbatPositions
            .find({ category: { $in: categoriesToFetch }, userId: { $ne: null } })
            .sort({ sectionOrder: 1, positionOrder: 1 })
            .toArray()

        // Sort positions by our preferred category order, preserving sectionOrder within each category
        positions.sort((a, b) => {
            const ai = CATEGORY_ORDER.indexOf(a.category)
            const bi = CATEGORY_ORDER.indexOf(b.category)
            if (ai !== bi) return ai - bi
            if (a.sectionOrder !== b.sectionOrder) return a.sectionOrder - b.sectionOrder
            return a.positionOrder - b.positionOrder
        })

        for (const pos of positions) {
            if (!pos.userId) continue
            const existing = recordByUserId.get(pos.userId)
            orderedRecords.push({
                ...(existing ?? {
                    userId: pos.userId,
                    unit: pos.sectionTitle,
                    orbatSection: pos.sectionTitle,
                    orbatRole: pos.role,
                    rsvp: null,
                    confirmed: false,
                    confirmedBy: null,
                    confirmedAt: null,
                }),
                orbatSection: pos.sectionTitle,
                orbatRole: existing?.orbatRole ?? pos.role,
                category: pos.category,
            })
            coveredUserIds.add(pos.userId)
        }

        // All positions (including vacant) for role dropdowns
        const allSectionPositions = await Db.orbatPositions
            .find({ category: { $in: categoriesToFetch } })
            .sort({ sectionOrder: 1, positionOrder: 1 })
            .toArray()
        for (const pos of allSectionPositions) {
            const key = pos.sectionTitle
            if (!sectionRolesMap[key]) sectionRolesMap[key] = []
            sectionRolesMap[key].push({ role: pos.role, userId: pos.userId })
        }
    }

    // Append any existing records not covered by the ORBAT.
    // Reservists are looked up separately so they show in their own section rather than 'other'.
    const uncoveredIds = existingRecords
        .filter(r => !coveredUserIds.has(r.userId))
        .map(r => r.userId)

    const reservistPositions = uncoveredIds.length > 0
        ? await Db.orbatPositions
            .find({ category: { $in: ['activeReservist', 'inactiveReservist'] }, userId: { $in: uncoveredIds } })
            .toArray()
        : []
    const reservistCatMap = new Map(reservistPositions.map(p => [p.userId!, p.category]))

    for (const r of existingRecords) {
        if (coveredUserIds.has(r.userId)) continue
        const resCat = reservistCatMap.get(r.userId)
        const sectionLabel = resCat === 'activeReservist'
            ? 'Company Reservists (Active)'
            : resCat === 'inactiveReservist'
            ? 'Company Reservists (Inactive)'
            : undefined
        orderedRecords.push({
            ...r,
            category: resCat ?? 'other',
            ...(sectionLabel && { orbatSection: sectionLabel }),
        })
    }

    const userIds = [...new Set(orderedRecords.map(r => r.userId))]
    const users = await Db.users.find({ $or: [{ _id: { $in: userIds } }, { id: { $in: userIds } }] }).toArray()
    const userMap = new Map<string, User>()
    for (const u of users) {
        userMap.set(u.id, u)
        userMap.set(u._id, u)
    }

    const recordsWithUsers = orderedRecords.map(record => {
        const u = userMap.get(record.userId)
        if (!u) return { ...record, user: null }
        return { ...record, user: toBoardUser(u, record.userId) }
    })

    if (!attendance) {
        return NextResponse.json({
            operationId: id,
            assignedPlatoons: [],
            records: [],
            reservistAssignments: [],
            rsvpOpen: false,
            confirmationOpen: false,
            recordsWithUsers,
            sectionRolesMap,
            sectionMeta,
        })
    }

    // The RSVP open end is authored as a lead time, but documents written before
    // that change only carry the absolute `rsvpOpenAt`. Derive the equivalent
    // offset here rather than in the editor, which would have to wait for the
    // operation to load separately before it could do the subtraction.
    //
    // Nothing is migrated in place: an operation that never had an automatic
    // open still reports none. Arming automation on operations someone had
    // deliberately set to open by hand is not a side effect a read should have.
    let rsvpOpenOffsetMins = (attendance as { rsvpOpenOffsetMins?: number }).rsvpOpenOffsetMins ?? null
    if (rsvpOpenOffsetMins === null && attendance.rsvpOpenAt) {
        const op = await Db.operations.findOne({ _id: operationId }, { projection: { date: 1 } })
        if (op?.date) {
            rsvpOpenOffsetMins = Math.round(
                (new Date(op.date).getTime() - new Date(attendance.rsvpOpenAt).getTime()) / 60_000
            )
        }
    }

    return NextResponse.json({
        ...attendance,
        rsvpOpenOffsetMins,
        recordsWithUsers,
        sectionRolesMap,
        sectionMeta,
    })
}

// POST /api/operations/[id]/attendance — initialise an attendance doc for an operation
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    }

    const body = await req.json()
    const { rsvpOpen, confirmationOpen } = body

    // Check current state before updating so we can detect rsvpOpen transition
    const existingAttendance = await Db.operationAttendance.findOne({ operationId })
    const wasRsvpOpen = existingAttendance?.rsvpOpen ?? false
    const wasConfirmationOpen = existingAttendance?.confirmationOpen ?? false

    const confirmationOpeningNow = confirmationOpen === true && !wasConfirmationOpen
    const openedAt = confirmationOpeningNow ? new Date() : undefined

    await Db.operationAttendance.updateOne(
        { operationId },
        {
            $setOnInsert: {
                operationId,
                assignedPlatoons: [],
                records: [],
                reservistAssignments: [],
            },
            $set: {
                ...(rsvpOpen !== undefined && { rsvpOpen }),
                ...(confirmationOpen !== undefined && { confirmationOpen }),
                // Track when confirmation opens so auto-close knows the 24h window
                ...(openedAt && { confirmationOpenedAt: openedAt }),
            },
        },
        { upsert: true }
    )

    // Create tasks for section leaders when confirmation is manually opened
    if (confirmationOpeningNow && openedAt) {
        const att = await Db.operationAttendance.findOne({ operationId })
        await createAttendanceTasksForOperation(operationId, att?.assignedPlatoons ?? [], openedAt)
    }

    return NextResponse.json({ ok: true })
}
