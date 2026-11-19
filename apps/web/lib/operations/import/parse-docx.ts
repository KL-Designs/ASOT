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

export type IntermediateElement =
    | { type: 'heading'; level: 1|2|3|4|5|6; text: string; rawHtml: string }
    | { type: 'paragraph'; text: string; rawHtml: string; bold?: boolean; italic?: boolean; underline?: boolean }
    | { type: 'list'; ordered: boolean; items: string[] }
    | { type: 'table'; rows: string[][] }
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
            if (text) elements.push({ type: 'paragraph', text, rawHtml: text })
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
            elements.push({ type: 'paragraph', text, rawHtml: blockHtml, bold, italic, underline })
            pos = blockEnd
            continue
        }

        // Parse unordered lists
        if (tagName === 'ul') {
            const items: string[] = []
            const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
            let m: RegExpExecArray | null
            while ((m = liPattern.exec(blockHtml)) !== null) {
                const text = stripTags(m[1]).trim()
                if (text) items.push(text)
            }
            if (items.length) elements.push({ type: 'list', ordered: false, items })
            pos = blockEnd
            continue
        }

        // Parse ordered lists
        if (tagName === 'ol') {
            const items: string[] = []
            const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
            let m: RegExpExecArray | null
            while ((m = liPattern.exec(blockHtml)) !== null) {
                const text = stripTags(m[1]).trim()
                if (text) items.push(text)
            }
            if (items.length) elements.push({ type: 'list', ordered: true, items })
            pos = blockEnd
            continue
        }

        // Parse tables
        if (tagName === 'table') {
            const rows: string[][] = []
            const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
            let trMatch: RegExpExecArray | null
            while ((trMatch = trPattern.exec(blockHtml)) !== null) {
                const cells: string[] = []
                const tdPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
                let tdMatch: RegExpExecArray | null
                while ((tdMatch = tdPattern.exec(trMatch[1])) !== null) {
                    cells.push(stripTags(tdMatch[1]).trim())
                }
                if (cells.length) rows.push(cells)
            }
            if (rows.length) elements.push({ type: 'table', rows })
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
