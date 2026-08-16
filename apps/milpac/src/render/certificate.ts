/**
 * Certificate rendering.
 *
 * Replaces the original's docxtemplater → LibreOffice → PDF → ImageMagick
 * pipeline, which filled every slide of a 158-slide deck, converted the whole
 * file, and threw away all but one page. That cost 3–6 seconds per certificate
 * and raced on a single shared `output.pptx`; see PLAN.md §11.
 *
 * Nothing here is positioned by hand. Both the artwork and the text come from
 * `certificate-layouts.json`, which scripts/extract-certificate-layouts.ts
 * derives from the templates at build time — including each element's rotation,
 * which matters because the parchment and the wooden frame are landscape images
 * rotated 90° onto the portrait canvas rather than stretched onto it. An
 * earlier pass placed them with hand-tuned fractions of the canvas and got a
 * squashed frame and an overbearing flag for its trouble.
 */

import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'
import fs from 'fs'
import path from 'path'
import { ASSETS } from '../assets'
import { load, MissingAssetError } from './layers'
import type { CertificatePayload } from '../schema'

// ── Fonts ────────────────────────────────────────────────────────────────────
// Registered under the exact typeface names the slides ask for, so a run's
// `font` is used verbatim. All three bundled faces are in use: Times New Roman
// for body copy, Old English Text MT for titles, Brush Script MT for signatures.

const FONT_FILES: Record<string, string> = {
    'Times New Roman': 'times.ttf',
    'Old English Text MT': 'OLDENGL.TTF',
    'Brush Script MT': 'brushsci.ttf',
}

for (const [family, file] of Object.entries(FONT_FILES)) {
    const full = path.join(ASSETS, 'fonts', file)
    if (fs.existsSync(full)) GlobalFonts.registerFromPath(full, family)
}

// ── Layouts ──────────────────────────────────────────────────────────────────

interface Run {
    text: string
    size: number
    bold: boolean
    italic: boolean
    /** Percent of em to raise the baseline. Positive is superscript. */
    baseline: number
    color: string
    font: string
}
interface Paragraph { align: string; runs: Run[] }

interface Frame {
    x: number; y: number; width: number; height: number
    rotation: number; flipH: boolean; flipV: boolean
}
interface PictureElement extends Frame {
    kind: 'picture'
    media: string
    /** Source crop as fractions of the image, applied before the fit. */
    crop: { left: number; top: number; right: number; bottom: number } | null
}
interface TextElement extends Frame {
    kind: 'text'
    anchor: string
    insets: { left: number; top: number; right: number; bottom: number }
    paragraphs: Paragraph[]
}
/** A stroked connector — the rule beneath the signature. */
interface LineElement extends Frame {
    kind: 'line'
    thickness: number
    color: string
}
type Element = PictureElement | TextElement | LineElement

interface SlideLayout { slide: number; width: number; height: number; elements: Element[] }
interface TypeLayouts {
    template: string
    pixelsPerPoint: number
    mediaDir: string
    certificates: Record<string, SlideLayout>
}

const TEMPLATES = path.join(ASSETS, 'templates')

const layouts = JSON.parse(
    fs.readFileSync(path.join(TEMPLATES, 'certificate-layouts.json'), 'utf-8'),
) as { promotion: TypeLayouts; award: TypeLayouts }

// ── Text layout ──────────────────────────────────────────────────────────────

/** Line height as a multiple of font size. The templates all use 100% spacing. */
const LINE_HEIGHT = 1.2

/** Superscript runs are drawn at this fraction of their nominal size. */
const SUPERSCRIPT_SCALE = 0.65

interface Piece { text: string; run: Run; width: number }

function pointSize(run: Run, pxPerPt: number): number {
    const base = run.size * pxPerPt
    return run.baseline !== 0 ? base * SUPERSCRIPT_SCALE : base
}

function fontSpec(run: Run, pxPerPt: number): string {
    const style = run.italic ? 'italic ' : ''
    const weight = run.bold ? 'bold ' : ''
    return `${style}${weight}${pointSize(run, pxPerPt).toFixed(1)}px "${run.font}"`
}

/**
 * Breaks a paragraph into drawable lines, honouring both explicit breaks (the
 * `\n` the extractor preserves from `<a:br/>`) and word wrapping at the shape's
 * content width. Runs stay intact within a line so each keeps its own face,
 * size and colour.
 */
function layoutParagraph(
    ctx: SKRSContext2D,
    paragraph: Paragraph,
    maxWidth: number,
    pxPerPt: number,
): Piece[][] {
    const lines: Piece[][] = []
    let line: Piece[] = []
    let lineWidth = 0

    const push = () => {
        lines.push(line)
        line = []
        lineWidth = 0
    }

    for (const run of paragraph.runs) {
        const segments = run.text.split('\n')
        for (const [index, segment] of segments.entries()) {
            if (index > 0) push()
            if (segment === '') continue

            // Keep each trailing space with its word so measured widths line up
            // with what is actually drawn.
            const words = segment.match(/\S+\s*|\s+/g) ?? []
            for (const word of words) {
                ctx.font = fontSpec(run, pxPerPt)
                const width = ctx.measureText(word).width
                if (lineWidth > 0 && lineWidth + width > maxWidth) push()
                line.push({ text: word, run, width })
                lineWidth += width
            }
        }
    }

    if (line.length > 0) lines.push(line)
    return lines
}

function drawText(ctx: SKRSContext2D, element: TextElement, pxPerPt: number) {
    const contentWidth = element.width - element.insets.left - element.insets.right
    const left = element.x + element.insets.left
    let y = element.y + element.insets.top

    for (const paragraph of element.paragraphs) {
        for (const line of layoutParagraph(ctx, paragraph, contentWidth, pxPerPt)) {
            const width = line.reduce((sum, piece) => sum + piece.width, 0)
            // Line height follows the nominal size, so a superscript run does
            // not shrink the line it sits on.
            const tallest = line.reduce((max, piece) => Math.max(max, piece.run.size), 0) * pxPerPt
            y += tallest

            let x = paragraph.align === 'ctr' ? left + (contentWidth - width) / 2
                : paragraph.align === 'r' ? left + contentWidth - width
                : left

            for (const piece of line) {
                ctx.font = fontSpec(piece.run, pxPerPt)
                ctx.fillStyle = `#${piece.run.color}`
                ctx.textAlign = 'left'
                ctx.textBaseline = 'alphabetic'
                const rise = piece.run.baseline !== 0
                    ? (piece.run.size * pxPerPt * piece.run.baseline) / 100
                    : 0
                ctx.fillText(piece.text, x, y - rise)
                x += piece.width
            }

            y += tallest * (LINE_HEIGHT - 1)
        }
    }
}

// ── Picture drawing ──────────────────────────────────────────────────────────

/**
 * Draws a picture honouring its transform and source crop.
 *
 * OOXML gives the *unrotated* bounding box and rotates about its centre, which
 * is why this translates to the centre before rotating and draws the image
 * centred on the origin.
 *
 * The crop matters more than it looks: the wooden frame art carries about 12%
 * transparent padding, and the slide trims it with a `srcRect` so the moulding
 * bleeds to the edge. Ignoring the crop renders the frame floating inside the
 * certificate with parchment visible around it.
 */
async function drawPicture(ctx: SKRSContext2D, element: PictureElement, mediaDir: string) {
    const file = path.join(mediaDir, element.media)
    if (!fs.existsSync(file)) throw new MissingAssetError(`certificate-media/${element.media}`)

    const image = await load(file)

    const crop = element.crop
    const sx = crop ? image.width * crop.left : 0
    const sy = crop ? image.height * crop.top : 0
    const sw = crop ? image.width * (1 - crop.left - crop.right) : image.width
    const sh = crop ? image.height * (1 - crop.top - crop.bottom) : image.height

    ctx.save()
    ctx.translate(element.x + element.width / 2, element.y + element.height / 2)
    if (element.rotation !== 0) ctx.rotate((element.rotation * Math.PI) / 180)
    if (element.flipH || element.flipV) ctx.scale(element.flipH ? -1 : 1, element.flipV ? -1 : 1)
    ctx.drawImage(
        image,
        sx, sy, sw, sh,
        -element.width / 2, -element.height / 2, element.width, element.height,
    )
    ctx.restore()
}

// ── Lines ────────────────────────────────────────────────────────────────────

/**
 * Draws a connector across its bounding box.
 *
 * A `straightConnector1` runs corner to corner of its frame, so a horizontal
 * rule is a box a few EMU tall — `flipV` swaps which corners, which is the only
 * part of the transform that changes anything for a straight stroke.
 */
function drawLine(ctx: SKRSContext2D, element: LineElement): void {
    ctx.save()
    ctx.strokeStyle = `#${element.color}`
    ctx.lineWidth = element.thickness

    const x2 = element.x + element.width
    const [y1, y2] = element.flipV
        ? [element.y + element.height, element.y]
        : [element.y, element.y + element.height]

    ctx.beginPath()
    ctx.moveTo(element.x, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.restore()
}

// ── Placeholder substitution ─────────────────────────────────────────────────

/**
 * Fills `{name}`, `{date}` and friends. An unrecognised placeholder is left
 * as-is rather than blanked, so a template gaining a field shows up as visible
 * text in a review render instead of silently vanishing.
 */
function fill(text: string, payload: CertificatePayload): string {
    return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
        const value = (payload as unknown as Record<string, unknown>)[key]
        return typeof value === 'string' ? value : whole
    })
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function renderCertificate(payload: CertificatePayload): Promise<Buffer> {
    const spec = layouts[payload.type]
    const layout = spec.certificates[payload.cert]
    if (!layout) throw new MissingAssetError(`certificate/${payload.type}/${payload.cert}`)

    const canvas = createCanvas(layout.width, layout.height)
    const ctx = canvas.getContext('2d')
    const mediaDir = path.join(TEMPLATES, spec.mediaDir)

    // Elements are already in back-to-front order, so this is just the slide's
    // own z-order replayed.
    for (const element of layout.elements) {
        if (element.kind === 'picture') {
            await drawPicture(ctx, element, mediaDir)
            continue
        }

        if (element.kind === 'line') {
            drawLine(ctx, element)
            continue
        }

        drawText(
            ctx,
            {
                ...element,
                paragraphs: element.paragraphs.map(p => ({
                    ...p,
                    runs: p.runs.map(r => ({ ...r, text: fill(r.text, payload) })),
                })),
            },
            spec.pixelsPerPoint,
        )
    }

    return canvas.toBuffer('image/png')
}

/** Certificate codes this service can render, for the boot-time preflight. */
export function certificateCodes(): { promotion: string[]; award: string[] } {
    return {
        promotion: Object.keys(layouts.promotion.certificates),
        award: Object.keys(layouts.award.certificates),
    }
}
