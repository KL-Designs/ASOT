/**
 * lib/operations/import/parse-docx.ts
 *
 * Parses a DOCX file into an IntermediateDoc using mammoth.
 * Images are extracted and referenced by tempId placeholders.
 * HTML parsing uses a simple regex/string approach — no jsdom or cheerio.
 */

import mammoth from 'mammoth'

export interface ExtractedImage {
    tempId: string
    buffer: Buffer
    mimeType: string
    ext: string
    positionIndex: number
    captionText?: string
}

export interface TextRun {
    text: string
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    color?: string        // normalized hex like '#ff0000'
    highlight?: boolean   // any background highlight color
    fontSize?: string     // like '14px'
    linkHref?: string
}

export type IntermediateElement =
    | { type: 'heading'; level: 1|2|3|4|5|6; text: string; rawHtml: string }
    | { type: 'paragraph'; text: string; rawHtml: string; bold?: boolean; italic?: boolean; underline?: boolean; runs?: TextRun[] }
    | { type: 'list'; ordered: boolean; items: string[]; itemRuns?: TextRun[][] }
    | { type: 'table'; rows: string[][]; cells?: TextRun[][][]; hasHeaderRow?: boolean }
    | { type: 'image_ref'; tempId: string }
    | { type: 'hr' }

export interface IntermediateDoc {
    title: string
    elements: IntermediateElement[]
    extractedImages: ExtractedImage[]
    warnings: string[]
}

function stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

function getInnerHtml(tag: string, html: string): string {
    const start = html.indexOf('>')
    if (start === -1) return ''
    return html.slice(start + 1, html.lastIndexOf('</' + tag))
}

function mimeToExt(mimeType: string): string {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
    if (mimeType === 'image/png') return 'png'
    if (mimeType === 'image/gif') return 'gif'
    if (mimeType === 'image/webp') return 'webp'
    return 'jpg'
}

function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
}

/** Converts a CSS color value to a lowercase hex string, or '' if unrecognised. */
function normalizeColor(css: string): string {
    const trimmed = css.trim().toLowerCase()

    // Already hex (#rrggbb or #rgb)
    const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
    if (hexMatch) {
        const h = hexMatch[1]
        if (h.length === 3) {
            return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
        }
        return '#' + h
    }

    // rgb(r, g, b)
    const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0')
        const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0')
        const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0')
        return '#' + r + g + b
    }

    // Named colors
    const namedColors: Record<string, string> = {
        red: '#ff0000',
        blue: '#0000ff',
        green: '#008000',
        yellow: '#ffff00',
        black: '#000000',
        white: '#ffffff',
        gray: '#808080',
        grey: '#808080',
        orange: '#ffa500',
        purple: '#800080',
    }
    if (trimmed in namedColors) return namedColors[trimmed]

    return ''
}

/** Converts a CSS font-size value to a px string, or '' if unrecognised. */
function normalizeFontSize(css: string): string {
    const trimmed = css.trim()

    const ptMatch = trimmed.match(/^([\d.]+)pt$/)
    if (ptMatch) {
        const px = Math.round(parseFloat(ptMatch[1]) * 1.333)
        return px + 'px'
    }

    const pxMatch = trimmed.match(/^[\d.]+px$/)
    if (pxMatch) return trimmed

    return ''
}

interface RunState {
    bold: boolean
    italic: boolean
    underline: boolean
    strike: boolean
    color: string
    highlight: boolean
    fontSize: string
    linkHref: string
}

/** Parses inline HTML into an array of TextRun objects with marks. */
export function htmlToRuns(html: string): TextRun[] {
    const runs: TextRun[] = []

    const state: RunState = {
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        color: '',
        highlight: false,
        fontSize: '',
        linkHref: '',
    }

    const stack: RunState[] = []

    function saveState(): RunState {
        return { ...state }
    }

    function pushState() {
        stack.push(saveState())
    }

    function popState() {
        const prev = stack.pop()
        if (prev) {
            state.bold = prev.bold
            state.italic = prev.italic
            state.underline = prev.underline
            state.strike = prev.strike
            state.color = prev.color
            state.highlight = prev.highlight
            state.fontSize = prev.fontSize
            state.linkHref = prev.linkHref
        }
    }

    function emitText(raw: string) {
        const text = decodeEntities(raw)
        if (!text) return
        runs.push({
            text,
            ...(state.bold ? { bold: true } : {}),
            ...(state.italic ? { italic: true } : {}),
            ...(state.underline ? { underline: true } : {}),
            ...(state.strike ? { strikethrough: true } : {}),
            ...(state.color ? { color: state.color } : {}),
            ...(state.highlight ? { highlight: true } : {}),
            ...(state.fontSize ? { fontSize: state.fontSize } : {}),
            ...(state.linkHref ? { linkHref: state.linkHref } : {}),
        })
    }

    // Parse style attribute for color / background-color / font-size
    function applyStyle(styleAttr: string) {
        const decls = styleAttr.split(';')
        for (const decl of decls) {
            const colonIdx = decl.indexOf(':')
            if (colonIdx === -1) continue
            const prop = decl.slice(0, colonIdx).trim().toLowerCase()
            const val = decl.slice(colonIdx + 1).trim()
            if (prop === 'color') {
                const normalized = normalizeColor(val)
                if (normalized) state.color = normalized
            } else if (prop === 'background-color' || prop === 'background') {
                const normalized = normalizeColor(val)
                if (normalized) state.highlight = true
            } else if (prop === 'font-size') {
                const normalized = normalizeFontSize(val)
                if (normalized) state.fontSize = normalized
            }
        }
    }

    let pos = 0
    const len = html.length

    while (pos < len) {
        if (html[pos] !== '<') {
            // Text content — find next tag or end
            let end = pos
            while (end < len && html[end] !== '<') end++
            emitText(html.slice(pos, end))
            pos = end
            continue
        }

        // We're at a '<'
        const tagEnd = html.indexOf('>', pos)
        if (tagEnd === -1) {
            // Malformed — treat rest as text
            emitText(html.slice(pos))
            break
        }

        const tagContent = html.slice(pos + 1, tagEnd)
        pos = tagEnd + 1

        // Closing tag?
        if (tagContent.startsWith('/')) {
            const closingTag = tagContent.slice(1).trim().toLowerCase().split(/\s/)[0]
            // br doesn't use a stack
            if (closingTag !== 'br') {
                popState()
            }
            continue
        }

        // Self-closing or void?
        const isSelfClosing = tagContent.endsWith('/')
        const tagBody = isSelfClosing ? tagContent.slice(0, -1) : tagContent
        const tagNameMatch = tagBody.match(/^([a-zA-Z][a-zA-Z0-9]*)/)
        if (!tagNameMatch) continue
        const tagName = tagNameMatch[1].toLowerCase()

        if (tagName === 'br') {
            runs.push({ text: '\n' })
            continue
        }

        // Parse attributes from tagBody
        const attrStr = tagBody.slice(tagName.length)

        // Extract href for anchor tags
        const hrefMatch = attrStr.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/)
        const styleMatch = attrStr.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/)

        if (!isSelfClosing) {
            pushState()
        }

        // Apply marks based on tag name
        switch (tagName) {
            case 'strong':
            case 'b':
                state.bold = true
                break
            case 'em':
            case 'i':
                state.italic = true
                break
            case 'u':
                state.underline = true
                break
            case 's':
            case 'del':
            case 'strike':
                state.strike = true
                break
            case 'a':
                if (hrefMatch) {
                    state.linkHref = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? ''
                }
                break
            case 'span':
                if (styleMatch) {
                    applyStyle(styleMatch[1] ?? styleMatch[2] ?? '')
                }
                break
        }
    }

    // Merge adjacent runs with identical marks
    if (runs.length === 0) return runs

    const merged: TextRun[] = [runs[0]]
    for (let i = 1; i < runs.length; i++) {
        const prev = merged[merged.length - 1]
        const curr = runs[i]
        if (
            prev.bold === curr.bold &&
            prev.italic === curr.italic &&
            prev.underline === curr.underline &&
            prev.strikethrough === curr.strikethrough &&
            prev.color === curr.color &&
            prev.highlight === curr.highlight &&
            prev.fontSize === curr.fontSize &&
            prev.linkHref === curr.linkHref
        ) {
            prev.text += curr.text
        } else {
            merged.push(curr)
        }
    }

    return merged
}

function parseHtmlToElements(html: string, extractedImages: ExtractedImage[]): IntermediateElement[] {
    const elements: IntermediateElement[] = []

    // Normalise line endings
    const normalized = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // Split into top-level block tokens
    // We walk char by char to find balanced tags at the top level
    let pos = 0
    const len = normalized.length

    while (pos < len) {
        // Skip whitespace between blocks
        while (pos < len && /\s/.test(normalized[pos])) pos++
        if (pos >= len) break

        if (normalized[pos] !== '<') {
            // bare text node — wrap as paragraph
            const end = normalized.indexOf('<', pos)
            const text = end === -1 ? normalized.slice(pos).trim() : normalized.slice(pos, end).trim()
            if (text) elements.push({ type: 'paragraph', text, rawHtml: text, runs: [{ text }] })
            pos = end === -1 ? len : end
            continue
        }

        // Find the tag name
        const tagStart = pos
        const tagNameMatch = normalized.slice(pos + 1).match(/^([a-zA-Z][a-zA-Z0-9]*)/)
        if (!tagNameMatch) { pos++; continue }
        const tagName = tagNameMatch[1].toLowerCase()

        // Self-closing or void tags
        if (tagName === 'hr' || tagName === 'br') {
            const end = normalized.indexOf('>', pos)
            if (end === -1) { pos++; continue }
            if (tagName === 'hr') elements.push({ type: 'hr' })
            pos = end + 1
            continue
        }

        // Find the matching closing tag (simple balanced search)
        // For block-level elements we need to find </tagName>
        const closeTag = `</${tagName}>`
        let depth = 1
        let searchPos = pos + 1
        while (depth > 0 && searchPos < len) {
            const nextOpen = normalized.indexOf(`<${tagName}`, searchPos)
            const nextClose = normalized.indexOf(closeTag, searchPos)
            if (nextClose === -1) break
            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth++
                searchPos = nextOpen + 1
            } else {
                depth--
                searchPos = nextClose + closeTag.length
            }
        }

        const blockEnd = searchPos
        const blockHtml = normalized.slice(tagStart, blockEnd)

        // Parse headings
        const headingMatch = tagName.match(/^h([1-6])$/)
        if (headingMatch) {
            const level = parseInt(headingMatch[1]) as 1|2|3|4|5|6
            const text = stripTags(blockHtml)
            if (text) elements.push({ type: 'heading', level, text, rawHtml: blockHtml })
            pos = blockEnd
            continue
        }

        // Parse paragraphs
        if (tagName === 'p') {
            // Check for image refs inside paragraph
            if (blockHtml.includes('data-img-tempid=')) {
                const imgMatch = blockHtml.match(/data-img-tempid="([^"]+)"/)
                if (imgMatch) {
                    elements.push({ type: 'image_ref', tempId: imgMatch[1] })
                    pos = blockEnd
                    continue
                }
            }

            const text = stripTags(blockHtml)
            if (!text) { pos = blockEnd; continue }

            const inner = getInnerHtml('p', blockHtml)
            const bold = /<strong>/i.test(inner)
            const italic = /<em>/i.test(inner)
            const underline = /<u>/i.test(inner)
            const runs = htmlToRuns(inner)
            elements.push({ type: 'paragraph', text, rawHtml: blockHtml, bold, italic, underline, runs })
            pos = blockEnd
            continue
        }

        // Parse unordered lists
        if (tagName === 'ul') {
            const items: string[] = []
            const itemRuns: TextRun[][] = []
            const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
            let m: RegExpExecArray | null
            while ((m = liPattern.exec(blockHtml)) !== null) {
                const liInner = m[1]
                const runs = htmlToRuns(liInner)
                const text = runs.map(r => r.text).join('').trim()
                if (text) {
                    items.push(text)
                    itemRuns.push(runs)
                }
            }
            if (items.length) elements.push({ type: 'list', ordered: false, items, itemRuns })
            pos = blockEnd
            continue
        }

        // Parse ordered lists
        if (tagName === 'ol') {
            const items: string[] = []
            const itemRuns: TextRun[][] = []
            const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
            let m: RegExpExecArray | null
            while ((m = liPattern.exec(blockHtml)) !== null) {
                const liInner = m[1]
                const runs = htmlToRuns(liInner)
                const text = runs.map(r => r.text).join('').trim()
                if (text) {
                    items.push(text)
                    itemRuns.push(runs)
                }
            }
            if (items.length) elements.push({ type: 'list', ordered: true, items, itemRuns })
            pos = blockEnd
            continue
        }

        // Parse tables
        if (tagName === 'table') {
            const rows: string[][] = []
            const cells: TextRun[][][] = []

            // Detect header row: check if first <tr> contains any <th>
            let hasHeaderRow = false
            const firstTrMatch = blockHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)
            if (firstTrMatch && /<th[^>]*>/i.test(firstTrMatch[1])) {
                hasHeaderRow = true
            }

            const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
            let trMatch: RegExpExecArray | null
            while ((trMatch = trPattern.exec(blockHtml)) !== null) {
                const rowPlainCells: string[] = []
                const rowRunCells: TextRun[][] = []
                const tdPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
                let tdMatch: RegExpExecArray | null
                while ((tdMatch = tdPattern.exec(trMatch[1])) !== null) {
                    const cellInner = tdMatch[1]
                    const cellRuns = htmlToRuns(cellInner)
                    const cellText = stripTags(cellInner).trim()
                    rowPlainCells.push(cellText)
                    rowRunCells.push(cellRuns)
                }
                if (rowPlainCells.length) {
                    rows.push(rowPlainCells)
                    cells.push(rowRunCells)
                }
            }
            if (rows.length) elements.push({ type: 'table', rows, cells, hasHeaderRow })
            pos = blockEnd
            continue
        }

        // Unknown tag — skip
        pos = blockEnd
    }

    // Post-process: assign captions to images
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        if (el.type === 'image_ref') {
            const img = extractedImages.find(img => img.tempId === el.tempId)
            if (!img) continue
            // Look at adjacent paragraphs for caption text
            const prev = elements[i - 1]
            const next = elements[i + 1]
            const candidateCaption = (next?.type === 'paragraph' && next.text.length < 200)
                ? next.text
                : (prev?.type === 'paragraph' && prev.text.length < 200)
                    ? prev.text
                    : undefined
            if (candidateCaption) img.captionText = candidateCaption
        }
    }

    return elements
}

export async function parseDocx(buffer: Buffer, filename: string): Promise<IntermediateDoc> {
    const extractedImages: ExtractedImage[] = []
    let imageCounter = 0

    const result = await mammoth.convertToHtml(
        { buffer },
        {
            includeDefaultStyleMap: true,
            convertImage: mammoth.images.imgElement(async (image) => {
                const tempId = `img_${imageCounter++}`
                const mimeType = image.contentType || 'image/jpeg'
                const ext = mimeToExt(mimeType)
                const imgBuffer = Buffer.from(await image.read())

                extractedImages.push({
                    tempId,
                    buffer: imgBuffer,
                    mimeType,
                    ext,
                    positionIndex: 0, // updated after element parsing
                })

                return { src: '', 'data-img-tempid': tempId }
            }),
        }
    )

    const html = result.value
    const warnings: string[] = result.messages
        .filter(m => m.type === 'warning')
        .map(m => m.message)

    const elements = parseHtmlToElements(html, extractedImages)

    // Update positionIndex on each extracted image
    for (const img of extractedImages) {
        const idx = elements.findIndex(el => el.type === 'image_ref' && el.tempId === img.tempId)
        img.positionIndex = idx === -1 ? 0 : idx
    }

    // Derive title from first H1 or filename
    const firstH1 = elements.find(el => el.type === 'heading' && el.level === 1)
    const title = (firstH1 && firstH1.type === 'heading') ? firstH1.text : filename.replace(/\.docx$/i, '')

    return { title, elements, extractedImages, warnings }
}
