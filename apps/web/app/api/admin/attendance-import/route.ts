import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { parseAttendanceCSV, collectOperations } from '@/lib/attendance/csv-parser'

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

// Excel epoch-zero appears when a date cell is empty — not a real Sunday date
const EPOCH_ZERO = '30/12/1899'
function isRealDate(d: string): boolean {
    return !!d && d !== EPOCH_ZERO && d !== '0'
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
    // Each CSV weekend produces UP TO TWO operation docs: one for Saturday, one for Sunday.
    // Key format:  "${op.name}|${op.satDate}|sat"  and  "${op.name}|${op.satDate}|sun"
    const existingOps = await Db.operations.find({}).toArray()
    const opIdMap = new Map<string, ObjectId>()

    for (const op of allOps) {
        const normName = normaliseOpName(op.name)
        const satDate = parseDMY(op.satDate)

        // --- Saturday operation ---
        const satTitle = `${op.name} — Sat`
        const satNormName = normaliseOpName(satTitle)
        const satMatch = existingOps.find(dbOp =>
            normaliseOpName(dbOp.title) === satNormName || normaliseOpName(dbOp.title) === normName
        )
        if (satMatch) {
            opIdMap.set(`${op.name}|${op.satDate}|sat`, satMatch._id)
        } else {
            const result = await Db.operations.insertOne({
                title: satTitle,
                department: '1-0',
                date: satDate ?? new Date(),
                loreDate: satDate ?? new Date(),
                status: 'Completed',
            } as Operation)
            opIdMap.set(`${op.name}|${op.satDate}|sat`, result.insertedId)
        }

        // --- Sunday operation (only when a real Sunday date exists) ---
        if (isRealDate(op.sunDate)) {
            const sunDate = parseDMY(op.sunDate)
            const sunTitle = `${op.name} — Sun`
            const sunNormName = normaliseOpName(sunTitle)
            const sunMatch = existingOps.find(dbOp =>
                normaliseOpName(dbOp.title) === sunNormName
            )
            if (sunMatch) {
                opIdMap.set(`${op.name}|${op.satDate}|sun`, sunMatch._id)
            } else {
                const result = await Db.operations.insertOne({
                    title: sunTitle,
                    department: '1-0',
                    date: sunDate ?? new Date(),
                    loreDate: sunDate ?? new Date(),
                    status: 'Completed',
                } as Operation)
                opIdMap.set(`${op.name}|${op.satDate}|sun`, result.insertedId)
            }
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

    // --- Build OperationAttendance docs — one per operation (sat and sun separately) ---
    // opId → userId → record
    const attendanceByOp = new Map<string, Map<string, OperationAttendanceRecord>>()

    function upsertRecord(
        opId: ObjectId,
        effectiveUserId: string,
        unit: string,
        rank: string,
        attended: boolean,
        importedStatus: string,
    ) {
        const opIdStr = opId.toString()
        if (!attendanceByOp.has(opIdStr)) attendanceByOp.set(opIdStr, new Map())
        const byUser = attendanceByOp.get(opIdStr)!
        const existing = byUser.get(effectiveUserId)
        if (existing) {
            if (attended) {
                existing.confirmed = true
                existing.confirmedAt = new Date()
                existing.importedStatus = 'ATTENDED'
            }
        } else {
            byUser.set(effectiveUserId, {
                userId: effectiveUserId,
                unit,
                orbatSection: unit,
                orbatRole: rank,
                rsvp: null,
                confirmed: attended,
                confirmedBy: null,
                confirmedAt: attended ? new Date() : null,
                importedStatus,
                attendanceType: importedStatus || undefined,
            })
        }
    }

    for (const section of sections) {
        for (const member of section.members) {
            const memberKey = `${section.unit}|${member.name}`
            const userId = memberUserIdMap.get(memberKey)
            const effectiveUserId = userId ?? member.name

            for (const att of member.attendance) {
                const op = section.operations[att.opIndex]
                const baseKey = `${op.name}|${op.satDate}`

                // Saturday
                if (att.sat) {
                    const satOpId = opIdMap.get(`${baseKey}|sat`)
                    if (satOpId) {
                        upsertRecord(satOpId, effectiveUserId, section.unit, member.rank,
                            att.sat === 'ATTENDED', att.sat)
                    }
                }

                // Sunday — fall back to Saturday op for single-day formats (e.g. 2022)
                // where the date is stored in the Saturday column but attendance is in the Sunday column
                if (att.sun) {
                    const sunOpId = opIdMap.get(`${baseKey}|sun`) ?? opIdMap.get(`${baseKey}|sat`)
                    if (sunOpId) {
                        upsertRecord(sunOpId, effectiveUserId, section.unit, member.rank,
                            att.sun === 'ATTENDED', att.sun)
                    }
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
