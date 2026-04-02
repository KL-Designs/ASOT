import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { parseAttendanceCSV, collectOperations } from '@/lib/attendance-csv-parser'

// Fuzzy operation name matcher — strips "OPERATION " prefix for comparison
function normaliseOpName(name: string): string {
    return name.replace(/^OPERATION\s+/i, '').toLowerCase().trim()
}

// Parse a dd/mm/yyyy date string into a Date object (midnight UTC)
function parseDMY(dmy: string): Date | null {
    const parts = dmy.split('/')
    if (parts.length !== 3) return null
    const [d, m, y] = parts.map(Number)
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null
    return new Date(Date.UTC(y, m - 1, d))
}

export async function POST(req: NextRequest) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.massImport)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let csvText: string
    try {
        const formData = await req.formData()
        const file = formData.get('attendance') as File | null
        if (!file) return NextResponse.json({ error: 'No attendance file provided' }, { status: 400 })
        csvText = await file.text()
    } catch {
        return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
    }

    // --- Parse CSV ---
    const sections = parseAttendanceCSV(csvText)
    if (sections.length === 0) {
        return NextResponse.json({ error: 'No sections found in CSV' }, { status: 400 })
    }

    const allOps = collectOperations(sections)

    // --- Match / create operations in DB ---
    const existingOps = await Db.operations.find({}).toArray()

    // key: "normalised name|satDate" → ObjectId
    const opIdMap = new Map<string, ObjectId>()

    for (const op of allOps) {
        const normName = normaliseOpName(op.name)
        const satDate = parseDMY(op.satDate)

        // Try to find a match by normalised name
        const dbMatch = existingOps.find(dbOp => normaliseOpName(dbOp.title) === normName)

        if (dbMatch) {
            opIdMap.set(`${op.name}|${op.satDate}`, dbMatch._id)
        } else {
            // Create a minimal completed operation record
            const newOp: Omit<Operation, '_id'> = {
                title: op.name,
                department: '1-0',
                date: satDate ?? new Date(),
                loreDate: satDate ?? new Date(),
                status: 'Completed',
            }
            const result = await Db.operations.insertOne(newOp as Operation)
            opIdMap.set(`${op.name}|${op.satDate}`, result.insertedId)
        }
    }

    // --- Match members to Discord users ---
    const allUsers = await client.fetchAllMembers()
    const lookup = client.buildOrbatLookup(allUsers)

    interface UnmatchedUser { name: string; rank: string; unit: string }
    const unmatched: UnmatchedUser[] = []

    // Temporary map: "unit|name" → userId (or null if unmatched)
    const memberUserIdMap = new Map<string, string | null>()

    for (const section of sections) {
        for (const member of section.members) {
            const key = `${section.unit}|${member.name}`
            if (memberUserIdMap.has(key)) continue
            const fullName = `${member.rank} ${member.name}`
            const matched = lookup(fullName) ?? lookup(member.name)
            if (matched) {
                memberUserIdMap.set(key, matched.id)
            } else {
                memberUserIdMap.set(key, null)
                unmatched.push({ name: member.name, rank: member.rank, unit: section.unit })
            }
        }
    }

    // --- Build OperationAttendance docs per operation ---
    // Group all attendance entries by operationId
    const attendanceByOp = new Map<string, OperationAttendanceRecord[]>()

    for (const section of sections) {
        for (const member of section.members) {
            const memberKey = `${section.unit}|${member.name}`
            const userId = memberUserIdMap.get(memberKey)
            // Unmatched members use their name as a placeholder userId.
            // The resolve step will swap this out for a real userId or skeleton account ID.
            const effectiveUserId = userId ?? member.name

            for (const att of member.attendance) {
                const op = section.operations[att.opIndex]
                const opKey = `${op.name}|${op.satDate}`
                const opId = opIdMap.get(opKey)
                if (!opId) continue

                const opIdStr = opId.toString()
                if (!attendanceByOp.has(opIdStr)) attendanceByOp.set(opIdStr, [])

                const records = attendanceByOp.get(opIdStr)!

                // Add Saturday record if status present
                if (att.sat) {
                    records.push({
                        userId: effectiveUserId,
                        unit: section.unit,
                        orbatSection: section.unit,
                        orbatRole: member.rank,
                        rsvp: null,
                        confirmed: att.sat === 'ATTENDED',
                        confirmedBy: null,
                        confirmedAt: att.sat === 'ATTENDED' ? new Date() : null,
                        importedStatus: att.sat,
                    })
                }

                // Add Sunday record if status present and different night
                if (att.sun && att.sun !== att.sat) {
                    records.push({
                        userId: effectiveUserId,
                        unit: section.unit,
                        orbatSection: section.unit,
                        orbatRole: member.rank,
                        rsvp: null,
                        confirmed: att.sun === 'ATTENDED',
                        confirmedBy: null,
                        confirmedAt: att.sun === 'ATTENDED' ? new Date() : null,
                        importedStatus: att.sun,
                    })
                }
            }
        }
    }

    // --- Upsert OperationAttendance documents ---
    let operationsProcessed = 0
    for (const [opIdStr, records] of attendanceByOp) {
        const operationId = new ObjectId(opIdStr)
        await Db.operationAttendance.updateOne(
            { operationId },
            {
                $setOnInsert: {
                    operationId,
                    assignedPlatoons: [],
                    reservistAssignments: [],
                    rsvpOpen: false,
                    confirmationOpen: false,
                },
                $set: { records },
            },
            { upsert: true }
        )
        operationsProcessed++
    }

    return NextResponse.json({
        operationsProcessed,
        membersMatched: memberUserIdMap.size - unmatched.length,
        unmatched,
    })
}
