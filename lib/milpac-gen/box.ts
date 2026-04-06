import { createCanvas, loadImage } from '@napi-rs/canvas'
import fs from 'fs'
import path from 'path'
import type { BoxData, Citation } from './types'

// loadImage doesn't support Windows drive-letter paths (e.g. f:\...) — read as buffer first
function loadFile(filePath: string) {
    return loadImage(fs.readFileSync(filePath))
}

const ASSETS = path.join(process.cwd(), 'public', 'milpac-assets')
const OUTPUT = path.join(process.cwd(), 'milpacs')

type MedalJson = { [line: string]: Citation[] }
const medalJSON: MedalJson = JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'medals.json'), 'utf-8')
)

// Flattened priority order (eighth_line first = highest prestige displayed leftmost)
const CONJOINED: string[] = [
    ...medalJSON.eighth_line.slice().reverse(),
    ...medalJSON.seventh_line.slice().reverse(),
    ...medalJSON.sixth_line.slice().reverse(),
    ...medalJSON.fifth_line.slice().reverse(),
    ...medalJSON.fourth_line.slice().reverse(),
    ...medalJSON.third_line.slice().reverse(),
    ...medalJSON.second_line.slice().reverse(),
    ...medalJSON.first_line.slice().reverse(),
]

// Normalise raw award names to citation codes used by medals.json
function normaliseMedalName(raw: string): string {
    const campaignMap: Record<string, string> = {
        'Campaign Medallion':                       'campaign',
        'Campaign Medallion, First Clasp':          'campaign1',
        'Campaign Medallion, Second Clasp':         'campaign2',
        'Campaign Medallion, Third Clasp':          'campaign3',
        'Campaign Medallion, Fourth Clasp':         'campaign4',
        'Campaign Medallion, Fifth Clasp':          'campaign5',
        'Campaign Medallion, Sixth Clasp':          'campaign6',
        'Campaign Medallion, Seventh Clasp':        'campaign7',
        'Campaign Medallion, Eighth Clasp':         'campaign8',
        'Campaign Medallion, Ninth Clasp':          'campaign9',
        'Campaign Medallion, Tenth Clasp':          'campaign10',
        'Campaign Medallion, Eleventh Clasp':       'campaign11',
        'Campaign Medallion, Twelfth Clasp':        'campaign12',
        'Campaign Medallion, Thirteenth Clasp':     'campaign13',
        'Campaign Medallion, Fourteenth Clasp':     'campaign14',
        'Campaign Medallion, Fifteenth Clasp':      'campaign15',
        'Campaign Medallion, Sixteenth Clasp':      'campaign16',
    }
    return campaignMap[raw] ?? raw.toLowerCase().replace(/[\s,]/g, '')
}

export async function generateBox(rawData: BoxData): Promise<void> {
    if (!fs.existsSync(OUTPUT)) fs.mkdirSync(OUTPUT, { recursive: true })

    const normalisedMedals = rawData.medals.map(normaliseMedalName)

    // Find medals that exist in the hierarchy, in display order
    const foundMedals = CONJOINED.filter(m => normalisedMedals.includes(m)).reverse()

    const canvas = createCanvas(951, 340)
    const ctx = canvas.getContext('2d')

    // Backboard
    ctx.drawImage(await loadFile(path.join(ASSETS, 'medal-box-images', 'backboard.png')), 0, 0, 951, 340)

    // Medals
    const left  = 84
    const right = 795
    const top   = 102
    const medalWidth = 74
    const step  = 34

    const totalMedalSpan = foundMedals.length > 0 ? (foundMedals.length - 1) * step + medalWidth : 0
    const startX = left + (right - left - totalMedalSpan) / 2

    for (const [i, medal] of foundMedals.entries()) {
        const medalPath = path.join(ASSETS, 'medal-box-images', 'medals', `${medal}.png`)
        if (!fs.existsSync(medalPath)) {
            console.warn(`[milpac-gen] Medal image not found: ${medal}`)
            continue
        }
        ctx.drawImage(await loadFile(medalPath), startX + i * step, top, 74, 155)
    }

    // Glass overlay
    ctx.drawImage(await loadFile(path.join(ASSETS, 'medal-box-images', 'case_glass.png')), 0, 0, 951, 340)

    // Border
    ctx.drawImage(await loadFile(path.join(ASSETS, 'medal-box-images', 'border.png')), 0, 0, 951, 340)

    const buffer = canvas.toBuffer('image/png')
    fs.writeFileSync(path.join(OUTPUT, `${rawData.name}-medals.png`), buffer)
}
