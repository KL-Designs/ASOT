/**
 * Asset path resolution and the boot-time preflight.
 *
 * Both original implementations resolved artwork by globbing the tree on every
 * request and matching on basename. That has three failure modes this module
 * exists to remove:
 *
 *   1. A missing file surfaced as a mid-render exception, or (in the web port)
 *      a console.warn and a uniform that rendered wrong without telling anyone.
 *   2. A *duplicate* basename in two folders resolved to whichever entry the
 *      glob happened to return first — so which artwork rendered was incidental
 *      and could differ between platforms. See PLAN.md section 10; this really
 *      happened, to FLT and SQLD.
 *   3. Globbing the whole tree per request, per layer.
 *
 * Instead the tree is indexed once at boot, uniqueness is asserted, and every
 * mapping this service knows how to draw is checked before the port opens.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const ASSETS = path.join(__dirname, '..', 'assets')

// ── Rank resolution ──────────────────────────────────────────────────────────

/**
 * Web sends the rank abbreviation verbatim from apps/web/lib/military/ranks.ts
 * — the authoritative list — in its display form: 'PTE(S)', 'B/SGT', 'RSM-A'.
 * This table is the *only* place a rank turns into a filename.
 *
 * The default rule is "strip parentheses and use that as the filename", which
 * covers 72 of the 99 ranks. Everything below is an exception to that rule.
 *
 * `null` means the rank intentionally draws no insignia — the rifleman badge
 * on the chest carries the tier instead.
 *
 * Do not "fix" the mismatches by renaming the files. SLT.png and CLT.png are
 * correctly-named art for ranks the unit has since rewritten as LT(S) and
 * LT(C); renaming would destroy the only record of the older naming.
 */
export const RANK_TO_ASSET: Record<string, string | null> = {
    // Ranks with no insignia by design — the rifleman badge carries the tier.
    'REC': null,
    'PTE': null,
    'PTE(P)': null,

    // Corps base and Proficient tiers. Only the L/S/SL tiers of each corps were
    // ever drawn, so these fall back to the same rifleman-badge treatment.
    // Forced by the asset set, not a design choice — there is no file.
    'SAP': null, 'SAP(P)': null,
    'GNR': null, 'GNR(P)': null,
    'TPR': null, 'TPR(P)': null,

    // Signallers have no artwork at any tier, so they borrow the generic
    // private insignia at the matching tier. PLAN.md decision 3a.
    'SIG': null,
    'SIG(P)': null,
    'SIG(L)': 'PTEL',
    'SIG(S)': 'PTES',
    'SIG(SL)': 'PTESL',

    // The only Game Master tier without its own art. Base and Proficient look
    // identical on the uniform as a result. PLAN.md decision 3c.
    'GM': 'GMP',

    // Art filed under a different name than the rank now uses.
    // Slashes and hyphens survive parenthesis-stripping and would otherwise be
    // looked up literally as part of the filename.
    'B/SGT': 'BSGT',
    'T/SGM': 'TSGM',
    'RSM-A': 'RSMA',
    'LBDR(S)': 'LDBRS',   // transposed letters in the original filename

    // Art uses a "Senior/Commanding" prefix where the rank now uses a suffix.
    'LT(S)': 'SLT',
    'LT(C)': 'CLT',
    'LM(S)': 'SLM',
    'FLT(S)': 'SFLT',

    // Different abbreviation entirely. These four are inferred from rank group
    // and full name rather than proven — confirm visually before shipping.
    'OFFCDT': 'HOCDT',    // Aviation Officer Cadet
    'AM': 'HAM',          // Air Marshal
    'CA': 'COA',          // Chief of ASOT
    'GPCAPT': 'GCPT',     // Group Captain

    // PLAN.md decision 3d — prefer the structured Airforce* folder over the
    // superseded loose copy in the imge/Rank/ root.
    'WGCO': 'WGCDR',      // Wing Commander
}

/** The default rule: strip parentheses, use the result as a filename. */
function defaultRankAsset(rank: string): string {
    return rank.replace(/[()]/g, '')
}

/**
 * Resolves a rank abbreviation to an asset basename, or null when the rank
 * intentionally draws no insignia. Returns undefined when the rank is unknown
 * to this service, which the route turns into a 422 naming the rank.
 */
export function resolveRankAsset(rank: string): string | null | undefined {
    if (rank === '') return null
    if (rank in RANK_TO_ASSET) return RANK_TO_ASSET[rank]
    const name = defaultRankAsset(rank)
    return rankIndex.has(name) ? name : undefined
}

// ── Directory indexes ────────────────────────────────────────────────────────

type Index = Map<string, string>

/** Every duplicate basename found while indexing, for the preflight to report. */
const duplicates: { category: string; name: string; paths: string[] }[] = []

/**
 * Indexes a directory tree by file basename. Recursive because the rank and
 * training-badge trees are foldered by branch and category respectively, while
 * the code refers to art by bare name.
 */
function indexTree(category: string, dir: string, recursive = true): Index {
    const index: Index = new Map()
    const seen = new Map<string, string[]>()

    if (!fs.existsSync(dir)) return index

    const walk = (current: string) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) {
                if (recursive) walk(full)
                continue
            }
            if (!entry.name.toLowerCase().endsWith('.png')) continue
            const base = path.basename(entry.name, path.extname(entry.name))
            seen.set(base, [...(seen.get(base) ?? []), full])
            if (!index.has(base)) index.set(base, full)
        }
    }
    walk(dir)

    for (const [name, paths] of seen) {
        if (paths.length > 1) duplicates.push({ category, name, paths })
    }
    return index
}

const IMGE = path.join(ASSETS, 'imge')
const BOX = path.join(ASSETS, 'medal-box-images')

export const rankIndex = indexTree('rank', path.join(IMGE, 'Rank'))
export const ribbonIndex = indexTree('ribbon', path.join(IMGE, 'Ribbons'), false)
export const badgeIndex = indexTree('training-badge', path.join(IMGE, 'Training Badges'))
export const medallionIndex = indexTree('medallion', path.join(IMGE, 'Medallions'), false)
export const corpsIndex = indexTree('corps-badge', path.join(IMGE, 'Corps', 'Corps Badges'), false)
export const embellishIndex = indexTree('embellishment', path.join(IMGE, 'Embellishments'), false)
export const boxMedalIndex = indexTree('box-medal', path.join(BOX, 'medals'), false)

/** Fixed single-file assets, resolved by explicit path rather than by index. */
export const files = {
    baseBrown: path.join(ASSETS, 'base-brown-uni.png'),
    baseBlue: path.join(ASSETS, 'blue_base_uni.png'),
    uniBorder: path.join(ASSETS, 'uni_border.png'),
    collarBrown: path.join(IMGE, 'brown_collar.png'),
    collarBlue: path.join(IMGE, 'blue_collar.png'),
    rankBorder: path.join(IMGE, 'border.png'),
    boxBackboard: path.join(BOX, 'backboard.png'),
    boxGlass: path.join(BOX, 'case_glass.png'),
    boxBorder: path.join(BOX, 'border.png'),
    medalsJson: path.join(ASSETS, 'medals.json'),
    fontTimes: path.join(ASSETS, 'fonts', 'times.ttf'),
} as const

// ── Preflight ────────────────────────────────────────────────────────────────

export interface PreflightResult {
    errors: string[]
    warnings: string[]
}

/**
 * Asserts that everything this service can be asked to draw actually exists,
 * and that no basename is ambiguous. Called before the HTTP port opens.
 *
 * Note what is *not* checked: the full list of ranks the unit uses. That list
 * lives in apps/web/lib/military/ranks.ts and duplicating it here is precisely
 * the drift PLAN.md section 4 warns about. A rank this service has never heard
 * of is a 422 at request time, and Phase 3 adds a web-side test asserting every
 * rank in RANK_GROUPS resolves.
 */
export function preflight(): PreflightResult {
    const errors: string[] = []
    const warnings: string[] = []

    for (const [key, file] of Object.entries(files)) {
        if (!fs.existsSync(file)) errors.push(`missing fixed asset: ${key} -> ${file}`)
    }

    // Ambiguous basenames are the failure the old glob-and-match approach could
    // not detect: the file exists, so a presence check passes, but which one
    // renders is decided by directory traversal order.
    for (const dup of duplicates) {
        errors.push(
            `ambiguous ${dup.category} "${dup.name}" resolves to ${dup.paths.length} files: ` +
            dup.paths.map(p => path.relative(ASSETS, p)).join(' | ')
        )
    }

    for (const [rank, asset] of Object.entries(RANK_TO_ASSET)) {
        if (asset === null) continue
        if (!rankIndex.has(asset)) {
            errors.push(`rank "${rank}" maps to ${asset}.png, which does not exist`)
        }
    }

    // Every ribbon named in the cascade must be drawable, or a member holding
    // that award renders a uniform with a hole in it.
    const medals = JSON.parse(fs.readFileSync(files.medalsJson, 'utf-8')) as Record<string, string[]>
    for (const [line, citations] of Object.entries(medals)) {
        for (const citation of citations) {
            if (!ribbonIndex.has(citation)) {
                errors.push(`medals.json ${line} lists "${citation}", but Ribbons/${citation}.png does not exist`)
            }
            if (!boxMedalIndex.has(citation)) {
                warnings.push(`medals.json ${line} lists "${citation}", but medal-box-images/medals/${citation}.png does not exist`)
            }
        }
    }

    // Deliberately no "unreferenced asset" check. Which rank assets are reachable
    // depends on the rank list this service intentionally does not hold, so the
    // question can only be answered web-side. PLAN.md section 10 has the audit.

    return { errors, warnings }
}

// ── Render fingerprint ───────────────────────────────────────────────────────

/**
 * An opaque digest of everything this service draws with.
 *
 * apps/web caches uniform and medal-box renders and only redraws them when the
 * member's data changes. That misses the other half: swap a base uniform PNG or
 * change the layer order and every cached image is silently stale forever, with
 * no member-data change to trigger a redraw. Web folds this digest into its
 * cache key so new artwork invalidates the whole estate at once.
 *
 * Path plus byte size rather than content hash: it is computed from the stat
 * calls the index already makes, and any real edit to a PNG changes its size.
 * Deliberately *not* mtime, which every container rebuild resets — that would
 * re-render every member on each deploy for no reason.
 *
 * `RENDERER_REVISION` covers the rest: bump it when the drawing code changes in
 * a way that alters output without any asset changing.
 */
const RENDERER_REVISION = 1

let fingerprint: string | null = null

export function assetFingerprint(): string {
    if (fingerprint) return fingerprint

    const indexes = [
        rankIndex, ribbonIndex, badgeIndex, medallionIndex,
        corpsIndex, embellishIndex, boxMedalIndex,
    ]

    const entries: string[] = []
    for (const index of indexes) {
        for (const full of index.values()) entries.push(full)
    }
    entries.push(...Object.values(files))
    entries.push(path.join(ASSETS, 'templates', 'certificate-layouts.json'))

    const hash = crypto.createHash('md5').update(`r${RENDERER_REVISION}`)
    for (const full of entries.sort()) {
        let size = -1
        try { size = fs.statSync(full).size } catch { /* absent — preflight reports it */ }
        hash.update(`${path.relative(ASSETS, full)}:${size}\n`)
    }

    fingerprint = hash.digest('hex')
    return fingerprint
}
