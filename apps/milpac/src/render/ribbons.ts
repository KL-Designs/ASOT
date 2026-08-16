/**
 * Ribbon row cascade.
 *
 * Ribbons are grouped into eight fixed precedence lines by medals.json. The
 * display rules are not "one line per group": rows have a capacity (four at the
 * bottom, tapering to two near the top), and a row short of its capacity pulls
 * ribbons up from the lines below it until it is full. The result is a block
 * that fills from the bottom regardless of which awards a member happens to
 * hold.
 *
 * This is a faithful transcription of Fulcrum's original in src/index.ts, kept
 * deliberately close to it — the geometry is unexplained magic numbers matched
 * to the uniform artwork, and "tidying" it is how the web port introduced the
 * bugs PLAN.md section 3 documents.
 */

import fs from 'fs'

/** Right-hand edge that every row is anchored to. */
const RIGHT_EDGE_X = 1000

/** Baseline for the bottom row; each row above sits ROW_HEIGHT higher. */
const BASELINE_Y = 511

const RIBBON_WIDTH = 64
const RIBBON_HEIGHT = 20

/** Horizontal step between ribbons within a row — ribbons sit edge to edge. */
const RIBBON_STEP = 64

/** Vertical step between rows. Rows overlap; this is less than RIBBON_HEIGHT. */
const ROW_HEIGHT = 20

/**
 * Half a ribbon width. A row short of its capacity is nudged right by this per
 * missing ribbon, which keeps the short row centred against the rows below it.
 */
const SHORTFALL_NUDGE = 32

/** How many ribbons each displayed row holds, by row index from the bottom. */
function rowCapacity(index: number): number | null {
    if (index <= 2) return 4
    if (index <= 4) return 3
    if (index <= 6) return 2
    return null // top row takes whatever is left, with no pull and no nudge
}

export interface RibbonPlacement {
    citation: string
    x: number
    y: number
    width: number
    height: number
}

const LINE_ORDER = [
    'first_line', 'second_line', 'third_line', 'fourth_line',
    'fifth_line', 'sixth_line', 'seventh_line', 'eighth_line',
] as const

/**
 * Loads the precedence lines. Returns fresh arrays every call — the original
 * box.ts reversed the imported JSON arrays in place at module scope, which
 * mutated the same objects src/index.ts read from and made ribbon order depend
 * on which module happened to be imported first.
 */
export function loadLines(medalsJsonPath: string): string[][] {
    const parsed = JSON.parse(fs.readFileSync(medalsJsonPath, 'utf-8')) as Record<string, string[]>
    return LINE_ORDER.map(line => [...(parsed[line] ?? [])])
}

/**
 * Works out where every ribbon goes. Pure — takes the citations a member holds
 * and returns placements, so the cascade can be tested without a canvas.
 */
export function layoutRibbons(lines: string[][], citations: string[]): RibbonPlacement[] {
    const held = new Set(citations)

    // Within a row, precedence runs right to left, so each line is reversed
    // before the row is filled.
    const rows = lines
        .map(line => line.filter(c => held.has(c)).reverse())
        .filter(row => row.length > 0)

    const placements: RibbonPlacement[] = []

    for (const [index, row] of rows.entries()) {
        const capacity = rowCapacity(index)
        let cornerX = RIGHT_EDGE_X

        if (capacity !== null) {
            // Pull ribbons up from the rows below until this row is full. Rows
            // are consumed from their far end, and an emptied row is skipped
            // rather than terminating the search.
            if (rows[index + 1]) {
                let lookahead = 1
                while (row.length < capacity) {
                    const donor = rows[index + lookahead]
                    if (!donor) break
                    if (donor.length === 0) {
                        lookahead++
                        continue
                    }
                    if (lookahead > 6) break
                    const pulled = donor.pop()
                    if (!pulled) break
                    row.push(pulled)
                }
            }
            cornerX = RIGHT_EDGE_X - (capacity - row.length) * SHORTFALL_NUDGE
        }

        for (const [position, citation] of row.entries()) {
            placements.push({
                citation,
                x: cornerX - position * RIBBON_STEP,
                y: BASELINE_Y - index * ROW_HEIGHT,
                width: RIBBON_WIDTH,
                height: RIBBON_HEIGHT,
            })
        }
    }

    return placements
}
