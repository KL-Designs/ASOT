// Shared CSV parsing utilities for the training history import system.
// Used by both the analyze endpoint and the import endpoint.

export const CANONICAL_MAP: [RegExp, string][] = [
    // BCT quiz (must precede BCT 1/2 rules)
    [/^bct\s*1?\s*quiz\s*\d*$/i,                                               'BCT 1 Quiz'],

    // Basic Medical
    [/^(basic\s+)?medical(\s+(training|course|cert(ification)?|session))?$/i,   'Basic Medical'],
    [/^bm$/i,                                                                   'Basic Medical'],

    // Advanced Medical Pre-Course (before Advanced Medical)
    [/^adv(anced)?\s*\.?\s*med(ical)?\s+(pre[-\s]?course|precourse)$/i,        'Advanced Medical Pre-Course'],
    [/^advanced\s+medical\s+pre[-\s]?course$/i,                                'Advanced Medical Pre-Course'],

    // Advanced Medical
    [/^adv(anced)?\s*\.?\s*med(ical)?$/i,                                      'Advanced Medical'],
    [/^adv\s+med$/i,                                                            'Advanced Medical'],
    [/^advm$/i,                                                                 'Advanced Medical'],
    [/^am$/i,                                                                   'Advanced Medical'],

    // Forward Observer
    [/^fo(\s[\w\s\/]*)?$/i,                                                    'Forward Observer'],
    [/^forward\s+observer$/i,                                                   'Forward Observer'],
    [/^hotel\s+(specific\s+)?fo(\s.*)?$/i,                                     'Forward Observer'],

    // Basic CQB
    [/^(basic\s+)?cqb(\s+(basic|course|training))?$/i,                         'Basic CQB'],
    [/^bcqb$/i,                                                                 'Basic CQB'],

    // Basic DFSW
    [/^(basic\s+)?dfsw(\s+(basic|training|course))?$/i,                        'Basic DFSW'],

    // Basic IDF
    [/^(basic\s+)?idf(\s+(basic|training|course))?$/i,                         'Basic IDF'],
    [/^bidf$/i,                                                                 'Basic IDF'],

    // NCO
    [/^nco\s+(training(\/review)?|training)$/i,                                'NCO'],
    [/^nco$/i,                                                                  'NCO'],
    [/^nco\s+assessment$/i,                                                     'NCO Assessment'],
    [/^nco\s*a$/i,                                                              'NCO Assessment'],
    [/^nco\s+shadow$/i,                                                         'NCO Shadow'],

    // RTO
    [/^rto(\s+(session|course|practical))?$/i,                                 'RTO'],

    // Section Weapons
    [/^section\s+weapons(\s+course)?$/i,                                        'Section Weapons'],

    // Rotary CAS & Recon (before basic rotary rules)
    [/^(basic\s+)?(rotary\s+|cas\s+)?(cas\s+and\s+recon|cas\s*&\s*recon|recon\s+and\s+cas)$/i, 'Rotary CAS & Recon'],
    [/^basic\s+(rotary\s+)?cas\s+and\s+recon$/i,                              'Rotary CAS & Recon'],

    // Basic Rotary Assessment
    [/^(basic\s+)?rotary(\s+wing)?\s+(assessment|a)$/i,                        'Basic Rotary Assessment'],
    [/^br\s+a$/i,                                                               'Basic Rotary Assessment'],

    // Basic Rotary
    [/^(basic\s+)?rotary(\s+wing)?(\s+course)?$/i,                             'Basic Rotary'],
    [/^brc$/i,                                                                  'Basic Rotary'],
    [/^br$/i,                                                                   'Basic Rotary'],

    // Advanced Rotary
    [/^adv(anced)?\s+rotary(\s+course)?$/i,                                    'Advanced Rotary'],
    [/^ar$/i,                                                                   'Advanced Rotary'],

    // Static Line Paratrooper — "Paratrooper N", "Static Line Paratrooper N", "SLP"
    [/^static\s+line\s+para(trooper)?(\s+\d+)?(\s+course)?$/i,                'Static Line Paratrooper'],
    [/^paratrooper(\s+\d+)?$/i,                                                'Static Line Paratrooper'],
    [/^slp$/i,                                                                  'Static Line Paratrooper'],

    // AVC Driver Basic (before generic Driver rule)
    [/^armou?red\s+(vehicle\s+)?crewman\b.*(driver\s+basic|basic\s+driver|part\s*1|basics?)$/i, 'AVC Driver Basic'],
    [/^armou?red\s+crewman.*\(?(basic\s+driver|driver\s+basic)\)?$/i,          'AVC Driver Basic'],
    [/^(drivers?\s+basic|driver\s+(part\s*1|basics?|basic\s+course))$/i,       'AVC Driver Basic'],

    // AVC Driver Tactics
    [/^armou?red\s+(vehicle\s+)?crewman\b.*(formation|tactic|part\s*2).*$/i,  'AVC Driver Tactics'],
    [/^driver\s+(part\s*2|formations?\s+(and\s+)?tactics?)$/i,                 'AVC Driver Tactics'],

    // AVC Driver (generic)
    [/^driver$/i,                                                               'AVC Driver Basic'],

    // Hotel Assessment
    [/^hotel\s+assessment$/i,                                                   'Hotel Assessment'],

    // Proficiency — MG
    [/^(machinegunner|mg)\s+proficiency$/i,                                    'MG Proficiency'],
    [/^bmg$/i,                                                                  'MG Proficiency'],

    // Proficiency — Rifleman
    [/^(rifleman|rifle)\s+proficiency$/i,                                       'Rifleman Proficiency'],
    [/^brifle$/i,                                                               'Rifleman Proficiency'],

    // Proficiency — AT (bare "AT", "Anti-Tank", "AT Proficiency")
    [/^at$/i,                                                                   'AT Proficiency'],
    [/^anti.?tank$/i,                                                           'AT Proficiency'],
    [/^(anti.?tank|at)\s+proficiency$/i,                                        'AT Proficiency'],
    [/^bat$/i,                                                                  'AT Proficiency'],

    // Proficiency — Pistol
    [/^(pistol|pp)\s+proficiency$/i,                                            'Pistol Proficiency'],
    [/^bpistol$/i,                                                              'Pistol Proficiency'],

    // Proficiency — GLA
    [/^(gla|grenade\s+launcher)\s+proficiency$/i,                              'GLA Proficiency'],
    [/^bgla$/i,                                                                 'GLA Proficiency'],

    // Physical / Platoon training
    [/^physical\s+training$/i,                                                  'Physical Training'],
    [/^pt$/i,                                                                   'Physical Training'],
    [/^[\w\-]+\s+platoon\s+training$/i,                                        'Platoon Training'],
    [/^platoon\s+training$/i,                                                   'Platoon Training'],

    // Reenlistment
    [/^re$/i,                                                                   'Reenlistment'],
]

export const TYPE_ACRONYMS: Record<string, string> = {
    'BCT':                        'BCT',
    'BCT 1':                      'BCT1',
    'BCT 2':                      'BCT2',
    'BCT 1 Quiz':                 'BCT1Q',
    'Basic Medical':              'MED',
    'Advanced Medical Pre-Course':'AMEDP',
    'Advanced Medical':           'AMED',
    'Forward Observer':           'FO',
    'Basic CQB':                  'CQB',
    'Basic DFSW':                 'DFSW',
    'Basic IDF':                  'IDF',
    'NCO':                        'NCO',
    'NCO Assessment':             'NCOA',
    'NCO Shadow':                 'NCOS',
    'Basic Rotary':               'BRC',
    'Basic Rotary Assessment':    'BRA',
    'Advanced Rotary':            'ARC',
    'Rotary CAS & Recon':         'BRCA',
    'Static Line Paratrooper':    'SLP',
    'RTO':                        'RTO',
    'Section Weapons':            'SWC',
    'VCP':                        'VCP',
    'Hotel Assessment':           'HOTA',
    'AVC Driver Basic':           'AVCD',
    'AVC Driver Tactics':         'AVCT',
    'MG Proficiency':             'MG',
    'Rifleman Proficiency':       'RP',
    'AT Proficiency':             'AT',
    'Pistol Proficiency':         'PP',
    'GLA Proficiency':            'GLA',
    'Physical Training':          'PT',
    'Platoon Training':           'PLT',
    'Reenlistment':               'RE',
    'Unknown Training':           'MISC',
}

export function getTypeAcronym(name: string): string {
    const mapped = TYPE_ACRONYMS[name]
    if (mapped) return mapped
    const words = name.trim().split(/\s+/)
    const auto = words.length === 1
        ? name.slice(0, 4).toUpperCase()
        : words.map(w => w[0]).join('').slice(0, 4).toUpperCase()
    return auto || 'MISC'
}

export function normalizeTrainingType(raw: string): string {
    let name = raw.trim()
    name = name.replace(/^BCT(\d)\b/, 'BCT $1')
    // Strip trailing 2+ digit sequence numbers: "BCT 1 033" → "BCT 1"
    name = name.replace(/\s+\d{2,}\s*$/, '').trim()
    name = name.replace(/\s+/g, ' ')
    for (const [pattern, canonical] of CANONICAL_MAP) {
        if (pattern.test(name)) return canonical
    }
    return name || 'Unknown Training'
}

export function parseDate(raw: string): Date | null {
    if (!raw?.trim()) return null
    const cleaned = raw.trim()
    const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (dmyMatch) {
        const [, d, m, y] = dmyMatch
        const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y)
        if (year < 1900 || year > 2100) return null
        const dt = new Date(Date.UTC(year, parseInt(m) - 1, parseInt(d)))
        return isNaN(dt.getTime()) ? null : dt
    }
    const dt = new Date(cleaned)
    return isNaN(dt.getTime()) ? null : dt
}

export function parseCsvLine(line: string): string[] {
    const cols: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
            else inQuote = !inQuote
        } else if (ch === ',' && !inQuote) {
            cols.push(cur.trim())
            cur = ''
        } else {
            cur += ch
        }
    }
    cols.push(cur.trim())
    return cols
}

export interface ParsedSession {
    date: Date
    trainees: string[]
    staff: string[]
    trainingTypeName: string  // after normalizeTrainingType + CANONICAL_MAP
    rawType: string           // original CSV text (before any normalization)
    notes: string
    ticketRef: string
    rowStart: number
}

export interface ParseSkippedRow {
    rowNum: number
    rawDate: string
    rawType: string
    rawTrainee: string
    reason: string
}

export function parseCsvToSessions(csv: string): {
    sessions: ParsedSession[]
    skippedRows: ParseSkippedRow[]
    totalDataRows: number
} {
    const lines = csv.split(/\r?\n/).filter(Boolean)
    if (lines.length < 2) return { sessions: [], skippedRows: [], totalDataRows: 0 }

    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim())
    const colIdx = {
        date:        header.findIndex(h => h === 'date'),
        trainees:    header.findIndex(h => h.includes('trainee')),
        staff:       header.findIndex(h => h.includes('staff') || h.includes('trainer')),
        trainingRun: header.findIndex(h => h.includes('training run') || h.includes('training type') || h.includes('course')),
        notes:       header.findIndex(h => h === 'notes' || h === 'note'),
        ticketNum:   header.findIndex(h => h.includes('ticket')),
    }

    const sessions: ParsedSession[] = []
    const skippedRows: ParseSkippedRow[] = []
    let current: ParsedSession | null = null
    let totalDataRows = 0

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i])
        if (cols.every(c => !c)) continue
        totalDataRows++

        const dateRaw     = colIdx.date        >= 0 ? (cols[colIdx.date]        ?? '').trim() : ''
        const traineeRaw  = colIdx.trainees    >= 0 ? (cols[colIdx.trainees]    ?? '').trim() : ''
        const staffRaw    = colIdx.staff       >= 0 ? (cols[colIdx.staff]       ?? '').trim() : ''
        const trainingRaw = colIdx.trainingRun >= 0 ? (cols[colIdx.trainingRun] ?? '').trim() : ''
        const notesRaw    = colIdx.notes       >= 0 ? (cols[colIdx.notes]       ?? '').trim() : ''
        const ticketNum   = colIdx.ticketNum   >= 0 ? (cols[colIdx.ticketNum]   ?? '').trim() : ''

        const date = parseDate(dateRaw)

        if (date) {
            if (current) sessions.push(current)
            current = {
                date,
                trainees:         traineeRaw ? [traineeRaw] : [],
                staff:            staffRaw   ? [staffRaw]   : [],
                trainingTypeName: normalizeTrainingType(trainingRaw || 'Unknown Training'),
                rawType:          trainingRaw,
                notes:            notesRaw,
                ticketRef:        ticketNum,
                rowStart:         i + 1,
            }
        } else if (current) {
            // Continuation row: append trainees/staff to previous dated session
            if (traineeRaw) current.trainees.push(traineeRaw)
            if (staffRaw)   current.staff.push(staffRaw)
            if (notesRaw)   current.notes = current.notes ? `${current.notes} ${notesRaw}` : notesRaw
        } else if (traineeRaw || trainingRaw) {
            // Orphan continuation row — no preceding dated session
            skippedRows.push({
                rowNum:     i + 1,
                rawDate:    dateRaw,
                rawType:    trainingRaw,
                rawTrainee: traineeRaw,
                reason:     'No preceding dated session (orphan continuation row)',
            })
        }
    }
    if (current) sessions.push(current)

    return { sessions, skippedRows, totalDataRows }
}
