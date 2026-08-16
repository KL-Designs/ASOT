/**
 * Extracts certificate text layouts from the two PowerPoint templates into
 * assets/templates/certificate-layouts.json, which the canvas renderer reads at
 * runtime. Run with:
 *
 *   npm run extract-layouts --workspace=apps/milpac
 *
 * The templates stay in the repository as the source of truth for what each of
 * the 158 certificates says and where the text sits — see PLAN.md sections 5
 * and 11. This script is the only thing that reads them; nothing at runtime
 * touches a .pptx.
 *
 * Two details of the OOXML make a naive parse wrong:
 *
 *   1. A placeholder is routinely split across runs. `{dateNumber}` arrives as
 *      three separate <a:t> elements — `{`, `dateNumber`, `}` — because the
 *      editor recorded a spellcheck flag partway through. Runs must be merged
 *      before placeholders can be matched.
 *   2. Formatting is per-run, so merging has to keep the formatting of the run
 *      a placeholder *starts* in, which is what the original rendering did.
 */

import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'

const TEMPLATES = path.join(__dirname, '..', 'assets', 'templates')
const OUT = path.join(TEMPLATES, 'certificate-layouts.json')

/** EMU per inch. Slide coordinates are in these; output is pixels. */
const EMU_PER_INCH = 914400

/**
 * Output width in pixels, per certificate type. Taken from the 343 existing
 * rendered certificates, which come in exactly two formats — promotions are
 * portrait 906 x 1232 (222 of them) and awards are landscape 1535 x 925 (121).
 * The two templates genuinely have different slide sizes; both aspects match
 * their template to within a rounding error, so these are the scales the unit
 * already has examples of.
 */
const OUTPUT_WIDTH: Record<string, number> = {
    promotion: 906,
    award: 1535,
}

interface Run {
    text: string
    /** Point size. OOXML stores hundredths of a point. */
    size: number
    bold: boolean
    italic: boolean
    /** Hex colour without the leading hash. */
    color: string
    font: string
}

interface Paragraph {
    align: 'l' | 'ctr' | 'r' | 'just'
    runs: Run[]
}

interface TextShape {
    /** Pixel box, scaled from EMU against OUTPUT_WIDTH. */
    x: number
    y: number
    width: number
    height: number
    /** Vertical anchor within the box: t | ctr | b. */
    anchor: string
    /** Body insets in pixels, in OOXML order. */
    insets: { left: number; top: number; right: number; bottom: number }
    paragraphs: Paragraph[]
}

interface SlideLayout {
    slide: number
    width: number
    height: number
    shapes: TextShape[]
}

// ── XML helpers ──────────────────────────────────────────────────────────────
// Deliberately regex-based rather than a DOM parse. The subset of OOXML in play
// here is small, fully known, and machine-generated, and this keeps the script
// dependency-free beyond the zip reader.

function attr(source: string, name: string): string | undefined {
    return new RegExp(`${name}="([^"]*)"`).exec(source)?.[1]
}

function decodeXml(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
        .replace(/&amp;/g, '&')
}

/**
 * Merges adjacent runs whose formatting is identical. This is what repairs the
 * split placeholders: `{` + `dateNumber` + `}` share formatting and become
 * `{dateNumber}`. Runs that genuinely differ — the italic rank inside an
 * upright sentence — stay separate, because their formatting differs.
 */
function mergeRuns(runs: Run[]): Run[] {
    const merged: Run[] = []
    for (const run of runs) {
        const previous = merged[merged.length - 1]
        if (
            previous &&
            previous.size === run.size &&
            previous.bold === run.bold &&
            previous.italic === run.italic &&
            previous.color === run.color &&
            previous.font === run.font
        ) {
            previous.text += run.text
            continue
        }
        merged.push({ ...run })
    }
    return merged
}

function parseParagraph(xml: string): Paragraph | null {
    const align = (attr(/<a:pPr[^>]*>/.exec(xml)?.[0] ?? '', 'algn') ?? 'l') as Paragraph['align']

    const runs: Run[] = []

    // Walk runs and <a:br/> breaks in document order. A break inside a paragraph
    // is a real line break, not a paragraph boundary — the signature block is one
    // paragraph of three lines — so dropping them silently collapses the block
    // onto a single line. It carries no text of its own, so it is emitted as a
    // newline on a run that inherits the preceding formatting.
    for (const match of xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>|<a:br\s*\/>|<a:br>[\s\S]*?<\/a:br>/g)) {
        if (match[1] === undefined) {
            const previous = runs[runs.length - 1]
            if (previous) runs.push({ ...previous, text: '\n' })
            continue
        }

        const body = match[1]
        const props = /<a:rPr[^>]*>/.exec(body)?.[0] ?? ''
        const text = /<a:t>([\s\S]*?)<\/a:t>/.exec(body)?.[1]
        if (text === undefined) continue

        runs.push({
            text: decodeXml(text),
            size: Number(attr(props, 'sz') ?? 1800) / 100,
            bold: attr(props, 'b') === '1',
            italic: attr(props, 'i') === '1',
            color: /<a:srgbClr val="([0-9A-Fa-f]{6})"\/>/.exec(body)?.[1] ?? '000000',
            font: /<a:latin typeface="([^"]*)"/.exec(body)?.[1] ?? 'Times New Roman',
        })
    }

    if (runs.length === 0) return null
    return { align, runs: mergeRuns(runs) }
}

function parseSlide(xml: string, slide: number, scale: number, slidePx: { w: number; h: number }): SlideLayout {
    const shapes: TextShape[] = []

    for (const match of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
        const body = match[1] ?? ''

        // Shapes without a text body are decoration; the renderer draws its own art.
        const txBody = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(body)?.[1]
        if (!txBody) continue

        const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(body)
        const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(body)
        if (!off || !ext) continue

        const bodyPr = /<a:bodyPr[^>]*>/.exec(txBody)?.[0] ?? ''

        const paragraphs: Paragraph[] = []
        for (const p of txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
            const parsed = parseParagraph(p[1] ?? '')
            if (parsed) paragraphs.push(parsed)
        }
        if (paragraphs.length === 0) continue

        shapes.push({
            x: Math.round(Number(off[1]) * scale),
            y: Math.round(Number(off[2]) * scale),
            width: Math.round(Number(ext[1]) * scale),
            height: Math.round(Number(ext[2]) * scale),
            anchor: attr(bodyPr, 'anchor') ?? 't',
            insets: {
                left: Math.round(Number(attr(bodyPr, 'lIns') ?? 91440) * scale),
                top: Math.round(Number(attr(bodyPr, 'tIns') ?? 45720) * scale),
                right: Math.round(Number(attr(bodyPr, 'rIns') ?? 91440) * scale),
                bottom: Math.round(Number(attr(bodyPr, 'bIns') ?? 45720) * scale),
            },
            paragraphs,
        })
    }

    return { slide, width: slidePx.w, height: slidePx.h, shapes }
}

function extractTemplate(file: string, outputWidth: number) {
    const zip = new PizZip(fs.readFileSync(file))

    const presentation = zip.file('ppt/presentation.xml')?.asText() ?? ''
    const size = /<p:sldSz cx="(\d+)" cy="(\d+)"\/>/.exec(presentation)
    if (!size) throw new Error(`${path.basename(file)}: no slide size in presentation.xml`)

    const emuWidth = Number(size[1])
    const emuHeight = Number(size[2])
    const scale = outputWidth / emuWidth
    const slidePx = { w: outputWidth, h: Math.round(emuHeight * scale) }

    const layouts: Record<number, SlideLayout> = {}
    for (const entry of Object.keys(zip.files)) {
        const n = /^ppt\/slides\/slide(\d+)\.xml$/.exec(entry)
        if (!n) continue
        const slide = Number(n[1])
        layouts[slide] = parseSlide(zip.file(entry)!.asText(), slide, scale, slidePx)
    }

    return {
        emu: { width: emuWidth, height: emuHeight },
        pixels: slidePx,
        inches: {
            width: Number((emuWidth / EMU_PER_INCH).toFixed(2)),
            height: Number((emuHeight / EMU_PER_INCH).toFixed(2)),
        },
        layouts,
    }
}

function main() {
    const slideMap = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'slide-map.json'), 'utf-8'))

    const output: Record<string, unknown> = {
        _comment:
            'Generated by scripts/extract-certificate-layouts.ts from the .pptx templates. ' +
            'Do not hand-edit — re-run the script instead. Coordinates are pixels at the ' +
            'output width recorded per certificate type; font sizes are points at that scale.',
        outputWidth: OUTPUT_WIDTH,
    }

    for (const type of ['promotion', 'award'] as const) {
        const spec = slideMap[type]
        const outputWidth = OUTPUT_WIDTH[type]!
        const extracted = extractTemplate(path.join(TEMPLATES, spec.template), outputWidth)

        const byCode: Record<string, SlideLayout> = {}
        const missing: string[] = []
        for (const [code, slide] of Object.entries(spec.map as Record<string, number>)) {
            const layout = extracted.layouts[slide]
            if (!layout) {
                missing.push(`${code} -> slide ${slide}`)
                continue
            }
            byCode[code] = layout
        }

        output[type] = {
            template: spec.template,
            emu: extracted.emu,
            pixels: extracted.pixels,
            inches: extracted.inches,
            certificates: byCode,
        }

        const shapeCount = Object.values(byCode).reduce((n, l) => n + l.shapes.length, 0)
        console.log(
            `${type.padEnd(9)} ${spec.template.padEnd(20)} ` +
            `${Object.keys(extracted.layouts).length} slides, ` +
            `${Object.keys(byCode).length} codes, ${shapeCount} text shapes, ` +
            `${extracted.pixels.w}x${extracted.pixels.h}px`,
        )
        if (missing.length) console.warn(`  codes with no slide: ${missing.join(', ')}`)
    }

    fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n')
    console.log(`\nwrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`)
}

main()
