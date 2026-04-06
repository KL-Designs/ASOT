import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import fs from 'fs'
import path from 'path'
import { globSync } from 'glob'
import type { UniformData, Citation, Rank } from './types'

// loadImage doesn't support Windows drive-letter paths (e.g. f:\...) — read as buffer first
function loadFile(filePath: string) {
    return loadImage(fs.readFileSync(filePath))
}

const ASSETS = path.join(process.cwd(), 'public', 'milpac-assets')
const OUTPUT = path.join(process.cwd(), 'milpacs')

// Register Times New Roman from Windows system fonts (falls back gracefully if missing)
const fontPath = 'C:\\Windows\\Fonts\\times.ttf'
if (fs.existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, 'Times New Roman')
}

type MedalJson = { [line: string]: Citation[] }
const medalJSON: MedalJson = JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'medals.json'), 'utf-8')
)

// ── Sanitize uniform data (ported from milpac-gen data-processor.ts) ─────────
function sanitize(data: UniformData): UniformData {
    const d = { ...data, citations: [...data.citations], TrainingMedals: [...data.TrainingMedals], medallions: [...data.medallions] }

    // Campaign clasp deduplication: only keep the highest clasp
    const clasps = d.citations
        .filter(c => c.startsWith('campaign'))
        .map(c => parseInt(c.replace('campaign', '')) || 0)

    if (clasps.length > 1) {
        const max = Math.max(...clasps)
        d.citations = d.citations.filter(c => !c.startsWith('campaign'))
        d.citations.push((`campaign${max || ''}`) as Citation)
    }

    // Training badge hierarchy: Expert replaces Advanced and Basic
    for (const badge of [...d.TrainingMedals]) {
        if (badge.startsWith('Exp')) {
            const adv   = badge.replace('Exp', 'Adv')
            const basic = badge.replace('Exp', 'B')
            d.TrainingMedals = d.TrainingMedals.filter(b => b !== adv && b !== basic)
        } else if (badge.startsWith('Adv')) {
            const basic = badge.replace('Adv', 'B')
            d.TrainingMedals = d.TrainingMedals.filter(b => b !== basic)
        }
    }

    // Remove empty medallions
    d.medallions = d.medallions.filter(m => m !== '')

    // Derive RifleManBadge from rank
    const normRank = (d.rank as string)
        .replace(/^SIG.*/, 'PTE').replace(/^TPR.*/, 'PTE')
        .replace(/^SAP.*/, 'PTE').replace(/^GM.*/, 'PTE')
        .replace(/^GNR.*/, 'PTE') as Rank

    if (normRank === 'PTEP' as Rank) {
        d.RifleManBadge = 'PTEP'
        d.rank = '' as Rank
    } else if (normRank === 'PTE' as Rank) {
        d.RifleManBadge = 'PTE'
        d.rank = '' as Rank
    } else if (normRank === 'REC' as Rank) {
        d.RifleManBadge = ''
        d.rank = '' as Rank
    }

    return d
}

// ── Main generation function ──────────────────────────────────────────────────
export async function generateUniform(rawData: UniformData): Promise<void> {
    const data = sanitize(rawData)

    if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT, { recursive: true })

    const canvas = createCanvas(1398, 1000)
    const ctx = canvas.getContext('2d')

    // 1. Base uniform
    const baseName = data.Uniform === 'Blue' ? 'blue_base_uni.png' : 'base-brown-uni.png'
    ctx.drawImage(await loadFile(path.join(ASSETS, baseName)), 0, 0, 1398, 1000)

    // 2. Rifle man badge
    if (data.RifleManBadge) {
        ctx.drawImage(await loadFile(path.join(ASSETS, 'imge', 'Embellishments', `${data.RifleManBadge}.png`)), 0, 0, 1398, 1000)
    }

    // 3. Name tag text
    const displayName = data.displayName.toUpperCase()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    let fontSize = 20
    ctx.font = `bold ${fontSize}px Times New Roman`
    while (ctx.measureText(displayName).width > 120 && fontSize > 8) {
        fontSize--
        ctx.font = `bold ${fontSize}px Times New Roman`
    }
    ctx.fillText(displayName, 475, 512)

    // 4. Corps badge (generals get variant 2)
    const highRanks = ['COL', 'LTGEN', 'GEN', 'MAJGEN', 'BRIG']
    const badgeSuffix = highRanks.includes(data.rank) ? '2' : ''
    const badgePath = path.join(ASSETS, 'imge', 'Corps', 'Corps Badges', `${data.badge}${badgeSuffix}.png`)
    ctx.drawImage(await loadFile(badgePath), 0, 0, 1398, 1000)

    // 5. Medallions
    for (const medallion of data.medallions) {
        ctx.drawImage(await loadFile(path.join(ASSETS, 'imge', 'Medallions', `${medallion}.png`)), 0, 0, 1398, 1000)
    }

    // 6. Training badges
    if (data.TrainingMedals.length > 0) {
        const allBadgeFiles = globSync(path.join(ASSETS, 'imge', 'Training Badges', '**', '*.png').replace(/\\/g, '/'), { absolute: true })
        const badgeFileNames = allBadgeFiles.map((f: string) => path.basename(f))

        for (const badge of data.TrainingMedals) {
            if (badge === 'RE') continue  // RE drawn after collar
            const idx = badgeFileNames.indexOf(`${badge}.png`)
            if (idx === -1) {
                console.warn(`[milpac-gen] Training badge not found: ${badge}`)
                continue
            }
            ctx.drawImage(await loadFile(allBadgeFiles[idx]), 0, 0, 1398, 1000)
        }
    }

    // 7. Citation ribbons
    if (data.citations.length > 0) {
        const EndLineY         = 511
        const leftEndX         = 1000
        const lineCapacities   = [4, 4, 4, 3, 3, 2, 2, 1]
        const lineKeys         = ['first_line','second_line','third_line','fourth_line','fifth_line','sixth_line','seventh_line','eighth_line']

        const rows: Citation[][] = lineKeys.map(key =>
            (medalJSON[key] ?? []).filter(m => data.citations.includes(m)).reverse()
        ).filter(r => r.length > 0)

        // Cascade: pull from lower rows to fill upper rows
        for (let i = 0; i < rows.length; i++) {
            const cap = lineCapacities[i] ?? 1
            let count = 1
            while (rows[i].length < cap && rows[i + count]) {
                if (rows[i + count].length === 0) { count++; continue }
                if (count > 6) break
                const moved = rows[i + count].pop()
                if (!moved) break
                rows[i].push(moved)
            }
        }

        for (const [rowIdx, row] of rows.entries()) {
            const cap = lineCapacities[rowIdx] ?? 1
            const corner = leftEndX - (cap - row.length) * 32

            for (const [colIdx, medal] of row.entries()) {
                const ribbonPath = path.join(ASSETS, 'imge', 'Ribbons', `${medal}.png`)
                if (!fs.existsSync(ribbonPath)) {
                    console.warn(`[milpac-gen] Ribbon not found: ${medal}`)
                    continue
                }
                ctx.drawImage(await loadFile(ribbonPath), corner - colIdx * 64, EndLineY - rowIdx * 20, 64, 20)
            }
        }
    }

    // 8. Collar + border
    const collarFile = data.Uniform === 'Blue' ? 'blue_collar.png' : 'brown_collar.png'
    ctx.drawImage(await loadFile(path.join(ASSETS, 'imge', collarFile)), 0, 0, 1398, 1000)
    ctx.drawImage(await loadFile(path.join(ASSETS, 'uni_border.png')), 0, 0, 1398, 1000)

    // 9. RE badge (over lapel, after collar)
    if (data.TrainingMedals.includes('RE')) {
        const rePath = path.join(ASSETS, 'imge', 'Training Badges', 'RE.png')
        if (fs.existsSync(rePath)) {
            ctx.drawImage(await loadFile(rePath), 0, 0, 1398, 1000)
        }
    }

    // 10. Rank insignia
    if (data.rank) {
        const rankFiles = globSync(path.join(ASSETS, 'imge', 'Rank', '**', '*.png').replace(/\\/g, '/'), { absolute: true })
        const rankNames = rankFiles.map((f: string) => path.basename(f))
        const idx = rankNames.indexOf(`${data.rank}.png`)
        if (idx === -1) throw new Error(`[milpac-gen] Rank insignia not found: ${data.rank}`)
        ctx.drawImage(await loadFile(rankFiles[idx]), 0, 0, 1398, 1000)

        ctx.drawImage(await loadFile(path.join(ASSETS, 'imge', 'border.png')), 0, 0, 1398, 1000)
    }

    // Save
    const buffer = canvas.toBuffer('image/png')
    fs.writeFileSync(path.join(OUTPUT, `${data.name}.png`), buffer)
}
