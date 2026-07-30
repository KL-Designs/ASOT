const DEFAULT_SHEET_ID = '1bnSvLBDTVCNY37Tb0cFTD3G2S7TIGgbtkioXyKsBcTE'
const DEFAULT_GID      = '1849720519'

export type ParsedImportRecord = {
    date: Date
    trainees: string[]
    staff: string[]
    trainingRun: string
    notes: string
    ticketRef: string
    sourceRowRange: string   // "2-4" (1-indexed, header is row 1)
}

function parseCSV(text: string): string[][] {
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
                cells.push(cur); cur = ''
            } else {
                cur += ch
            }
        }
        cells.push(cur)
        rows.push(cells)
    }
    return rows
}

function parseDDMMYYYY(s: string): Date | null {
    const trimmed = s.trim()
    if (!trimmed) return null
    // dd/mm/yyyy
    const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
        const d = parseInt(m[1], 10)
        const mo = parseInt(m[2], 10) - 1
        const y = parseInt(m[3], 10)
        const dt = new Date(Date.UTC(y, mo, d))
        return isNaN(dt.getTime()) ? null : dt
    }
    return null
}

function splitNames(s: string): string[] {
    return s.split(/[;,]/).map(n => n.trim()).filter(Boolean)
}

export async function fetchAndParseSheet(sheetId = DEFAULT_SHEET_ID, gid = DEFAULT_GID): Promise<ParsedImportRecord[]> {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to fetch sheet: HTTP ${res.status}`)
    const text = await res.text()

    const rows = parseCSV(text)
    if (rows.length < 2) return []

    // Row 0 is the header — skip it
    const dataRows = rows.slice(1)

    const records: ParsedImportRecord[] = []
    let current: ParsedImportRecord | null = null
    let currentStartRow = 0  // 1-indexed data row (so actual sheet row = dataRow + 2)

    dataRows.forEach((cells, idx) => {
        const sheetRow = idx + 2  // header is row 1, data starts at row 2
        const [dateStr = '', traineesStr = '', staffStr = '', trainingRun = '', notes = '', ticketRef = ''] = cells

        const date = parseDDMMYYYY(dateStr)

        if (date) {
            // New record starts
            if (current) records.push(current)
            currentStartRow = sheetRow
            current = {
                date,
                trainees: splitNames(traineesStr),
                staff: splitNames(staffStr),
                trainingRun: trainingRun.trim(),
                notes: notes.trim(),
                ticketRef: ticketRef.trim(),
                sourceRowRange: `${sheetRow}`,
            }
        } else if (current) {
            // Continuation row — append to current record
            splitNames(traineesStr).forEach(n => { if (!current!.trainees.includes(n)) current!.trainees.push(n) })
            splitNames(staffStr).forEach(n => { if (!current!.staff.includes(n)) current!.staff.push(n) })
            if (trainingRun.trim() && !current.trainingRun) current.trainingRun = trainingRun.trim()
            if (notes.trim()) current.notes = current.notes ? `${current.notes}\n${notes.trim()}` : notes.trim()
            if (ticketRef.trim() && !current.ticketRef) current.ticketRef = ticketRef.trim()
            // Update row range to cover this continuation row
            current.sourceRowRange = `${currentStartRow}-${sheetRow}`
        }
        // else: blank row before any dated row — ignore
    })

    if (current) records.push(current)

    return records
}

export { DEFAULT_SHEET_ID }
