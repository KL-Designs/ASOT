/**
 * Repair pass for milpac cover photos that were uploaded before there were any
 * limits.
 *
 * The upload route used to write whatever bytes arrived. One member's cover was
 * a 16000x8000 PNG at 14MB, which is around half a gigabyte of bitmap once
 * decoded — every visitor to /milpacs paid for that, and so did the server
 * every time it drew that member's OpenGraph share card. `normaliseCover` now
 * stops the next one at the door, but it cannot do anything about the files
 * already on disk. This can.
 *
 * Deliberately reuses `normaliseCover` rather than reimplementing the resize,
 * so a cover repaired here is byte-for-byte the same treatment a cover uploaded
 * today gets. Both ceilings are raised for this run only: refusing an oversized
 * file is the upload route's job, whereas fixing one is this script's.
 *
 * Dry by default — it prints what it would do and touches nothing. Pass
 * `--apply` to write, and `--all` to re-encode every cover rather than only the
 * ones currently over a limit.
 *
 *   npx tsx scripts/normalise-covers.ts
 *   npx tsx scripts/normalise-covers.ts --apply
 */

import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

import { normaliseImage, sniffImageMime } from '../lib/uploads/image'
import { COVER_PRESET } from '../lib/uploads/image-limits'
import sharp from 'sharp'

const COVER_DIR = join(process.cwd(), '..', '..', 'storage', 'uploads', 'cover')
/** Originals are kept. This overwrites members' own uploads, and "we resized
 *  it and there is no way back" is not an acceptable outcome for that. */
const BACKUP_DIR = join(COVER_DIR, '_pre-normalise')

const apply = process.argv.includes('--apply')
const all = process.argv.includes('--all')

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(2)}MB`

async function main() {
    if (!existsSync(COVER_DIR)) {
        console.error(`No cover directory at ${COVER_DIR}`)
        process.exit(1)
    }

    const files = readdirSync(COVER_DIR).filter(f => f.endsWith('.png'))
    console.log(`${files.length} cover(s) in ${COVER_DIR}`)
    console.log(apply ? 'MODE: applying changes\n' : 'MODE: dry run — nothing will be written (pass --apply)\n')

    let touched = 0, skipped = 0, failed = 0, before = 0, after = 0

    for (const name of files) {
        const path = join(COVER_DIR, name)
        const id = name.slice(0, -'.png'.length)

        let buf: Buffer
        try {
            buf = readFileSync(path)
        } catch (err) {
            console.log(`  ${id}  UNREADABLE (${(err as Error).message})`)
            failed++
            continue
        }

        let width = 0, height = 0, pages = 1
        try {
            const meta = await sharp(buf, { limitInputPixels: false }).metadata()
            width = meta.width ?? 0
            height = meta.height ?? 0
            pages = meta.pages ?? 1
        } catch {
            // Fall through with zeroes; normaliseCover will report it properly.
        }

        const pixels = width * height * (sniffImageMime(buf) === 'image/gif' ? pages : 1)
        const oversized = buf.length > COVER_PRESET.maxStoredBytes
            || width > COVER_PRESET.box.width
            || height > COVER_PRESET.box.height

        if (!oversized && !all) {
            skipped++
            continue
        }

        const label = `${id}  ${width}x${height}${pages > 1 ? `x${pages}f` : ''}  ${MB(buf.length)}  (${(pixels / 1e6).toFixed(1)}MP)`

        const res = await normaliseImage(buf, COVER_PRESET, {
            // Raised for the repair pass only — see the note at the top.
            maxBytes: 256 * 1024 * 1024,
            maxPixels: 500_000_000,
        })

        if (!res.ok) {
            console.log(`  ${label}  ->  FAILED: ${res.error}`)
            failed++
            continue
        }

        const cover = res.image
        console.log(`  ${label}  ->  ${cover.width}x${cover.height}  ${MB(cover.buffer.length)}  ${cover.format}${cover.animated ? ' (animated)' : ''}`)

        before += buf.length
        after += cover.buffer.length
        touched++

        if (apply) {
            mkdirSync(BACKUP_DIR, { recursive: true })
            const backup = join(BACKUP_DIR, name)
            // Never clobber an existing backup: a second run must not overwrite
            // the true original with an already-normalised copy.
            if (!existsSync(backup)) copyFileSync(path, backup)
            writeFileSync(path, cover.buffer)
        }
    }

    console.log('')
    console.log(`  rewritten: ${touched}`)
    console.log(`  untouched: ${skipped}`)
    console.log(`  failed:    ${failed}`)
    if (touched) {
        console.log(`  size:      ${MB(before)}  ->  ${MB(after)}  (${(100 - (after / before) * 100).toFixed(1)}% smaller)`)
        if (apply) console.log(`  originals: ${BACKUP_DIR}`)
        else console.log('\n  Dry run — re-run with --apply to write these.')
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
