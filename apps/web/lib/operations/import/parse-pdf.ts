/**
 * lib/operations/import/parse-pdf.ts
 *
 * Parses a PDF file into an IntermediateDoc using pdf-parse.
 * Image extraction is not supported for PDFs — a warning is added.
 * Heading detection is heuristic: ALL CAPS short lines, SMEAC keywords, indentation.
 */

import { PDFParse } from 'pdf-parse'
import type { IntermediateDoc, IntermediateElement } from './parse-docx'

const SMEAC_KEYWORDS = [
    'situation',
    'mission',
    'execution',
    'administration',
    'admin',
    'logistics',
    'admin & log',
    'admin and log',
    'command',
    'signals',
    'command & sig',
    'command and sig',
    'comms',
]

function isAllCaps(line: string): boolean {
    const stripped = line.replace(/[^a-zA-Z]/g, '')
    return stripped.length > 0 && stripped === stripped.toUpperCase()
}

function isSmeacKeyword(line: string): boolean {
    const lower = line.toLowerCase().trim()
    return SMEAC_KEYWORDS.some(kw => lower === kw || lower.startsWith(kw + ':') || lower.startsWith(kw + ' '))
}

function detectIndentLevel(line: string): number {
    let spaces = 0
    for (const ch of line) {
        if (ch === ' ') spaces++
        else if (ch === '\t') spaces += 4
        else break
    }
    return spaces
}

function looksLikeListItem(line: string): boolean {
    const trimmed = line.trimStart()
    return /^[-*•·]\s/.test(trimmed) || /^[a-z]\.\s/.test(trimmed) || /^\(\d+\)\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)
}

export async function parsePdf(buffer: Buffer, filename: string): Promise<IntermediateDoc> {
    const warnings: string[] = [
        'PDF image extraction is not supported — images must be added manually after import.',
    ]

    let rawText = ''
    try {
        const parser = new PDFParse({ data: buffer })
        const result = await parser.getText()
        rawText = result.text
    } catch (err) {
        warnings.push(`PDF parsing error: ${err instanceof Error ? err.message : String(err)}`)
        return {
            title: filename.replace(/\.pdf$/i, ''),
            elements: [],
            extractedImages: [],
            warnings,
        }
    }

    const lines = rawText.split('\n')
    const elements: IntermediateElement[] = []

    // State for collecting list items
    let currentListItems: string[] = []
    let currentListOrdered = false

    function flushList() {
        if (currentListItems.length > 0) {
            elements.push({ type: 'list', ordered: currentListOrdered, items: [...currentListItems] })
            currentListItems = []
        }
    }

    // Collect paragraphs: accumulate consecutive non-blank, non-heading lines
    let paragraphLines: string[] = []

    function flushParagraph() {
        if (paragraphLines.length > 0) {
            const text = paragraphLines.join(' ').trim()
            if (text) elements.push({ type: 'paragraph', text, rawHtml: text })
            paragraphLines = []
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i]
        const trimmed = rawLine.trim()

        // Blank line: flush accumulated content
        if (!trimmed) {
            flushList()
            flushParagraph()
            continue
        }

        // Check for SMEAC keyword heading (highest priority)
        if (isSmeacKeyword(trimmed)) {
            flushList()
            flushParagraph()
            elements.push({ type: 'heading', level: 2, text: trimmed, rawHtml: trimmed })
            continue
        }

        // Check for all-caps short line (likely heading)
        if (isAllCaps(trimmed) && trimmed.length <= 80 && trimmed.length >= 3) {
            flushList()
            flushParagraph()
            const level = trimmed.length <= 30 ? 2 : 3
            elements.push({ type: 'heading', level, text: trimmed, rawHtml: trimmed })
            continue
        }

        // Check for list item
        if (looksLikeListItem(rawLine)) {
            flushParagraph()
            const text = trimmed.replace(/^[-*•·]\s+/, '').replace(/^[a-z]\.\s+/, '').replace(/^\(\d+\)\s+/, '').replace(/^\d+\.\s+/, '').trim()
            const isOrdered = /^\d+\./.test(trimmed) || /^\([0-9]/.test(trimmed)
            if (currentListItems.length > 0 && currentListOrdered !== isOrdered) {
                flushList()
            }
            currentListOrdered = isOrdered
            if (text) currentListItems.push(text)
            continue
        }

        // Indented continuation line — could be sub-heading or continuation
        const indent = detectIndentLevel(rawLine)
        if (indent >= 8) {
            // Deeper indent: likely a sub-paragraph or sub-list continuation
            if (trimmed.length <= 60 && isAllCaps(trimmed)) {
                flushList()
                flushParagraph()
                elements.push({ type: 'heading', level: 4, text: trimmed, rawHtml: trimmed })
                continue
            }
            // Otherwise append to paragraph
            flushList()
            paragraphLines.push(trimmed)
            continue
        }

        // Regular text line
        flushList()
        paragraphLines.push(trimmed)
    }

    // Flush anything remaining
    flushList()
    flushParagraph()

    // Derive title from first heading or filename
    const firstHeading = elements.find(el => el.type === 'heading')
    const title = (firstHeading && firstHeading.type === 'heading')
        ? firstHeading.text
        : filename.replace(/\.pdf$/i, '')

    return { title, elements, extractedImages: [], warnings }
}
