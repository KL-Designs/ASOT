import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { FIELD_SOURCE_MAP, type BilletRow } from '@/lib/billetMastersheet'

function serviceYears(enlistedDate?: string): string {
    if (!enlistedDate) return '—'
    const parts = enlistedDate.split(/[\/\-]/)
    if (parts.length < 3) return '—'
    const [d, m, y] = parts.map(Number)
    const enrolled = new Date(y, m - 1, d)
    if (isNaN(enrolled.getTime())) return '—'
    const diffMs = Date.now() - enrolled.getTime()
    const yrs = diffMs / (1000 * 60 * 60 * 24 * 365.25)
    if (yrs < 1) return `${Math.floor(yrs * 12)}M`
    return `${yrs.toFixed(1)}Y`
}

function parseCSVRow(text: string): string[][] {
    const rows: string[][] = []
    const lines = text.split(/\r?\n/)
    for (const raw of lines) {
        if (!raw.trim()) continue
        const cells: string[] = []
        let cur = ''
        let inQuote = false
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i]
            if (ch === '"') {
                if (inQuote && raw[i + 1] === '"') { cur += '"'; i++ }
                else inQuote = !inQuote
            } else if (ch === ',' && !inQuote) {
                cells.push(cur.trim()); cur = ''
            } else {
                cur += ch
            }
        }
        cells.push(cur.trim())
        rows.push(cells)
    }
    return rows
}

// ── GET — return merged live + imported data ──────────────────────────────────

export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.view)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') ?? '').toLowerCase().trim()
    const membership = searchParams.get('membership') ?? 'active' // 'active' | 'discharged' | 'all'

    const [users, extras, emailDocs, recycleBilletIds, orbatPositions, leavingHistory, asotMemberRole] = await Promise.all([
        Db.users.find({ isSkeletonAccount: { $ne: true } }).project({
            _id: 1, id: 1, name: 1,
            'guild.nickname': 1, 'guild.displayName': 1,
            globalName: 1, username: 1,
            'guild.roles': 1,
            milpac: 1,
            discharged: 1,
        }).toArray(),
        Db.billetExtras.find({}).toArray(),
        Db.memberEmails.find({}).toArray(),
        Db.mastersheetRecycleBin.find({ originalTab: 'billet' }, { projection: { originalId: 1 } }).toArray(),
        Db.orbatPositions.find({ userId: { $ne: null } }, { projection: { userId: 1 } }).toArray(),
        Db.leavingHistory.find({}, { projection: { discordId: 1, name: 1 } }).toArray(),
        Db.roles.findOne({ name: 'ASOT Member' }, { projection: { id: 1 } }),
    ])

    const billetExcluded = new Set(recycleBilletIds.map(e => e.originalId))
    const orbatUserIds = new Set(orbatPositions.map(p => (p as any).userId as string).filter(Boolean))
    const leavingDiscordIds = new Set(leavingHistory.map(h => (h as any).discordId as string).filter(Boolean))
    const leavingNames = new Set(leavingHistory.map(h => ((h as any).name as string ?? '').toLowerCase()).filter(Boolean))
    const asotMemberRoleId: string | null = (asotMemberRole as any)?.id ?? null

    const extrasById = new Map<string, BilletExtra>()
    const extrasByName = new Map<string, BilletExtra>()
    for (const ex of extras) {
        if (ex.memberId) extrasById.set(ex.memberId, ex)
        extrasByName.set(ex.memberName.toLowerCase(), ex)
    }

    const emailsById = new Map<string, MemberEmail>()
    for (const em of emailDocs) emailsById.set(em.memberId, em)

    const userRows: BilletRow[] = users
        .map(u => {
            const displayName = u.guild?.nickname || u.guild?.displayName || u.name || u.globalName || u.username || u.id
            const userId = String(u._id)
            const m = u.milpac ?? {}
            const bc = (m.billetCounts ?? {}) as Record<string, number>
            const quals: string[] = ((m.qualifications ?? []) as { qualification: string }[]).map(q => q.qualification)
            const awardNames: string[] = ((m.awards ?? []) as { name: string }[]).map(a => a.name)

            const extra = extrasById.get(userId) ?? extrasByName.get(displayName.toLowerCase()) ?? null
            const emailDoc = emailsById.get(userId)
            const emailHistory = emailDoc?.emails ?? []
            const currentEmail = emailHistory.length > 0 ? emailHistory[emailHistory.length - 1].email : null

            // ── Classification signals ────────────────────────────────────────
            const nameLower = displayName.toLowerCase()
            const discordId = (u as any).id as string
            const hasFormalDischarge = !!u.discharged
            // Use Discord snowflake (u.id) for ID match — NOT MongoDB _id (userId)
            const inLeavingByDiscordId = leavingDiscordIds.has(discordId)
            const inLeavingByName = !inLeavingByDiscordId && leavingNames.has(nameLower)
            const inLeavingHistory = inLeavingByDiscordId || inLeavingByName
            const inDischargedSection = !!(extra?.dischargedSection)
            const userRoles: string[] = (u as any).guild?.roles ?? []
            const hasAsotMemberRole = asotMemberRoleId ? userRoles.includes(asotMemberRoleId) : true
            const onOrbat = orbatUserIds.has(userId)
            const hasRank = !!(m.currentRank)

            const isDischargedMember = hasFormalDischarge || inLeavingHistory || inDischargedSection || !hasAsotMemberRole

            const classificationSignals: ClassificationSignals = {
                hasFormalDischarge,
                inLeavingHistory,
                inDischargedSection,
                hasAsotMemberRole,
                onOrbat,
                hasRank,
                finalClassification: isDischargedMember ? 'discharged' : 'active',
            }

            return {
                id: userId,
                username: u.username ?? '',
                name: displayName,
                rank: m.currentRank ?? '',
                enlistedDate: m.enlistedDate ?? '',
                serviceYears: serviceYears(m.enlistedDate),
                promotionPoints: m.promotionPoints ?? 0,
                j4Points: m.j4Points ?? 0,
                disciplineDeductions: m.disciplineDeductions ?? 0,
                billet: extra?.billet ?? null,
                upToDate: extra != null ? extra.upToDate : null,
                lastUpdate: extra?.lastUpdate ?? null,
                hasExtras: extra != null,
                isActive: !isDischargedMember,
                hasEmail: currentEmail != null,
                currentEmail,
                emailHistory,
                primaryNightOps:    bc.primaryNightOps    ?? 0,
                secondaryNightOps:  bc.secondaryNightOps  ?? 0,
                primaryNightFTX:    bc.primaryNightFTX    ?? 0,
                secondaryNightFTX:  bc.secondaryNightFTX  ?? 0,
                platoonTraining:    bc.platoonTraining     ?? 0,
                sectionTraining:    bc.sectionTraining     ?? 0,
                meetings:           bc.meetings            ?? 0,
                campaignMedals:     bc.campaignMedals      ?? 0,
                j1Interviews:       bc.j1Interviews        ?? 0,
                j1InterviewBonus:   bc.j1InterviewBonus    ?? 0,
                j2MissionsRun:      bc.j2MissionsRun       ?? 0,
                j3Bct12:            bc.j3Bct12             ?? 0,
                j3OtherTrainings:   bc.j3OtherTrainings    ?? 0,
                j5ContentCreated:   bc.j5ContentCreated    ?? 0,
                j5MilpacsGenerated: bc.j5MilpacsGenerated  ?? 0,
                j5OfficialPR:       bc.j5OfficialPR        ?? 0,
                certifications: quals,
                awards: awardNames,
                classificationSignals,
            } satisfies BilletRow
        })

    // Stub rows for discharged CSV members with no matching user account
    const dischargedExtraStubs: BilletRow[] = extras
        .filter(ex => ex.dischargedSection && !ex.memberId)
        .map(ex => {
            const exId = String(ex._id)
            const emailDoc = emailsById.get(exId)
            const emailHistory = emailDoc?.emails ?? []
            const currentEmail = emailHistory.length > 0 ? emailHistory[emailHistory.length - 1].email : null
            return {
                id: exId,
                username: '',
                name: ex.memberName,
                rank: '', enlistedDate: '', serviceYears: '—',
                promotionPoints: 0, j4Points: 0, disciplineDeductions: 0,
                billet: ex.billet ?? null,
                upToDate: ex.upToDate,
                lastUpdate: ex.lastUpdate ?? null,
                hasExtras: true,
                isActive: false,
                hasEmail: currentEmail != null,
                currentEmail, emailHistory,
                primaryNightOps: 0, secondaryNightOps: 0,
                primaryNightFTX: 0, secondaryNightFTX: 0,
                platoonTraining: 0, sectionTraining: 0,
                meetings: 0, campaignMedals: 0,
                j1Interviews: 0, j1InterviewBonus: 0,
                j2MissionsRun: 0, j3Bct12: 0, j3OtherTrainings: 0,
                j5ContentCreated: 0, j5MilpacsGenerated: 0, j5OfficialPR: 0,
                certifications: [], awards: [],
                classificationSignals: {
                    hasFormalDischarge: false,
                    inLeavingHistory: false,
                    inDischargedSection: true,
                    hasAsotMemberRole: false,
                    onOrbat: false,
                    hasRank: false,
                    finalClassification: 'discharged',
                },
            } satisfies BilletRow
        })

    const rows = [...userRows, ...dischargedExtraStubs]
        .filter(r => !billetExcluded.has(r.id))
        .filter(r => {
            const cls = r.classificationSignals?.finalClassification ?? 'active'
            if (membership === 'active') return cls === 'active'
            if (membership === 'discharged') return cls === 'discharged'
            return true
        })
        .filter(r => !search || r.name.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))

    const extrasImported = extras.length > 0
    const unmatchedExtras = extras.filter(ex => !ex.memberId).length

    return NextResponse.json({
        rows,
        total: rows.length,
        extrasImported,
        unmatchedExtras,
        fieldSources: FIELD_SOURCE_MAP,
    })
}

// ── Name normalisation (mirrors email import logic) ───────────────────────────

const RANK_PREFIXES_BILLET = new Set([
    'pvt','pfc','cpl','spc','sgt','ssgt','ssg','sfc','msg','1sg','sgm','csm','sma',
    'wo1','wo2','cw2','cw3','cw4','cw5',
    '2lt','1lt','lt','cpt','maj','ltc','col','ltcol','lt-col','bg','mg','ltg','gen',
    'rct','rec','pte','lcpl','cpl2','mcpl',
])

function normalizeBilletName(raw: string): string {
    if (!raw) return ''
    let s = raw.replace(/\s*[\[(][^\])']*[\])']/g, '').trim()
    const words = s.split(/\s+/)
    while (words.length > 1) {
        const w = words[0].toLowerCase().replace(/[^a-z0-9-]/g, '')
        if (RANK_PREFIXES_BILLET.has(w)) words.shift()
        else break
    }
    return words.join(' ').toLowerCase().trim()
}

// ── POST — import billet extras from CSV ─────────────────────────────────────

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let csvText: string
    try {
        const fd = await req.formData()
        const file = fd.get('file') as File | null
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        csvText = await file.arrayBuffer().then(b => Buffer.from(b).toString('utf-8'))
    } catch {
        return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
    }

    const rows = parseCSVRow(csvText)

    let dataStart = 0
    for (let i = 0; i < rows.length; i++) {
        const col0 = rows[i][0]?.trim() ?? ''
        if (col0 && !/^[\d,]/.test(col0) && col0 !== 'Name') {
            dataStart = i
            break
        }
    }

    const headerRows = rows.slice(0, dataStart)
    const flatHeaders: string[] = Array(500).fill('')
    for (const hr of headerRows) {
        for (let c = 0; c < hr.length; c++) {
            const v = hr[c]?.trim().replace(/\s+/g, ' ')
            if (v) flatHeaders[c] = v
        }
    }
    const lastUpdateCol = flatHeaders.findIndex(h => h.toLowerCase().includes('last update'))

    const COL_NAME       = 0
    const COL_UP_TO_DATE = 4
    const COL_BILLET     = 5

    const allUsers = await Db.users.find(
        { isSkeletonAccount: { $ne: true } },
        { projection: { _id: 1, name: 1, 'guild.nickname': 1, 'guild.displayName': 1, globalName: 1, username: 1 } }
    ).toArray()

    const nameToId = new Map<string, string>()
    for (const u of allUsers) {
        const rawNames = [u.guild?.nickname, u.guild?.displayName, u.name, u.globalName, u.username].filter(Boolean) as string[]
        for (const raw of rawNames) {
            const norm = normalizeBilletName(raw)
            if (norm && !nameToId.has(norm)) nameToId.set(norm, String(u._id))
            const lower = raw.toLowerCase()
            if (lower && !nameToId.has(lower)) nameToId.set(lower, String(u._id))
        }
    }

    const now = new Date()
    let matched = 0
    let unmatched = 0
    let importedActive = 0
    let importedDischarged = 0

    const unmatchedNames: string[] = []
    const docs: BilletExtra[] = []
    let inDischargedSection = false

    for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i]
        const col0 = row[0]?.trim() ?? ''

        // Detect section header (e.g. "Discharged", "Discharged Members")
        const nonEmpty = row.filter(c => c.trim()).length
        if (col0 && col0.toLowerCase().includes('discharg') && nonEmpty <= 3) {
            inDischargedSection = true
            continue
        }

        const memberName = col0
        if (!memberName) continue

        const billet    = row[COL_BILLET]?.trim() ?? ''
        const upToDate  = (row[COL_UP_TO_DATE]?.trim() ?? '').toLowerCase() === 'up to date'
        const lastUpd   = (lastUpdateCol >= 0 ? row[lastUpdateCol]?.trim() : '') ?? ''

        const memberId = nameToId.get(normalizeBilletName(memberName)) ?? nameToId.get(memberName.toLowerCase()) ?? undefined
        if (memberId) { matched++ } else { unmatched++; unmatchedNames.push(memberName) }

        if (inDischargedSection) importedDischarged++; else importedActive++

        docs.push({
            _id: new ObjectId() as BilletExtra['_id'],
            memberName,
            memberId,
            billet,
            upToDate,
            lastUpdate: lastUpd,
            importedAt: now,
            dischargedSection: inDischargedSection,
        })
    }

    await Db.billetExtras.deleteMany({})
    if (docs.length > 0) await Db.billetExtras.insertMany(docs as any)

    return NextResponse.json({
        ok: true,
        imported: docs.length,
        matched,
        unmatched,
        importedActive,
        importedDischarged,
        unmatchedNames,
    })
}
