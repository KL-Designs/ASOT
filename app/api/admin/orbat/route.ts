import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const SHEET_ID = '1rkzQSPimBYV3UDp-CFHUfQo59yww_xbj9UTPGWBzSL0'
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`


// ── GET /api/admin/orbat ───────────────────────────────────────────────────────
// Returns all positions with hydrated user info.

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const positions = await Db.orbatPositions
        .find({})
        .sort({ category: 1, sectionOrder: 1, positionOrder: 1 })
        .toArray()

    const userIds = positions.map(p => p.userId).filter(Boolean) as string[]
    const users = userIds.length
        ? await Db.users.find({ _id: { $in: userIds } }).toArray()
        : []

    const userMap = new Map(users.map(u => [u._id, u]))

    const result: OrbatPositionWithUser[] = positions.map(p => {
        const u = p.userId ? userMap.get(p.userId) : null
        return {
            ...p,
            user: u
                ? {
                      id: u._id,
                      displayName: u.guild?.nickname || u.globalName || u.username,
                      avatarURL: u.guild?.avatarURL || u.avatarURL,
                  }
                : null,
        }
    })

    return NextResponse.json(result)
}


// ── POST /api/admin/orbat ──────────────────────────────────────────────────────
// One-time import from Google Sheet. Body: { confirm: true }
// Destroys and recreates the entire collection from the sheet.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    if (!body.confirm) return NextResponse.json({ error: 'Missing confirm flag' }, { status: 400 })

    // Fetch and parse the sheet
    const res = await fetch(CSV_URL)
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`)
    const csv = await res.text()
    const orbat = parseORBAT(csv)

    // Build userId lookup from current guild members
    const allMembers = await Db.users.find({}).toArray()
    const lookup = client.buildOrbatLookup(allMembers)

    const positions: Omit<OrbatPosition, '_id'>[] = []
    let sectionOrder = 0

    // ── Company HQ ────────────────────────────────────────────────────────────
    {
        const sec = orbat.companyHQ
        positions.push({
            category: 'companyHQ',
            sectionTitle: 'India Company HQ',
            role: sec.senior.role,
            userId: lookup(sec.senior.name)?._id ?? null,
            sectionOrder,
            positionOrder: 0,
            isSenior: true,
            subTitle: sec.subTitle || undefined,
        })
        sec.members.forEach((m, i) => {
            positions.push({
                category: 'companyHQ',
                sectionTitle: 'India Company HQ',
                role: m.role,
                userId: lookup(m.name)?._id ?? null,
                sectionOrder,
                positionOrder: i + 1,
            })
        })
        sectionOrder++
    }

    // ── Platoon 1-1 ───────────────────────────────────────────────────────────
    for (const section of orbat.platoon11) {
        section.members.forEach((m, i) => {
            positions.push({
                category: 'platoon11',
                sectionTitle: section.title,
                role: m.role,
                userId: lookup(m.name)?._id ?? null,
                sectionOrder,
                positionOrder: i,
            })
        })
        sectionOrder++
    }

    // ── Platoon 1-2 ───────────────────────────────────────────────────────────
    for (const section of orbat.platoon12) {
        section.members.forEach((m, i) => {
            positions.push({
                category: 'platoon12',
                sectionTitle: section.title,
                role: m.role,
                userId: lookup(m.name)?._id ?? null,
                sectionOrder,
                positionOrder: i,
            })
        })
        sectionOrder++
    }

    // ── Support ───────────────────────────────────────────────────────────────
    for (const section of orbat.support) {
        section.members.forEach((m, i) => {
            positions.push({
                category: 'support',
                sectionTitle: section.title,
                role: m.role,
                userId: lookup(m.name)?._id ?? null,
                sectionOrder,
                positionOrder: i,
            })
        })
        sectionOrder++
    }

    // ── Active Reservists ─────────────────────────────────────────────────────
    orbat.activeReservists.forEach((name, i) => {
        positions.push({
            category: 'activeReservist',
            sectionTitle: '',
            role: 'Active Reservist',
            userId: lookup(name)?._id ?? null,
            sectionOrder,
            positionOrder: i,
        })
    })
    sectionOrder++

    // ── Inactive Reservists ───────────────────────────────────────────────────
    orbat.inactiveReservists.forEach((name, i) => {
        positions.push({
            category: 'inactiveReservist',
            sectionTitle: '',
            role: 'Inactive Reservist',
            userId: lookup(name)?._id ?? null,
            sectionOrder,
            positionOrder: i,
        })
    })
    sectionOrder++

    // ── Gamemasters ───────────────────────────────────────────────────────────
    orbat.gamemasters.forEach((m, i) => {
        positions.push({
            category: 'gamemaster',
            sectionTitle: 'Gamemasters',
            role: m.role,
            userId: lookup(m.name)?._id ?? null,
            sectionOrder,
            positionOrder: i,
        })
    })

    // Wipe and reinsert
    await Db.orbatPositions.deleteMany({})
    if (positions.length > 0) {
        await Db.orbatPositions.insertMany(
            positions.map(p => ({ ...p, _id: new ObjectId() })) as OrbatPosition[]
        )
    }

    // Ensure indexes
    await Db.orbatPositions.createIndex({ userId: 1 } as any, { unique: true, sparse: true })
    await Db.orbatPositions.createIndex(
        { category: 1, sectionOrder: 1, positionOrder: 1 } as any
    )

    const matched = positions.filter(p => p.userId !== null).length
    return NextResponse.json({ inserted: positions.length, matched })
}


// ── CSV parser (copy of lib/orbat.ts logic, kept local to avoid circular dep) ─

interface _Member { role: string; name: string }
interface _Section { title: string; members: _Member[] }
interface _ORBATData {
    companyHQ: { senior: _Member; subTitle: string; members: _Member[] }
    platoon11: _Section[]
    platoon12: _Section[]
    support: _Section[]
    activeReservists: string[]
    inactiveReservists: string[]
    gamemasters: _Member[]
}

function parseRow(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
        } else {
            current += char
        }
    }
    result.push(current.trim())
    return result
}

function parseORBAT(csv: string): _ORBATData {
    const rows = csv.split(/\r?\n/).map(parseRow)
    const c = (row: string[], i: number) => (row[i] ?? '').trim()

    const data: _ORBATData = {
        companyHQ: { senior: { role: 'Commanding Officer', name: '' }, subTitle: '', members: [] },
        platoon11: [], platoon12: [], support: [],
        activeReservists: [], inactiveReservists: [], gamemasters: [],
    }

    let hqPhase: 'none' | 'senior' | 'sub' = 'none'
    let rightState: 'none' | 'active' | 'inactive' | 'gm' = 'none'

    for (const row of rows) {
        if (c(row, 9) === '0-A INDIA COMPANY HEADQUARTERS') {
            hqPhase = 'senior'
        } else if (c(row, 9) === '1-0 INDIA COMPANY HEADQUARTERS') {
            data.companyHQ.subTitle = c(row, 9)
            hqPhase = 'sub'
        } else if (hqPhase === 'senior' && c(row, 9) && c(row, 14)) {
            data.companyHQ.senior = { role: c(row, 9), name: c(row, 14) }
        } else if (hqPhase === 'sub' && c(row, 9) && c(row, 14)) {
            data.companyHQ.members.push({ role: c(row, 9), name: c(row, 14) })
        }

        if (/^1-1-/.test(c(row, 1))) {
            data.platoon11.push({ title: c(row, 1), members: [] })
        } else if (c(row, 2) && data.platoon11.length > 0) {
            data.platoon11[data.platoon11.length - 1].members.push({ role: c(row, 2), name: c(row, 5) })
        }

        if (/^1-2-/.test(c(row, 7))) {
            data.platoon12.push({ title: c(row, 7), members: [] })
        } else if (c(row, 8) && data.platoon12.length > 0) {
            data.platoon12[data.platoon12.length - 1].members.push({ role: c(row, 8), name: c(row, 11) })
        }

        if (/^1-3 [A-Z]/.test(c(row, 15))) {
            data.support.push({ title: c(row, 15), members: [] })
        } else if (c(row, 16) && data.support.length > 0) {
            data.support[data.support.length - 1].members.push({ role: c(row, 16), name: c(row, 19) })
        }

        const col21 = c(row, 21)
        if (col21 === 'COMPANY RESERVISTS (ACTIVE)') {
            rightState = 'active'
        } else if (col21 === 'COMPANY RESERVISTS (INACTIVE)') {
            rightState = 'inactive'
        } else if (col21.includes('GAMEMASTERS')) {
            rightState = 'gm'
        } else if (rightState === 'active' || rightState === 'inactive') {
            const list = rightState === 'active' ? data.activeReservists : data.inactiveReservists
            if (c(row, 22)) list.push(c(row, 22))
            if (c(row, 24)) list.push(c(row, 24))
        } else if (rightState === 'gm' && c(row, 22)) {
            data.gamemasters.push({ role: c(row, 22), name: c(row, 25) })
        }
    }

    return data
}
