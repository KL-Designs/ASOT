export interface OrbatMember { role: string; name: string }
export interface OrbatSection { title: string; members: OrbatMember[] }
export interface OrbatData {
    companyHQ: { senior: OrbatMember; subTitle: string; members: OrbatMember[] }
    platoon11: OrbatSection[]
    platoon12: OrbatSection[]
    support:   OrbatSection[]
    activeReservists:   string[]
    inactiveReservists: string[]
    gamemasters: OrbatMember[]
}

export function parseRow(line: string): string[] {
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

export function parseORBAT(csv: string): OrbatData {
    const rows = csv.split(/\r?\n/).map(parseRow)
    const c = (row: string[], i: number) => (row[i] ?? '').trim()

    const data: OrbatData = {
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
