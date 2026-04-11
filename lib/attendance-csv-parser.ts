import { parseRow } from './orbat-csv-parser'

export interface ParsedAttendanceOperation {
    name: string
    satDate: string  // normalised to DD/MM/YYYY
    sunDate: string
}

export interface ParsedAttendanceMember {
    rank: string
    name: string
    totalNightAttend: number
    attendance: {
        opIndex: number  // index into the section's operations array
        sat: string      // 'ATTENDED' | 'NOT ATTENDING' | 'RESOLVED' | 'LOA' | ''
        sun: string
    }[]
}

export interface ParsedAttendanceSection {
    unit: string  // e.g. '1-0', '1-1 Alpha'
    operations: ParsedAttendanceOperation[]
    members: ParsedAttendanceMember[]
}

// Excel epoch-zero date that appears when a date cell is empty/zero
const EPOCH_ZERO_DATE = '30/12/1899'
const OP_STRIDE = 3  // Sat, Sun, spacer — consistent across all known formats

/** Detect if col0 looks like a section name ("1-0", "1-1 Alpha", "2PL", "Game Masters", "Reservists", etc.) */
function isSectionHeader(col0: string): boolean {
    return /^\d+-\d+/.test(col0)
        || /^\dPL$/.test(col0)
        || /^(game\s*masters?|zeus|reservists?|inactive\s+reservists?|company\s+reservists?)$/i.test(col0)
}

/** Normalise dates to DD/MM/YYYY — handles 2-digit years and single-digit day/month */
function normaliseDate(d: string): string {
    if (!d) return d
    // dd/mm/yy → dd/mm/20yy
    const twoDigitYear = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
    if (twoDigitYear) {
        const [, day, month, year] = twoDigitYear
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/20${year}`
    }
    return d
}

function isRealOperation(name: string, satDate: string, sunDate: string): boolean {
    if (!name) return false
    // Future placeholder ops
    if (/^operation\s+xxx$/i.test(name.trim())) return false
    // Both dates are Excel epoch-zero (empty cells exported as this value)
    if (satDate === EPOCH_ZERO_DATE && sunDate === EPOCH_ZERO_DATE) return false
    if (satDate === '0' && sunDate === '0') return false
    return true
}

interface CsvFormat {
    /** Column index of the first Saturday column */
    opStartCol: number
    /** True for 2026/2025: section name is on the ops row (same row as operation names).
     *  False for 2024: section name is on the dates row (row after ops row). */
    sectionInOpsRow: boolean
}

/**
 * Detect CSV format by finding the first "Rank" header row and inspecting
 * surrounding rows.
 *
 * Known formats:
 *   2026 — opStartCol=7,  sectionInOpsRow=true
 *   2025 — opStartCol=10, sectionInOpsRow=true
 *   2024 — opStartCol=10, sectionInOpsRow=false  (section name on dates row)
 */
function detectFormat(rows: string[][]): CsvFormat {
    for (let i = 2; i < rows.length; i++) {
        if ((rows[i][0] ?? '').trim() !== 'Rank') continue

        // Find the first "Saturday" column in this header row
        const satIdx = rows[i].findIndex(c => c.trim().toLowerCase() === 'saturday')
        const opStartCol = satIdx !== -1 ? satIdx : 7

        // Two rows before header = the ops row (section+ops in 2026/2025)
        //                        = the plain ops row in 2024
        // One row before header  = the dates row (with section name in 2024)
        const rowBeforeHeader = rows[i - 1]  // dates row
        const twoBeforeHeader = rows[i - 2]  // ops row

        // If the dates row has a section name → 2024 style (sectionInOpsRow=false)
        // If the ops row has a section name   → 2025/2026 style (sectionInOpsRow=true)
        const sectionInOpsRow = isSectionHeader((twoBeforeHeader?.[0] ?? '').trim())
            || !isSectionHeader((rowBeforeHeader?.[0] ?? '').trim())

        // Simpler decision: if row i-2 (ops row) has a section name, it's 2025/2026
        const opsRowCol0 = (twoBeforeHeader?.[0] ?? '').trim()
        return {
            opStartCol,
            sectionInOpsRow: isSectionHeader(opsRowCol0),
        }
    }
    // Fallback to 2026 format
    return { opStartCol: 7, sectionInOpsRow: true }
}

/**
 * Parse an Attendance Tracker CSV exported from the spreadsheet.
 * Handles 2024, 2025, and 2026 format variants automatically.
 *
 * 2026/2025 section structure (repeats per section):
 *   Row A: [unit name], ..., [op names at cols 7 or 10, stride 3]
 *   Row B: empty col0,  ..., [sat date, sun date, spacer, ...]
 *   Row C: Rank, Name, ... (column headers — skipped)
 *   Rows D+: member data rows
 *   [blank row — section separator]
 *
 * 2024 section structure:
 *   Row A: empty col0,  ..., [op names at col 10, stride 3]
 *   Row B: [unit name], ..., [sat date, sun date, spacer, ...]  ← section header on dates row
 *   Row C: Rank, Name, ...
 *   Rows D+: member data rows (spacer col may contain per-op point counts — ignored)
 *   [blank row]
 */
export function parseAttendanceCSV(csv: string): ParsedAttendanceSection[] {
    const rows = csv.split(/\r?\n/).map(parseRow)
    const fmt = detectFormat(rows)
    const { opStartCol, sectionInOpsRow } = fmt

    const sections: ParsedAttendanceSection[] = []
    let i = 0

    while (i < rows.length) {
        const row = rows[i]
        const col0 = (row[0] ?? '').trim()

        if (!isSectionHeader(col0)) {
            i++
            continue
        }

        let unit: string
        let opsRow: string[]
        let dateRow: string[]

        if (sectionInOpsRow) {
            // 2026 / 2025: current row = ops + section name, next = dates
            unit = col0
            opsRow = row
            i++
            if (i >= rows.length) break
            dateRow = rows[i]
            i++ // advance to header row
        } else {
            // 2024: current row = dates + section name, previous = ops
            unit = col0
            dateRow = row
            opsRow = i > 0 ? rows[i - 1] : []
            i++ // advance to header row
        }
        // i now points to the Rank/Name header row — skip it
        i++ // advance to first member row

        // --- Extract operation names ---
        const rawOpNames: string[] = []
        for (let c = opStartCol; c < opsRow.length; c += OP_STRIDE) {
            rawOpNames.push((opsRow[c] ?? '').trim())
        }

        // --- Extract dates (normalised) ---
        const rawSatDates: string[] = []
        const rawSunDates: string[] = []
        for (let c = opStartCol; c < dateRow.length; c += OP_STRIDE) {
            rawSatDates.push(normaliseDate((dateRow[c] ?? '').trim()))
            rawSunDates.push(normaliseDate((dateRow[c + 1] ?? '').trim()))
        }

        // --- Build real operations list ---
        const operations: ParsedAttendanceOperation[] = []
        const opIndexMap: number[] = rawOpNames.map((name, o) => {
            const sat = rawSatDates[o] ?? ''
            const sun = rawSunDates[o] ?? ''
            if (isRealOperation(name, sat, sun)) {
                const idx = operations.length
                operations.push({ name, satDate: sat, sunDate: sun })
                return idx
            }
            return -1
        })

        // --- Read member rows until blank row or next section ---
        const members: ParsedAttendanceMember[] = []

        while (i < rows.length) {
            const memberRow = rows[i]
            const rank = (memberRow[0] ?? '').trim()
            const name = (memberRow[1] ?? '').trim()

            if (!rank && !name) break
            if (isSectionHeader(rank)) break

            if (rank && name) {
                const totalNightAttend = parseInt((memberRow[2] ?? '0').trim(), 10) || 0
                const attendance: ParsedAttendanceMember['attendance'] = []

                for (let o = 0; o < rawOpNames.length; o++) {
                    if (opIndexMap[o] === -1) continue
                    const baseCol = opStartCol + o * OP_STRIDE
                    const sat = (memberRow[baseCol] ?? '').trim().toUpperCase()
                    const sun = (memberRow[baseCol + 1] ?? '').trim().toUpperCase()
                    // Skip pure placeholder values
                    if (sat || sun) {
                        attendance.push({ opIndex: opIndexMap[o], sat, sun })
                    }
                }

                members.push({ rank, name, totalNightAttend, attendance })
            }

            i++
        }

        if (members.length > 0 || operations.length > 0) {
            sections.push({ unit, operations, members })
        }
    }

    return sections
}

/** Collect all unique operation name+date combos across sections (for DB matching) */
export function collectOperations(sections: ParsedAttendanceSection[]): ParsedAttendanceOperation[] {
    const seen = new Map<string, ParsedAttendanceOperation>()
    for (const section of sections) {
        for (const op of section.operations) {
            const key = `${op.name}|${op.satDate}`
            if (!seen.has(key)) seen.set(key, op)
        }
    }
    return Array.from(seen.values())
}
