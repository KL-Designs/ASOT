import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

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

    if (true) {
        const categoriesToFetch = [...new Set([
            ...CATEGORY_ORDER.filter(c => assignedPlatoons.includes(c)),
            'gamemaster',
        ])]
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

        const rankAbbr = u.milpac?.currentRank
        const memberName = u.name
        const displayName = rankAbbr && memberName
            ? `${rankAbbr} ${memberName}`
            : u.guild?.displayName || u.globalName || u.username || record.userId

        return {
            ...record,
            user: {
                id: u.id,
                displayName,
                avatarURL: u.guild?.avatarURL || u.avatarURL || '',
                isSkeletonAccount: u.isSkeletonAccount,
                csvName: u.csvName,
            },
        }
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
        })
    }

    return NextResponse.json({ ...attendance, recordsWithUsers, sectionRolesMap })
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
            },
        },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
