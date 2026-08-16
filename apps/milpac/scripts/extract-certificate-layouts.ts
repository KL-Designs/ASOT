/**
 * Extracts certificate layouts — art placement and text — from the two
 * PowerPoint templates into assets/templates/certificate-layouts.json, and
 * unpacks the embedded artwork into assets/templates/media/. Run with:
 *
 *   npm run extract-layouts --workspace=apps/milpac
 *
 * The templates stay in the repository as the source of truth for what each of
 * the 158 certificates says and looks like — see PLAN.md sections 5 and 11.
 * This script is the only thing that reads them; nothing at runtime opens a
 * .pptx.
 *
 * Five details of the OOXML make a naive parse wrong, each found by comparing
 * output against the reference renders rather than by reading the spec:
 *
 *   1. A placeholder is routinely split across runs. `{dateNumber}` arrives as
 *      three separate <a:t> elements — `{`, `dateNumber`, `}`. Runs are merged
 *      when their formatting matches, which repairs the placeholder while
 *      leaving genuinely distinct runs alone.
 *   2. <a:br/> line breaks sit between runs and are easy to drop, which
 *      collapses the three-line signature block onto one line.
 *   3. Artwork is placed by the slide, not by convention. Both <p:pic> elements
 *      and <p:sp> shapes carrying a <a:blipFill> are pictures, and their
 *      <a:xfrm> gives exact position and size.
 *   4. Several of those carry rot="5400000" — a 90 degree rotation. The
 *      parchment and the wooden frame are landscape images *rotated* onto the
 *      portrait canvas, not stretched onto it. Ignoring the rotation is what
 *      made an earlier pass render a squashed frame and an overbearing flag.
 *   5. The rule under the signature is a <p:cxnSp> connector, not a shape.
 *      Walking only sp and pic left every certificate's signature floating
 *      over nothing.
 */

import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'

const TEMPLATES = path.join(__dirname, '..', 'assets', 'templates')
const MEDIA_OUT = path.join(TEMPLATES, 'media')
const OUT = path.join(TEMPLATES, 'certificate-layouts.json')

/** EMU per inch, and per point. */
const EMU_PER_INCH = 914400
const EMU_PER_POINT = 12700

/** OOXML angles are sixtieths of a degree. */
const ANGLE_UNITS_PER_DEGREE = 60000

/**
 * Output width in pixels, per certificate type. Taken from the 343 existing
 * rendered certificates, which come in exactly two formats — promotions are
 * portrait 906 x 1232 (222 of them) and awards are landscape 1535 x 925 (121).
 * Both aspects match their template to within a rounding error.
 */
const OUTPUT_WIDTH: Record<string, number> = {
    promotion: 906,
    award: 1535,
}

interface Run {
    text: string
    size: number
    bold: boolean
    italic: boolean
    /** OOXML `baseline`, percent-of-em times 1000. Positive is superscript. */
    baseline: number
    color: string
    font: string
}

interface Paragraph {
    align: 'l' | 'ctr' | 'r' | 'just'
    runs: Run[]
}

interface Frame {
    x: number
    y: number
    width: number
    height: number
    /** Clockwise degrees about the box centre. */
    rotation: number
    flipH: boolean
    flipV: boolean
}

interface PictureElement extends Frame {
    kind: 'picture'
    /** Filename under assets/templates/media/<template>/. */
    media: string
    /**
     * Source crop, as fractions of the image, applied before the fit. The
     * wooden frame carries ~12% transparent padding that a srcRect trims off —
     * without honouring it the moulding renders inset instead of full bleed.
     */
    crop: { left: number; top: number; right: number; bottom: number } | null
}

interface TextElement extends Frame {
    kind: 'text'
    anchor: string
    insets: { left: number; top: number; right: number; bottom: number }
    paragraphs: Paragraph[]
}

/**
 * A stroked connector — in practice the rule beneath the signature, which is a
 * <p:cxnSp> rather than a <p:sp> and so was skipped entirely by the first
 * pass, leaving the signature floating with nothing under it.
 */
interface LineElement extends Frame {
    kind: 'line'
    /** Stroke width in pixels at output scale. */
    thickness: number
    color: string
}

type Element = PictureElement | TextElement | LineElement

interface SlideLayout {
    slide: number
    width: number
    height: number
    /** In draw order, back to front, exactly as the slide lists them. */
    elements: Element[]
}

// ── XML helpers ──────────────────────────────────────────────────────────────
// Deliberately regex-based rather than a DOM parse. The subset of OOXML in play
// is small, fully known, and machine-generated.

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

/** Reads the <a:xfrm> of a shape, scaled from EMU to output pixels. */
function readFrame(xml: string, scale: number): Frame | null {
    const xfrm = /<a:xfrm([^>]*)>([\s\S]*?)<\/a:xfrm>/.exec(xml)
    if (!xfrm) return null

    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(xfrm[2] ?? '')
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(xfrm[2] ?? '')
    if (!off || !ext) return null

    const attrs = xfrm[1] ?? ''
    return {
        x: Math.round(Number(off[1]) * scale),
        y: Math.round(Number(off[2]) * scale),
        width: Math.round(Number(ext[1]) * scale),
        height: Math.round(Number(ext[2]) * scale),
        rotation: Number(attr(attrs, 'rot') ?? 0) / ANGLE_UNITS_PER_DEGREE,
        flipH: attr(attrs, 'flipH') === '1',
        flipV: attr(attrs, 'flipV') === '1',
    }
}

/**
 * Reads <a:srcRect>, whose edges are percentages scaled by 1000. An empty
 * element means no crop, which is common and must not be read as a zero-size
 * source region.
 */
function readCrop(xml: string): PictureElement['crop'] {
    const rect = /<a:srcRect([^>]*)\/>/.exec(xml)
    if (!rect) return null
    const attrs = rect[1] ?? ''
    const edge = (name: string) => Number(attr(attrs, name) ?? 0) / 100000
    const crop = { left: edge('l'), top: edge('t'), right: edge('r'), bottom: edge('b') }
    const any = crop.left || crop.top || crop.right || crop.bottom
    return any ? crop : null
}

/**
 * Merges adjacent runs whose formatting is identical, which repairs
 * placeholders split across runs. Runs that genuinely differ — the italic rank
 * inside an upright sentence — stay separate, because their formatting differs.
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
            previous.baseline === run.baseline &&
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

    // Runs and <a:br/> breaks are walked in document order. A break inside a
    // paragraph is a real line break, not a paragraph boundary.
    for (const match of xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>|<a:br\s*\/>|<a:br[^>]*>[\s\S]*?<\/a:br>/g)) {
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
            baseline: Number(attr(props, 'baseline') ?? 0) / 1000,
            color: /<a:srgbClr val="([0-9A-Fa-f]{6})"\/>/.exec(body)?.[1] ?? '000000',
            font: /<a:latin typeface="([^"]*)"/.exec(body)?.[1] ?? 'Times New Roman',
        })
    }

    if (runs.length === 0) return null
    return { align, runs: mergeRuns(runs) }
}

function parseTextBody(txBody: string, frame: Frame, scale: number): TextElement | null {
    const bodyPr = /<a:bodyPr[^>]*>/.exec(txBody)?.[0] ?? ''

    const paragraphs: Paragraph[] = []
    for (const p of txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
        const parsed = parseParagraph(p[1] ?? '')
        if (parsed) paragraphs.push(parsed)
    }
    if (paragraphs.length === 0) return null

    return {
        kind: 'text',
        ...frame,
        anchor: attr(bodyPr, 'anchor') ?? 't',
        insets: {
            left: Math.round(Number(attr(bodyPr, 'lIns') ?? 91440) * scale),
            top: Math.round(Number(attr(bodyPr, 'tIns') ?? 45720) * scale),
            right: Math.round(Number(attr(bodyPr, 'rIns') ?? 91440) * scale),
            bottom: Math.round(Number(attr(bodyPr, 'bIns') ?? 45720) * scale),
        },
        paragraphs,
    }
}

/**
 * Reads a connector's stroke. `<a:ln w="…">` is in EMU; a missing width is
 * PowerPoint's 0.75pt hairline default, and `<a:noFill/>` means the shape has
 * a geometry but draws nothing.
 */
function readStroke(body: string, scale: number): { thickness: number; color: string } | null {
    const ln = /<a:ln[^>]*>[\s\S]*?<\/a:ln>|<a:ln[^>]*\/>/.exec(body)?.[0]
    if (!ln || /<a:noFill\s*\/>/.test(ln)) return null

    const width = Number(attr(ln, 'w') ?? EMU_PER_POINT * 0.75)
    return {
        // Sub-pixel strokes still have to be visible; the rule is a 1pt line
        // that lands just under one output pixel at award scale.
        thickness: Math.max(1, Math.round(width * scale)),
        color: /<a:srgbClr val="([0-9A-Fa-f]{6})"\/>/.exec(ln)?.[1] ?? '000000',
    }
}

/**
 * Walks a slide's top-level drawing elements in document order, which is also
 * back-to-front draw order. A <p:sp> can be either a text box or a picture —
 * the parchment is a shape with a blipFill — so both element types are checked
 * for both kinds of content. <p:cxnSp> is a connector, and only ever a line
 * here.
 */
function parseSlide(
    xml: string,
    slide: number,
    scale: number,
    slidePx: { w: number; h: number },
    rels: Record<string, string>,
): SlideLayout {
    const elements: Element[] = []

    for (const match of xml.matchAll(/<p:(sp|pic|cxnSp)>([\s\S]*?)<\/p:\1>/g)) {
        const body = match[2] ?? ''
        const frame = readFrame(body, scale)
        if (!frame) continue

        if (match[1] === 'cxnSp') {
            const stroke = readStroke(body, scale)
            if (stroke) elements.push({ kind: 'line', ...frame, ...stroke })
            continue
        }

        const embed = /<a:blip[^>]*r:embed="([^"]+)"/.exec(body)?.[1]
        if (embed) {
            const target = rels[embed]
            if (target) {
                elements.push({
                    kind: 'picture',
                    ...frame,
                    media: path.basename(target),
                    crop: readCrop(body),
                })
                continue
            }
        }

        const txBody = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(body)?.[1]
        if (!txBody) continue

        const text = parseTextBody(txBody, frame, scale)
        if (text) elements.push(text)
    }

    return { slide, width: slidePx.w, height: slidePx.h, elements }
}

function readRels(zip: PizZip, slide: number): Record<string, string> {
    const file = zip.file(`ppt/slides/_rels/slide${slide}.xml.rels`)
    if (!file) return {}
    const rels: Record<string, string> = {}
    for (const m of file.asText().matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
        rels[m[1]!] = m[2]!
    }
    return rels
}

function extractTemplate(file: string, outputWidth: number, mediaDir: string) {
    const zip = new PizZip(fs.readFileSync(file))

    const presentation = zip.file('ppt/presentation.xml')?.asText() ?? ''
    const size = /<p:sldSz cx="(\d+)" cy="(\d+)"\/>/.exec(presentation)
    if (!size) throw new Error(`${path.basename(file)}: no slide size in presentation.xml`)

    const emuWidth = Number(size[1])
    const emuHeight = Number(size[2])
    const scale = outputWidth / emuWidth
    const slidePx = { w: outputWidth, h: Math.round(emuHeight * scale) }

    const layouts: Record<number, SlideLayout> = {}
    const usedMedia = new Set<string>()

    for (const entry of Object.keys(zip.files)) {
        const n = /^ppt\/slides\/slide(\d+)\.xml$/.exec(entry)
        if (!n) continue
        const slide = Number(n[1])
        const layout = parseSlide(zip.file(entry)!.asText(), slide, scale, slidePx, readRels(zip, slide))
        layouts[slide] = layout
        for (const el of layout.elements) if (el.kind === 'picture') usedMedia.add(el.media)
    }

    // Unpack only the artwork the certificate slides actually reference. The
    // renderer draws these rather than the loose copies in imge/Certificates/,
    // so "which file is which layer" stops being a guess.
    fs.mkdirSync(mediaDir, { recursive: true })
    for (const name of usedMedia) {
        const source = zip.file(`ppt/media/${name}`)
        if (!source) {
            console.warn(`  referenced media missing from archive: ${name}`)
            continue
        }
        fs.writeFileSync(path.join(mediaDir, name), Buffer.from(source.asUint8Array()))
    }

    return {
        emu: { width: emuWidth, height: emuHeight },
        pixels: slidePx,
        inches: {
            width: Number((emuWidth / EMU_PER_INCH).toFixed(2)),
            height: Number((emuHeight / EMU_PER_INCH).toFixed(2)),
        },
        pixelsPerPoint: Number(((outputWidth * EMU_PER_POINT) / emuWidth).toFixed(6)),
        layouts,
        usedMedia,
    }
}

function main() {
    const slideMap = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'slide-map.json'), 'utf-8'))

    fs.rmSync(MEDIA_OUT, { recursive: true, force: true })

    const output: Record<string, unknown> = {
        _comment:
            'Generated by scripts/extract-certificate-layouts.ts from the .pptx templates. ' +
            'Do not hand-edit — re-run the script instead. Coordinates and sizes are pixels ' +
            'at the recorded output width; font sizes are points, scaled by pixelsPerPoint. ' +
            'Elements are in back-to-front draw order. Artwork is unpacked to media/<type>/.',
    }

    for (const type of ['promotion', 'award'] as const) {
        const spec = slideMap[type]
        const outputWidth = OUTPUT_WIDTH[type]!
        const mediaDir = path.join(MEDIA_OUT, type)
        const extracted = extractTemplate(path.join(TEMPLATES, spec.template), outputWidth, mediaDir)

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
            pixelsPerPoint: extracted.pixelsPerPoint,
            mediaDir: `media/${type}`,
            certificates: byCode,
        }

        const counts = Object.values(byCode).reduce(
            (acc, l) => {
                for (const el of l.elements) acc[el.kind]++
                return acc
            },
            { picture: 0, text: 0, line: 0 },
        )
        const rotated = Object.values(byCode).reduce(
            (n, l) => n + l.elements.filter(e => e.rotation !== 0).length,
            0,
        )

        console.log(
            `${type.padEnd(9)} ${spec.template.padEnd(20)} ` +
            `${Object.keys(extracted.layouts).length} slides, ${Object.keys(byCode).length} codes, ` +
            `${counts.text} text + ${counts.picture} picture (${rotated} rotated) + ${counts.line} line elements, ` +
            `${extracted.usedMedia.size} media files, ${extracted.pixels.w}x${extracted.pixels.h}px`,
        )
        if (missing.length) console.warn(`  codes with no slide: ${missing.join(', ')}`)
    }

    fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n')
    console.log(`\nwrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`)
}

main()
