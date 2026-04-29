#!/usr/bin/env node
// Usage:
//   node scripts/generate-terrain.mjs           — process all worlds
//   node scripts/generate-terrain.mjs altis     — process one world
//   node scripts/generate-terrain.mjs --force   — regenerate even if files exist

import { createCanvas } from '@napi-rs/canvas'
import { createReadStream, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { createGunzip, gzipSync } from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAPS_DIR = join(__dirname, '..', 'public', 'maps')
const FORCE = process.argv.includes('--force')
const TARGET = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1])

// ── Parse DEM ─────────────────────────────────────────────────────────────────
async function parseDEM(filePath) {
    return new Promise((resolve, reject) => {
        const chunks = []
        createReadStream(filePath).pipe(createGunzip())
            .on('data', c => chunks.push(c))
            .on('error', reject)
            .on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8')
                const lines = text.split('\n')
                const hdr = { ncols: 0, nrows: 0, xllcorner: 0, yllcorner: 0, cellsize: 1, nodata: -9999 }
                let dataStart = 0
                for (let i = 0; i < Math.min(10, lines.length); i++) {
                    const [k, v] = lines[i].trim().split(/\s+/)
                    switch ((k ?? '').toLowerCase()) {
                        case 'ncols':        hdr.ncols = +v; break
                        case 'nrows':        hdr.nrows = +v; break
                        case 'xllcorner':    hdr.xllcorner = +v; break
                        case 'yllcorner':    hdr.yllcorner = +v; break
                        case 'cellsize':     hdr.cellsize = +v; break
                        case 'nodata_value':
                        case 'nodata':       hdr.nodata = +v; dataStart = i + 1; break
                    }
                    if (dataStart) break
                }

                const { ncols, nrows, nodata } = hdr
                const elev = new Float32Array(nrows * ncols)
                let idx = 0
                for (let i = dataStart; i < lines.length && idx < elev.length; i++) {
                    for (const v of lines[i].trim().split(/\s+/)) {
                        if (v !== '' && idx < elev.length) elev[idx++] = +v === nodata ? -9999 : +v
                    }
                }
                resolve({ hdr, elev })
            })
    })
}

// ── Elevation → RGB (topographic palette) ────────────────────────────────────
function elevColor(e) {
    if (e <= 0)  return [100, 152, 192]   // water
    if (e < 10)  return [175, 192, 168]   // near-shore
    if (e < 50)  return [215, 228, 200]   // low plain
    if (e < 100) return [205, 218, 188]
    if (e < 200) return [193, 207, 175]
    if (e < 350) return [180, 194, 161]
    if (e < 500) return [167, 180, 146]
    return             [153, 165, 130]    // high ground
}

// ── Hillshade (NW light, 45° altitude) ───────────────────────────────────────
function hillshadeAt(elev, cols, rows, c, r) {
    const g = (cc, rr) => elev[Math.min(Math.max(rr, 0), rows - 1) * cols + Math.min(Math.max(cc, 0), cols - 1)]
    const dzdx = (g(c + 1, r) - g(c - 1, r)) / 2
    const dzdy = (g(c, r - 1) - g(c, r + 1)) / 2  // r-1 = north
    const nx = -dzdx, ny = dzdy, nz = 1
    const len = Math.sqrt(nx * nx + ny * ny + 1)
    const dot = (nx * (-0.5) + ny * 0.5 + nz * 0.707) / len
    return Math.max(0.15, Math.min(1.0, 0.45 + dot * 0.65))
}

// ── Terrain PNG ───────────────────────────────────────────────────────────────
async function generateTerrain(elev, ncols, nrows, outPath) {
    const SIZE = 2048
    const canvas = createCanvas(SIZE, SIZE)
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(SIZE, SIZE)
    const d = img.data

    const scX = (ncols - 1) / (SIZE - 1)
    const scY = (nrows - 1) / (SIZE - 1)

    for (let py = 0; py < SIZE; py++) {
        for (let px = 0; px < SIZE; px++) {
            const c = Math.round(px * scX)
            const r = Math.round(py * scY)
            const e = elev[r * ncols + c]
            const [br, bg, bb] = elevColor(e)
            const hs = e > 0 ? hillshadeAt(elev, ncols, nrows, c, r) : 1.0
            const i = (py * SIZE + px) * 4
            d[i]     = Math.min(255, br * hs | 0)
            d[i + 1] = Math.min(255, bg * hs | 0)
            d[i + 2] = Math.min(255, bb * hs | 0)
            d[i + 3] = 255
        }
    }

    ctx.putImageData(img, 0, 0)
    const buf = canvas.toBuffer('image/png')
    writeFileSync(outPath, buf)
    return buf.length
}

// ── Marching squares lookup ───────────────────────────────────────────────────
// Bit order: TL=8, TR=4, BR=2, BL=1
const MS = [
    [],                    // 0   all below
    [['W', 'S']],          // 1   BL
    [['S', 'E']],          // 2   BR
    [['W', 'E']],          // 3   BL+BR
    [['N', 'E']],          // 4   TR
    [['N', 'E'], ['W','S']],// 5  TR+BL saddle
    [['N', 'S']],          // 6   TR+BR
    [['N', 'W']],          // 7   !TL
    [['N', 'W']],          // 8   TL
    [['N', 'S']],          // 9   TL+BL
    [['N', 'W'], ['S','E']],// 10 TL+BR saddle
    [['N', 'E']],          // 11  !TR
    [['W', 'E']],          // 12  TL+TR
    [['S', 'E']],          // 13  !BR
    [['W', 'S']],          // 14  !BL
    [],                    // 15  all above
]

// ── Contour GeoJSON ───────────────────────────────────────────────────────────
function generateContours(elev, ncols, nrows, worldSize, levels, outPath) {
    // Downsample to 512×512 for contour generation
    const DS = 512
    const ds = new Float32Array(DS * DS)
    const scX = (ncols - 1) / (DS - 1)
    const scY = (nrows - 1) / (DS - 1)
    for (let r = 0; r < DS; r++)
        for (let c = 0; c < DS; c++)
            ds[r * DS + c] = elev[Math.round(r * scY) * ncols + Math.round(c * scX)]

    const cw = worldSize / DS  // world metres per cell

    function edgePt(edge, c, r, TL, TR, BL, BR, level) {
        let f
        switch (edge) {
            case 'N': f = TR !== TL ? (level - TL) / (TR - TL) : 0.5; return [Math.round((c + f) * cw), Math.round(worldSize - r * cw)]
            case 'S': f = BR !== BL ? (level - BL) / (BR - BL) : 0.5; return [Math.round((c + f) * cw), Math.round(worldSize - (r + 1) * cw)]
            case 'W': f = BL !== TL ? (level - TL) / (BL - TL) : 0.5; return [Math.round(c * cw),       Math.round(worldSize - (r + f) * cw)]
            case 'E': f = BR !== TR ? (level - TR) / (BR - TR) : 0.5; return [Math.round((c + 1) * cw), Math.round(worldSize - (r + f) * cw)]
        }
    }

    const features = []
    for (const level of levels) {
        const segs = []
        for (let r = 0; r < DS - 1; r++) {
            for (let c = 0; c < DS - 1; c++) {
                const TL = ds[r * DS + c]
                const TR = ds[r * DS + c + 1]
                const BL = ds[(r + 1) * DS + c]
                const BR = ds[(r + 1) * DS + c + 1]
                if (TL === -9999 || TR === -9999 || BL === -9999 || BR === -9999) continue
                const bits = (TL > level ? 8 : 0) | (TR > level ? 4 : 0) | (BR > level ? 2 : 0) | (BL > level ? 1 : 0)
                for (const [e1, e2] of MS[bits]) {
                    segs.push([edgePt(e1, c, r, TL, TR, BL, BR, level), edgePt(e2, c, r, TL, TR, BL, BR, level)])
                }
            }
        }
        if (segs.length > 0) {
            features.push({
                type: 'Feature',
                properties: { elevation: level, major: level % 100 === 0 },
                geometry: { type: 'MultiLineString', coordinates: segs },
            })
        }
    }

    const json = JSON.stringify({ type: 'FeatureCollection', features })
    const compressed = gzipSync(Buffer.from(json))
    writeFileSync(outPath, compressed)
    return { count: features.length, raw: json.length, gz: compressed.length }
}

// ── Coastline PNG (binary land/ocean mask for simplified map mode) ────────────
async function generateCoastline(elev, ncols, nrows, outPath) {
    const SIZE = 2048
    const canvas = createCanvas(SIZE, SIZE)
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(SIZE, SIZE)
    const d = img.data

    const scX = (ncols - 1) / (SIZE - 1)
    const scY = (nrows - 1) / (SIZE - 1)

    for (let py = 0; py < SIZE; py++) {
        for (let px = 0; px < SIZE; px++) {
            const e = elev[Math.round(py * scY) * ncols + Math.round(px * scX)]
            const i = (py * SIZE + px) * 4
            if (e <= 0) {
                // ocean — matches map-mode container bg #b0d8e8
                d[i] = 176; d[i+1] = 216; d[i+2] = 232; d[i+3] = 255
            } else {
                // land — matches map-mode rect fill #f5f0e8
                d[i] = 245; d[i+1] = 240; d[i+2] = 232; d[i+3] = 255
            }
        }
    }

    ctx.putImageData(img, 0, 0)
    const buf = canvas.toBuffer('image/png')
    writeFileSync(outPath, buf)
    return buf.length
}

// ── Process one world ─────────────────────────────────────────────────────────
async function processWorld(worldDir, name) {
    const demPath       = join(worldDir, 'dem.asc.gz')
    const terrainPath   = join(worldDir, 'terrain.png')
    const coastlinePath = join(worldDir, 'coastline.png')
    const contoursPath  = join(worldDir, 'contours.geojson.gz')

    if (!existsSync(demPath)) { console.log(`  ${name}: no dem.asc.gz — skipping`); return }
    if (!FORCE && existsSync(terrainPath) && existsSync(coastlinePath) && existsSync(contoursPath)) {
        console.log(`  ${name}: already generated (--force to regenerate)`)
        return
    }

    console.log(`\n▶ ${name}`)
    process.stdout.write('  Parsing DEM... ')
    const { hdr, elev } = await parseDEM(demPath)
    const { ncols, nrows, cellsize } = hdr
    const worldSize = ncols * cellsize
    console.log(`${ncols}×${nrows} cells, ${cellsize}m/cell, worldSize=${worldSize}m`)

    if (FORCE || !existsSync(terrainPath)) {
        process.stdout.write('  Generating terrain.png... ')
        const bytes = await generateTerrain(elev, ncols, nrows, terrainPath)
        console.log(`${(bytes / 1024).toFixed(0)}KB`)
    } else {
        console.log('  terrain.png already exists, skipping')
    }

    if (FORCE || !existsSync(coastlinePath)) {
        process.stdout.write('  Generating coastline.png... ')
        const bytes = await generateCoastline(elev, ncols, nrows, coastlinePath)
        console.log(`${(bytes / 1024).toFixed(0)}KB`)
    } else {
        console.log('  coastline.png already exists, skipping')
    }

    if (FORCE || !existsSync(contoursPath)) {
        process.stdout.write('  Generating contours... ')
        const levels = []
        for (let e = 0; e <= 650; e += 20) levels.push(e)
        const stats = generateContours(elev, ncols, nrows, worldSize, levels, contoursPath)
        console.log(`${stats.count} levels, ${(stats.gz / 1024).toFixed(0)}KB gz`)
    } else {
        console.log('  contours.geojson.gz already exists, skipping')
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
for (const entry of readdirSync(MAPS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (TARGET && entry.name !== TARGET) continue
    await processWorld(join(MAPS_DIR, entry.name), entry.name)
}
console.log('\nDone.')
