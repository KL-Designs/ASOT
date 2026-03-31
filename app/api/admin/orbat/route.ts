import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RANKS_FLAT } from '@/lib/ranks'
import { parseORBAT } from '@/lib/orbat-csv-parser'

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
                      username: u.username,
                      displayName: (u.milpac?.currentRank ? u.milpac.currentRank + ' ' : '') + (u.name || u.guild.nickname || u.globalName || u.username),
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

    const KNOWN_RANKS = new Set(RANKS_FLAT.map(r => r.abbr))
    const nameUpdates = new Map<string, { name: string; rank?: string }>() // userId → parsed data
    const lookupAndTrack = (rawName: string) => {
        rawName = rawName.replace(/\s+/g, ' ').trim()
        const user = lookup(rawName)
        if (!rawName) return user
        if (!user) {
            console.log(`[ORBAT] no match for: "${rawName}"`)
            return null
        }
        const spaceIdx = rawName.indexOf(' ')
        if (spaceIdx !== -1) {
            const prefix = rawName.slice(0, spaceIdx)
            const rest = rawName.slice(spaceIdx + 1).trim()
            if (KNOWN_RANKS.has(prefix) && rest) {
                console.log(`[ORBAT] matched "${rawName}" → userId=${user._id} name="${rest}" rank="${prefix}"`)
                nameUpdates.set(user._id, { name: rest, rank: prefix })
            } else {
                console.log(`[ORBAT] matched "${rawName}" → userId=${user._id} name="${rawName.trim()}" (no rank prefix)`)
                nameUpdates.set(user._id, { name: rawName.trim() })
            }
        } else {
            console.log(`[ORBAT] matched "${rawName}" → userId=${user._id} name="${rawName.trim()}" (no space)`)
            nameUpdates.set(user._id, { name: rawName.trim() })
        }
        return user
    }

    const positions: Omit<OrbatPosition, '_id'>[] = []
    let sectionOrder = 0

    // ── Company HQ ────────────────────────────────────────────────────────────
    {
        const sec = orbat.companyHQ
        positions.push({
            category: 'companyHQ',
            sectionTitle: 'India Company HQ',
            role: sec.senior.role,
            userId: lookupAndTrack(sec.senior.name)?._id ?? null,
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
                userId: lookupAndTrack(m.name)?._id ?? null,
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
                userId: lookupAndTrack(m.name)?._id ?? null,
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
                userId: lookupAndTrack(m.name)?._id ?? null,
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
                userId: lookupAndTrack(m.name)?._id ?? null,
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
            userId: lookupAndTrack(name)?._id ?? null,
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
            userId: lookupAndTrack(name)?._id ?? null,
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
            userId: lookupAndTrack(m.name)?._id ?? null,
            sectionOrder,
            positionOrder: i,
        })
    })

    // Deduplicate positions — sheet sometimes lists the same person in multiple sections
    const seenUserIds = new Set<string>()
    const dedupedPositions = positions.filter(p => {
        if (!p.userId) return true
        if (seenUserIds.has(p.userId)) {
            console.log(`[ORBAT] duplicate userId=${p.userId} in positions, keeping first occurrence`)
            return false
        }
        seenUserIds.add(p.userId)
        return true
    })

    // Wipe and reinsert
    await Db.orbatPositions.dropIndexes()
    await Db.orbatPositions.deleteMany({})
    if (dedupedPositions.length > 0) {
        await Db.orbatPositions.insertMany(
            dedupedPositions.map(p => ({ ...p, _id: new ObjectId() })) as OrbatPosition[]
        )
    }

    // Update user names and ranks before index creation so a failure there doesn't block this
    if (nameUpdates.size > 0) {
        console.log(`[ORBAT] running bulkWrite for ${nameUpdates.size} users`)
        const bulkResult = await Db.users.bulkWrite(
            Array.from(nameUpdates.entries()).map(([userId, { name, rank }]) => ({
                updateOne: {
                    filter: { _id: userId } as any,
                    update: { $set: { name, ...(rank ? { 'milpac.currentRank': rank } : {}) } },
                },
            }))
        )
        console.log(`[ORBAT] bulkWrite result: matchedCount=${bulkResult.matchedCount} modifiedCount=${bulkResult.modifiedCount}`)
    }

    // Ensure indexes
    await Db.orbatPositions.createIndex({ userId: 1 } as any, { unique: true, partialFilterExpression: { userId: { $type: 'string' } } } as any)
    await Db.orbatPositions.createIndex(
        { category: 1, sectionOrder: 1, positionOrder: 1 } as any
    )

    const matched = positions.filter(p => p.userId !== null).length
    return NextResponse.json({ inserted: positions.length, matched, namesUpdated: nameUpdates.size })
}


