/**
 * Certificate rendering.
 *
 * Replaces the original's docxtemplater → LibreOffice → PDF → ImageMagick
 * pipeline, which filled every slide of a 158-slide deck, converted the whole
 * file, and threw away all but one page. That cost 3–6 seconds per certificate
 * and raced on a single shared `output.pptx`; see PLAN.md §11.
 *
 * Here the templates have already been reduced to `certificate-layouts.json` by
 * scripts/extract-certificate-layouts.ts at build time, so this draws text onto
 * art and nothing else. No .pptx is opened at runtime and no shell is invoked.
 *
 * Layer order is taken from the 343 existing reference renders, not from the
 * sketch in §4 — which had the frame under the parchment, named a file that
 * does not appear, and omitted two layers entirely.
 */

import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'
import fs from 'fs'
import path from 'path'
import { ASSETS } from '../assets'
import { load, MissingAssetError } from './layers'
import type { CertificatePayload } from '../schema'

// ── Fonts ────────────────────────────────────────────────────────────────────
// Registered under the exact typeface names the slides ask for, so a run's
// `font` can be used verbatim. All three bundled faces are in use: Times New
// Roman for body copy, Old English Text MT for titles, Brush Script MT for the
// signature.

const FONT_FILES: Record<string, string> = {
    'Times New Roman': 'times.ttf',
    'Old English Text MT': 'OLDENGL.TTF',
    'Brush Script MT': 'brushsci.ttf',
}

for (const [family, file] of Object.entries(FONT_FILES)) {
    const full = path.join(ASSETS, 'fonts', file)
    if (fs.existsSync(full)) GlobalFonts.registerFromPath(full, family)
}

// ── Art ──────────────────────────────────────────────────────────────────────

const CERT_ART = path.join(ASSETS, 'imge', 'Certificates')

const art = {
    frame: path.join(CERT_ART, 'Frame.png'),
    parchment: path.join(CERT_ART, 'Background.jpg'),
    scrollwork: path.join(CERT_ART, '1011-10110075_decorative-frame-border-png-clip-art-image-gallery.png'),
    risingSun: path.join(CERT_ART, 'Untitled2.png'),
    waxSeal: path.join(CERT_ART, 'WaxSealGold.png'),
} as const

/**
 * How far the parchment field is inset from the canvas edge, as a fraction of
 * the canvas — i.e. how much of the frame moulding shows. Measured off the
 * reference renders.
 */
const FRAME_INSET = 0.055

/** Rising Sun badge: width as a fraction of the canvas, and its top margin. */
const SUN_WIDTH = 0.24
const SUN_TOP = 0.105

/** Wax seal: width as a fraction of the canvas, and its bottom-left position. */
const SEAL_WIDTH = 0.16
const SEAL_LEFT = 0.16
const SEAL_BOTTOM = 0.115

// ── Layouts ──────────────────────────────────────────────────────────────────

interface Run {
    text: string
    size: number
    bold: boolean
    italic: boolean
    color: string
    font: string
}
interface Paragraph { align: string; runs: Run[] }
interface Shape {
    x: number; y: number; width: number; height: number
    anchor: string
    insets: { left: number; top: number; right: number; bottom: number }
    paragraphs: Paragraph[]
}
interface SlideLayout { slide: number; width: number; height: number; shapes: Shape[] }
interface TypeLayouts {
    template: string
    emu: { width: number; height: number }
    pixels: { w: number; h: number }
    certificates: Record<string, SlideLayout>
}

const layouts = JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'templates', 'certificate-layouts.json'), 'utf-8'),
) as { promotion: TypeLayouts; award: TypeLayouts }

/**
 * Pixels per point for a template. Slide coordinates were scaled to the output
 * width at extraction time, but font sizes were left in points, so they need
 * the same scale applied here. 12700 EMU per point.
 */
function pixelsPerPoint(type: 'promotion' | 'award'): number {
    const spec = layouts[type]
    return (spec.pixels.w * 12700) / spec.emu.width
}

// ── Text layout ──────────────────────────────────────────────────────────────

/** Line height as a multiple of font size. The templates all use 100% line spacing. */
const LINE_HEIGHT = 1.2

interface Piece { text: string; run: Run; width: number }

function fontSpec(run: Run, pxPerPt: number): string {
    const style = run.italic ? 'italic ' : ''
    const weight = run.bold ? 'bold ' : ''
    return `${style}${weight}${(run.size * pxPerPt).toFixed(1)}px "${run.font}"`
}

/**
 * Breaks a paragraph into drawable lines, honouring both explicit line breaks
 * (the `\n` the extractor preserves from `<a:br/>`) and word wrapping at the
 * shape's content width. Runs are kept intact within a line so each keeps its
 * own font, size and colour.
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
        ctx.font = fontSpec(run, pxPerPt)

        // Split on explicit breaks first, then wrap each segment on whitespace.
        const segments = run.text.split('\n')
        for (const [index, segment] of segments.entries()) {
            if (index > 0) push()
            if (segment === '') continue

            // Keep the trailing space with its word so widths stay accurate.
            const words = segment.match(/\S+\s*|\s+/g) ?? []
            for (const word of words) {
                const width = ctx.measureText(word).width
                if (lineWidth > 0 && lineWidth + width > maxWidth) push()
                ctx.font = fontSpec(run, pxPerPt)
                line.push({ text: word, run, width })
                lineWidth += width
            }
        }
    }

    if (line.length > 0) lines.push(line)
    return lines
}

function drawShape(ctx: SKRSContext2D, shape: Shape, pxPerPt: number) {
    const contentWidth = shape.width - shape.insets.left - shape.insets.right
    const left = shape.x + shape.insets.left
    let y = shape.y + shape.insets.top

    for (const paragraph of shape.paragraphs) {
        const lines = layoutParagraph(ctx, paragraph, contentWidth, pxPerPt)

        for (const line of lines) {
            // Trailing whitespace should not count toward centring.
            const width = line.reduce((sum, piece) => sum + piece.width, 0)
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
                ctx.fillText(piece.text, x, y)
                x += piece.width
            }

            y += tallest * (LINE_HEIGHT - 1)
        }
    }
}

// ── Placeholder substitution ─────────────────────────────────────────────────

/**
 * Fills `{name}`, `{date}` and friends. Unknown placeholders are left as-is
 * rather than blanked, so a template gaining a field shows up as visible text
 * in a review render instead of silently disappearing.
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

    const width = layout.width
    const height = layout.height
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    // 1. Wooden frame, stretched to the canvas. Neither output aspect matches
    //    the source exactly, so it is stretched in both orientations; the
    //    moulding's grain runs along each edge and survives it.
    ctx.drawImage(await load(art.frame), 0, 0, width, height)

    // 2. Parchment field inside the moulding.
    const inset = Math.round(Math.min(width, height) * FRAME_INSET)
    ctx.drawImage(await load(art.parchment), inset, inset, width - inset * 2, height - inset * 2)

    // 3. Gold scrollwork, inset the same amount.
    ctx.drawImage(await load(art.scrollwork), inset, inset, width - inset * 2, height - inset * 2)

    // 4. Rising Sun badge, centred at the top.
    const sun = await load(art.risingSun)
    const sunWidth = width * SUN_WIDTH
    const sunHeight = sunWidth * (sun.height / sun.width)
    ctx.drawImage(sun, (width - sunWidth) / 2, height * SUN_TOP, sunWidth, sunHeight)

    // 5. Text.
    const pxPerPt = pixelsPerPoint(payload.type)
    for (const shape of layout.shapes) {
        drawShape(
            ctx,
            {
                ...shape,
                paragraphs: shape.paragraphs.map(p => ({
                    ...p,
                    runs: p.runs.map(r => ({ ...r, text: fill(r.text, payload) })),
                })),
            },
            pxPerPt,
        )
    }

    // 6. Wax seal, bottom left.
    const seal = await load(art.waxSeal)
    const sealWidth = width * SEAL_WIDTH
    const sealHeight = sealWidth * (seal.height / seal.width)
    ctx.drawImage(seal, width * SEAL_LEFT - sealWidth / 2, height * (1 - SEAL_BOTTOM) - sealHeight, sealWidth, sealHeight)

    return canvas.toBuffer('image/png')
}

/** Certificate codes this service can render, for the boot-time preflight. */
export function certificateCodes(): { promotion: string[]; award: string[] } {
    return {
        promotion: Object.keys(layouts.promotion.certificates),
        award: Object.keys(layouts.award.certificates),
    }
}

/** Art files the certificate renderer needs. Checked at boot alongside the rest. */
export const certificateArt = Object.values(art)
