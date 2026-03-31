import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RANKS_FLAT } from '@/lib/ranks'
import { parseORBAT, parseRow } from '@/lib/orbat-csv-parser'
import { CERTIFICATIONS } from '@/lib/certifications'
import { AWARDS } from '@/lib/awards'
import { calculatePromotionPoints, type MilpacImportCounts } from '@/lib/points'

// ── Mastersheet CSV parser ────────────────────────────────────────────────────

interface MastersheetRow {
    name: string
    dateJoined: string
    currentRank: string
    j4Points: number
    // Raw attendance counts for point calculation
    primaryNightOps: number
    secondaryNightOps: number
    primaryNightFTX: number
    secondaryNightFTX: number
    platoonTraining: number
    sectionTraining: number
    meetings: number
    j1Interviews: number
    j1InterviewBonus: number
    j2MissionsRun: number
    j3Bct12: number
    j3OtherTrainings: number
    j5ContentCreated: number
    j5MilpacsGenerated: number
    j5OfficialPR: number
    // Mapped qualifications and awards
    qualifications: { date: string; qualification: string }[]
    awards: { date: string; name: string; type: string }[]
}

function isTruthy(val: string): boolean {
    const v = val.trim().toUpperCase()
    return v === 'TRUE' || v === '1' || (!!v && v !== 'FALSE' && v !== '0' && v !== 'INELIGIBLE' && v !== '')
}

function toInt(val: string): number {
    const n = parseInt(val.trim(), 10)
    return isNaN(n) ? 0 : n
}

// The Billet Mastersheet has multi-line quoted headers spanning several file lines.
// We normalise them by joining continuation lines into a single flat header row,
// then locate the first data row (col 0 is a non-empty, non-numeric name).
function parseMastersheet(csv: string): MastersheetRow[] {
    // Split preserving quoted newlines
    const rawLines = csv.split(/\r?\n/)

    // Re-join quoted multi-line cells
    const lines: string[] = []
    let buf = ''
    let openQuotes = 0
    for (const line of rawLines) {
        for (const ch of line) {
            if (ch === '"') openQuotes ^= 1
        }
        buf = buf ? buf + ' ' + line : line
        if (openQuotes === 0) {
            lines.push(buf)
            buf = ''
        }
    }
    if (buf) lines.push(buf)

    const rows = lines.map(parseRow)

    // Build a flat header by merging all header rows until the first data row.
    // A data row has col 0 looking like a name (non-empty, not a known section label).
    const headerRows: string[][] = []
    let dataStartIdx = 0
    for (let i = 0; i < rows.length; i++) {
        const col0 = (rows[i][0] ?? '').trim()
        // Data rows have a non-empty col0 that isn't blank/numeric/header keyword
        if (col0 && !/^[\d,]/.test(col0) && col0 !== 'Name' && headerRows.length > 0) {
            dataStartIdx = i
            break
        }
        headerRows.push(rows[i])
    }

    // Merge header rows into a single array of column names (last non-empty wins per col)
    const maxCols = Math.max(...headerRows.map(r => r.length))
    const headers: string[] = Array(maxCols).fill('')
    for (const hRow of headerRows) {
        for (let c = 0; c < hRow.length; c++) {
            const v = hRow[c].trim().replace(/\s+/g, ' ')
            if (v) headers[c] = v
        }
    }

    // Build lookup maps from csvHeader → column index
    const certColMap = new Map<number, typeof CERTIFICATIONS[number]>()
    const awardColMap = new Map<number, typeof AWARDS[number]>()

    for (let c = 0; c < headers.length; c++) {
        const h = headers[c].toLowerCase()
        for (const cert of CERTIFICATIONS) {
            if (h === cert.csvHeader.toLowerCase()) {
                certColMap.set(c, cert)
                break
            }
        }
        for (const award of AWARDS) {
            if (h === award.csvHeader.toLowerCase()) {
                awardColMap.set(c, award)
                break
            }
        }
    }

    // Find fixed column indices by header name
    const colIdx = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase())

    const COL_NAME         = 0
    const COL_DATE_JOINED  = colIdx('Date Joined') !== -1 ? colIdx('Date Joined') : 1
    const COL_CURRENT_RANK = colIdx('Current Rank') !== -1 ? colIdx('Current Rank') : 7
    const COL_J4_POINTS    = colIdx('J4 Awarded Points') !== -1 ? colIdx('J4 Awarded Points') : 9
    // Attendance columns (odd-indexed due to merged-cell spacers in the sheet)
    const COL_PRI_OPS      = 11
    const COL_SEC_OPS      = 13
    const COL_PRI_FTX      = 15
    const COL_SEC_FTX      = 17
    const COL_PLT_TRN      = 19
    const COL_SEC_TRN      = 21
    const COL_MEETINGS     = 23
    // Department columns
    const COL_J1_INT       = colIdx('Interviews Completed') !== -1 ? colIdx('Interviews Completed') : 30
    const COL_J1_BONUS     = 31
    const COL_J2_MISSIONS  = colIdx('MISSIONS RUN') !== -1 ? colIdx('MISSIONS RUN') : 33
    const COL_J3_BCT       = colIdx('BCT1/2') !== -1 ? colIdx('BCT1/2') : 35
    const COL_J3_OTHER     = colIdx('ALL OTHER TRAININGS') !== -1 ? colIdx('ALL OTHER TRAININGS') : 36
    const COL_J5_PR        = colIdx('Official Public Relations') !== -1 ? colIdx('Official Public Relations') : 38
    const COL_J5_CONTENT   = colIdx('CONTENT CREATED') !== -1 ? colIdx('CONTENT CREATED') : 39
    const COL_J5_MILPACS   = colIdx('MILPACs Generated') !== -1 ? colIdx('MILPACs Generated') : 40

    const results: MastersheetRow[] = []

    for (let i = dataStartIdx; i < rows.length; i++) {
        const row = rows[i]
        const name = (row[COL_NAME] ?? '').trim()
        if (!name) continue

        const qualifications: MastersheetRow['qualifications'] = []
        const awards: MastersheetRow['awards'] = []

        for (const [col, cert] of certColMap) {
            if (isTruthy(row[col] ?? '')) {
                qualifications.push({ date: '', qualification: cert.label })
            }
        }
        for (const [col, award] of awardColMap) {
            if (isTruthy(row[col] ?? '')) {
                awards.push({ date: '', name: award.label, type: award.type })
            }
        }

        results.push({
            name,
            dateJoined:        (row[COL_DATE_JOINED]  ?? '').trim(),
            currentRank:       (row[COL_CURRENT_RANK]  ?? '').trim(),
            j4Points:          toInt(row[COL_J4_POINTS]   ?? ''),
            primaryNightOps:   toInt(row[COL_PRI_OPS]     ?? ''),
            secondaryNightOps: toInt(row[COL_SEC_OPS]     ?? ''),
            primaryNightFTX:   toInt(row[COL_PRI_FTX]     ?? ''),
            secondaryNightFTX: toInt(row[COL_SEC_FTX]     ?? ''),
            platoonTraining:   toInt(row[COL_PLT_TRN]     ?? ''),
            sectionTraining:   toInt(row[COL_SEC_TRN]     ?? ''),
            meetings:          toInt(row[COL_MEETINGS]    ?? ''),
            j1Interviews:      toInt(row[COL_J1_INT]      ?? ''),
            j1InterviewBonus:  toInt(row[COL_J1_BONUS]    ?? ''),
            j2MissionsRun:     toInt(row[COL_J2_MISSIONS] ?? ''),
            j3Bct12:           toInt(row[COL_J3_BCT]      ?? ''),
            j3OtherTrainings:  toInt(row[COL_J3_OTHER]    ?? ''),
            j5OfficialPR:      toInt(row[COL_J5_PR]       ?? ''),
            j5ContentCreated:  toInt(row[COL_J5_CONTENT]  ?? ''),
            j5MilpacsGenerated:toInt(row[COL_J5_MILPACS]  ?? ''),
            qualifications,
            awards,
        })
    }

    return results
}

// ── POST /api/admin/mass-import ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.massImport)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let orbatCsv: string
    let mastersheetCsv: string

    try {
        const formData = await request.formData()
        const orbatFile      = formData.get('orbat')      as File | null
        const mastersheetFile = formData.get('mastersheet') as File | null
        if (!orbatFile || !mastersheetFile) {
            return NextResponse.json({ error: 'Both orbat and mastersheet files are required' }, { status: 400 })
        }
        orbatCsv       = await orbatFile.arrayBuffer().then(b => Buffer.from(b).toString('utf-8'))
        mastersheetCsv = await mastersheetFile.arrayBuffer().then(b => Buffer.from(b).toString('utf-8'))
    } catch {
        return NextResponse.json({ error: 'Failed to read uploaded files' }, { status: 400 })
    }

    // ── Parse CSVs ────────────────────────────────────────────────────────────
    const orbat       = parseORBAT(orbatCsv)
    const mastersheet = parseMastersheet(mastersheetCsv)

    // ── Build user lookup ─────────────────────────────────────────────────────
    const allMembers = await Db.users.find({}).toArray()
    const lookup     = client.buildOrbatLookup(allMembers)

    const KNOWN_RANKS   = new Set(RANKS_FLAT.map(r => r.abbr))
    const nameUpdates   = new Map<string, { name: string; rank?: string }>()

    const lookupAndTrack = (rawName: string) => {
        rawName = rawName.replace(/\s+/g, ' ').trim()
        const user = lookup(rawName)
        if (!rawName) return user
        if (!user) {
            console.log(`[MASS-IMPORT] no match for: "${rawName}"`)
            return null
        }
        const spaceIdx = rawName.indexOf(' ')
        if (spaceIdx !== -1) {
            const prefix = rawName.slice(0, spaceIdx)
            const rest   = rawName.slice(spaceIdx + 1).trim()
            if (KNOWN_RANKS.has(prefix) && rest) {
                nameUpdates.set(user._id, { name: rest, rank: prefix })
            } else {
                nameUpdates.set(user._id, { name: rawName.trim() })
            }
        } else {
            nameUpdates.set(user._id, { name: rawName.trim() })
        }
        return user
    }

    // ── Build ORBAT positions ─────────────────────────────────────────────────
    const positions: Omit<OrbatPosition, '_id'>[] = []
    let sectionOrder = 0

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

    for (const section of orbat.platoon11) {
        section.members.forEach((m, i) => {
            positions.push({ category: 'platoon11', sectionTitle: section.title, role: m.role, userId: lookupAndTrack(m.name)?._id ?? null, sectionOrder, positionOrder: i })
        })
        sectionOrder++
    }

    for (const section of orbat.platoon12) {
        section.members.forEach((m, i) => {
            positions.push({ category: 'platoon12', sectionTitle: section.title, role: m.role, userId: lookupAndTrack(m.name)?._id ?? null, sectionOrder, positionOrder: i })
        })
        sectionOrder++
    }

    for (const section of orbat.support) {
        section.members.forEach((m, i) => {
            positions.push({ category: 'support', sectionTitle: section.title, role: m.role, userId: lookupAndTrack(m.name)?._id ?? null, sectionOrder, positionOrder: i })
        })
        sectionOrder++
    }

    orbat.activeReservists.forEach((name, i) => {
        positions.push({ category: 'activeReservist', sectionTitle: '', role: 'Active Reservist', userId: lookupAndTrack(name)?._id ?? null, sectionOrder, positionOrder: i })
    })
    sectionOrder++

    orbat.inactiveReservists.forEach((name, i) => {
        positions.push({ category: 'inactiveReservist', sectionTitle: '', role: 'Inactive Reservist', userId: lookupAndTrack(name)?._id ?? null, sectionOrder, positionOrder: i })
    })
    sectionOrder++

    orbat.gamemasters.forEach((m, i) => {
        positions.push({ category: 'gamemaster', sectionTitle: 'Gamemasters', role: m.role, userId: lookupAndTrack(m.name)?._id ?? null, sectionOrder, positionOrder: i })
    })

    const seenUserIds = new Set<string>()
    const dedupedPositions = positions.filter(p => {
        if (!p.userId) return true
        if (seenUserIds.has(p.userId)) return false
        seenUserIds.add(p.userId)
        return true
    })

    // ── Process mastersheet rows → milpac updates ─────────────────────────────
    const milpacUpdates = new Map<string, {
        currentRank?: string
        enlistedDate?: string
        promotionPoints: number
        j4Points: number
        billetCounts: Omit<MilpacImportCounts, 'awards' | 'qualifications' | 'j4Points'>
    }>()

    let mastersheetMatched = 0

    for (const row of mastersheet) {
        const user = lookup(row.name)
        if (!user) {
            console.log(`[MASS-IMPORT] mastersheet no match for: "${row.name}"`)
            continue
        }
        mastersheetMatched++

        const counts: MilpacImportCounts = {
            primaryNightOps:    row.primaryNightOps,
            secondaryNightOps:  row.secondaryNightOps,
            primaryNightFTX:    row.primaryNightFTX,
            secondaryNightFTX:  row.secondaryNightFTX,
            platoonTraining:    row.platoonTraining,
            sectionTraining:    row.sectionTraining,
            meetings:           row.meetings,
            campaignMedals:     0,
            j1Interviews:       row.j1Interviews,
            j1InterviewBonus:   row.j1InterviewBonus,
            j2MissionsRun:      row.j2MissionsRun,
            j3Bct12:            row.j3Bct12,
            j3OtherTrainings:   row.j3OtherTrainings,
            j5ContentCreated:   row.j5ContentCreated,
            j5MilpacsGenerated: row.j5MilpacsGenerated,
            j5OfficialPR:       row.j5OfficialPR,
            awards:             [],
            qualifications:     [],
            j4Points:           row.j4Points,
        }

        milpacUpdates.set(user._id, {
            currentRank:    row.currentRank || undefined,
            enlistedDate:   row.dateJoined || undefined,
            promotionPoints: calculatePromotionPoints(counts),
            j4Points:       row.j4Points,
            billetCounts: {
                primaryNightOps:    row.primaryNightOps,
                secondaryNightOps:  row.secondaryNightOps,
                primaryNightFTX:    row.primaryNightFTX,
                secondaryNightFTX:  row.secondaryNightFTX,
                platoonTraining:    row.platoonTraining,
                sectionTraining:    row.sectionTraining,
                meetings:           row.meetings,
                campaignMedals:     0,
                j1Interviews:       row.j1Interviews,
                j1InterviewBonus:   row.j1InterviewBonus,
                j2MissionsRun:      row.j2MissionsRun,
                j3Bct12:            row.j3Bct12,
                j3OtherTrainings:   row.j3OtherTrainings,
                j5ContentCreated:   row.j5ContentCreated,
                j5MilpacsGenerated: row.j5MilpacsGenerated,
                j5OfficialPR:       row.j5OfficialPR,
            },
        })
    }

    // ── DB writes ─────────────────────────────────────────────────────────────

    // 1. Wipe and rebuild ORBAT
    await Db.orbatPositions.dropIndexes()
    await Db.orbatPositions.deleteMany({})
    if (dedupedPositions.length > 0) {
        await Db.orbatPositions.insertMany(
            dedupedPositions.map(p => ({ ...p, _id: new ObjectId() })) as OrbatPosition[]
        )
    }

    // 2. Bulk-update milpac data from mastersheet
    if (milpacUpdates.size > 0) {
        await Db.users.bulkWrite(
            Array.from(milpacUpdates.entries()).map(([userId, data]) => ({
                updateOne: {
                    filter: { _id: userId } as any,
                    update: {
                        $set: {
                            ...(data.currentRank  ? { 'milpac.currentRank':    data.currentRank  } : {}),
                            ...(data.enlistedDate ? { 'milpac.enlistedDate':   data.enlistedDate } : {}),
                            'milpac.promotionPoints':  data.promotionPoints,
                            'milpac.j4Points':         data.j4Points,
                            'milpac.billetCounts':     data.billetCounts,
                        },
                    },
                },
            }))
        )
    }

    // 3. Update names/ranks from ORBAT (may override rank set above — ORBAT is source of truth for name)
    if (nameUpdates.size > 0) {
        await Db.users.bulkWrite(
            Array.from(nameUpdates.entries()).map(([userId, { name, rank }]) => ({
                updateOne: {
                    filter: { _id: userId } as any,
                    update: { $set: { name, ...(rank ? { 'milpac.currentRank': rank } : {}) } },
                },
            }))
        )
    }

    // 4. Rebuild ORBAT indexes
    await Db.orbatPositions.createIndex(
        { userId: 1 } as any,
        { unique: true, partialFilterExpression: { userId: { $type: 'string' } } } as any
    )
    await Db.orbatPositions.createIndex({ category: 1, sectionOrder: 1, positionOrder: 1 } as any)

    const orbatMatched = positions.filter(p => p.userId !== null).length

    return NextResponse.json({
        orbatInserted:       dedupedPositions.length,
        orbatMatched,
        mastersheetRows:     mastersheet.length,
        mastersheetMatched,
        usersUpdated:        milpacUpdates.size,
        namesUpdated:        nameUpdates.size,
    })
}
