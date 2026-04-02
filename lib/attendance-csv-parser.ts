import { parseRow } from './orbat-csv-parser'

export interface ParsedAttendanceOperation {
    name: string
    satDate: string  // e.g. '21/02/2026'
    sunDate: string  // e.g. '22/02/2026'
}

export interface ParsedAttendanceMember {
    rank: string
    name: string
    totalNightAttend: number
    attendance: {
        opIndex: number  // index into the section's operations array
        sat: string      // 'ATTENDED' | 'NOT ATTENDING' | 'RESOLVED' | 'LOA' | 'Added To Unit' | ''
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
const PLACEHOLDER_OP_NAME = 'OPERATION XXX'
// Operations at columns 7, 10, 13, … (3-column stride: Sat, Sun, spacer)
const OP_START_COL = 7
const OP_STRIDE = 3

function isRealOperation(name: string, satDate: string, sunDate: string): boolean {
    if (!name || name === PLACEHOLDER_OP_NAME) return false
    // Both dates are epoch-zero → no real date assigned yet
    if (satDate === EPOCH_ZERO_DATE && sunDate === EPOCH_ZERO_DATE) return false
    if (satDate === '0' && sunDate === '0') return false
    return true
}

/** Detect if a row is a section header (col 0 looks like "1-0", "1-1 Alpha", "2PL", etc.) */
function isSectionHeader(col0: string): boolean {
    return /^\d+-\d+/.test(col0) || /^\dPL$/.test(col0)
}

/**
 * Parse the Attendance Tracker CSV exported from the spreadsheet.
 *
 * CSV structure (repeats per section):
 *   Row A: [unit name] ... [op names at cols 7, 10, 13, …]
 *   Row B: [empty]    ... [sat date, sun date pairs at cols 7/8, 10/11, …]
 *   Row C: Rank, Name, Total Night Attend, … (column header row — skipped)
 *   Rows D+: member data rows
 *   [blank row — section separator]
 */
export function parseAttendanceCSV(csv: string): ParsedAttendanceSection[] {
    const rows = csv.split(/\r?\n/).map(parseRow)
    const sections: ParsedAttendanceSection[] = []

    let i = 0
    while (i < rows.length) {
        const row = rows[i]
        const col0 = (row[0] ?? '').trim()

        if (!isSectionHeader(col0)) {
            i++
            continue
        }

        const unit = col0

        // --- Extract operation names from this row (cols 7, 10, 13, …) ---
        const rawOpNames: string[] = []
        for (let c = OP_START_COL; c < row.length; c += OP_STRIDE) {
            rawOpNames.push((row[c] ?? '').trim())
        }

        // --- Next row: dates (sat at c, sun at c+1) ---
        i++
        if (i >= rows.length) break
        const dateRow = rows[i]
        const rawSatDates: string[] = []
        const rawSunDates: string[] = []
        for (let c = OP_START_COL; c < dateRow.length; c += OP_STRIDE) {
            rawSatDates.push((dateRow[c] ?? '').trim())
            rawSunDates.push((dateRow[c + 1] ?? '').trim())
        }

        // --- Skip column header row (Rank, Name, …) ---
        i++

        // --- Build real operations list, track which raw indices are valid ---
        const operations: ParsedAttendanceOperation[] = []
        // opIndexMap[rawIndex] = index in operations[] or -1 if placeholder
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

        // --- Read member rows until blank row ---
        const members: ParsedAttendanceMember[] = []
        i++
        while (i < rows.length) {
            const memberRow = rows[i]
            const rank = (memberRow[0] ?? '').trim()
            const name = (memberRow[1] ?? '').trim()

            // Blank row = end of section
            if (!rank && !name) break
            // Skip if this looks like another section header
            if (isSectionHeader(rank)) break

            if (rank && name) {
                const totalNightAttend = parseInt((memberRow[2] ?? '0').trim(), 10) || 0
                const attendance: ParsedAttendanceMember['attendance'] = []

                for (let o = 0; o < rawOpNames.length; o++) {
                    if (opIndexMap[o] === -1) continue
                    const baseCol = OP_START_COL + o * OP_STRIDE
                    const sat = (memberRow[baseCol] ?? '').trim()
                    const sun = (memberRow[baseCol + 1] ?? '').trim()
                    // Only record if there's any status value
                    if (sat || sun) {
                        attendance.push({ opIndex: opIndexMap[o], sat, sun })
                    }
                }

                members.push({ rank, name, totalNightAttend, attendance })
            }

            i++
        }

        sections.push({ unit, operations, members })
    }

    return sections
}

/** Collect all unique operation name+date combos across all sections (for matching to DB) */
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
