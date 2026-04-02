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

    let allSections: ReturnType<typeof parseAttendanceCSV> = []
    try {
        const formData = await req.formData()
        const files = formData.getAll('attendance') as File[]
        if (files.length === 0) return NextResponse.json({ error: 'No attendance files provided' }, { status: 400 })
        for (const file of files) {
            const csvText = await file.text()
            const parsed = parseAttendanceCSV(csvText)
            allSections = allSections.concat(parsed)
        }
    } catch {
        return NextResponse.json({ error: 'Failed to read file(s)' }, { status: 400 })
    }

    const sections = allSections
    if (sections.length === 0) {
        return NextResponse.json({ error: 'No sections found in uploaded CSV(s)' }, { status: 400 })
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
    // Use nested Maps to deduplicate: opId → userId → record (one record per user per op)
    const attendanceByOp = new Map<string, Map<string, OperationAttendanceRecord>>()

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
                if (!attendanceByOp.has(opIdStr)) attendanceByOp.set(opIdStr, new Map())

                const byUser = attendanceByOp.get(opIdStr)!

                // Merge sat/sun into one record per user — attended either night = ATTENDED
                const attended = att.sat === 'ATTENDED' || att.sun === 'ATTENDED'
                const importedStatus = attended ? 'ATTENDED' : (att.sat || att.sun || '')

                const existing = byUser.get(effectiveUserId)
                if (existing) {
                    // Keep the most positive status if this user appears in multiple sections
                    if (attended) {
                        existing.confirmed = true
                        existing.confirmedAt = new Date()
                        existing.importedStatus = 'ATTENDED'
                    }
                } else {
                    byUser.set(effectiveUserId, {
                        userId: effectiveUserId,
                        unit: section.unit,
                        orbatSection: section.unit,
                        orbatRole: member.rank,
                        rsvp: null,
                        confirmed: attended,
                        confirmedBy: null,
                        confirmedAt: attended ? new Date() : null,
                        importedStatus,
                    })
                }
            }
        }
    }

    // --- Upsert OperationAttendance documents ---
    let operationsProcessed = 0
    for (const [opIdStr, byUser] of attendanceByOp) {
        const operationId = new ObjectId(opIdStr)
        const records = Array.from(byUser.values())
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
