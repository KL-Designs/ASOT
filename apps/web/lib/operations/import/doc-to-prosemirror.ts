/**
 * lib/operations/import/doc-to-prosemirror.ts
 *
 * Converts an IntermediateDoc into OperationSection[] with ProseMirror content.
 * SMEAC sections are detected by heading keywords.
 * Visibility rules are enforced: Execution, Admin & Log, Command & Sig are always private.
 */

import { randomUUID } from 'crypto'
import type { IntermediateDoc, IntermediateElement, TextRun } from './parse-docx'

export interface ConversionOptions {
    defaultVisibility?: Record<string, boolean>
}

type SmeacLabel = 'Situation' | 'Mission' | 'Execution' | 'Admin & Log' | 'Command & Sig'

const ALWAYS_PRIVATE: SmeacLabel[] = ['Execution', 'Admin & Log', 'Command & Sig']

function matchSmeacLabel(text: string): SmeacLabel | null {
    const lower = text.toLowerCase().trim()
    if (lower.includes('situation')) return 'Situation'
    if (lower.includes('mission')) return 'Mission'
    if (lower.includes('execution')) return 'Execution'
    if (
        lower.includes('admin') ||
        lower.includes('administration') ||
        lower.includes('logistics') ||
        lower === 'admin & log' ||
        lower === 'admin and log'
    ) return 'Admin & Log'
    if (
        lower.includes('command') ||
        lower.includes('signals') ||
        lower === 'command & sig' ||
        lower === 'command and sig' ||
        lower.includes('comms')
    ) return 'Command & Sig'
    return null
}

function isSmeacHeading(el: IntermediateElement): SmeacLabel | null {
    if (el.type !== 'heading') return null
    return matchSmeacLabel(el.text)
}

function clampHeadingLevel(level: number): 2|3|4 {
    if (level <= 2) return 2
    if (level >= 4) return 4
    return 3
}

function textNodeWithMarks(text: string, bold?: boolean, italic?: boolean, underline?: boolean): PMTextNode {
    const marks: PMMarkType[] = []
    if (bold) marks.push({ type: 'bold' })
    if (italic) marks.push({ type: 'italic' })
    if (underline) marks.push({ type: 'underline' })
    return { type: 'text', text, ...(marks.length ? { marks } : {}) }
}

function runsToPMContent(runs: TextRun[]): PMTextNode[] {
    return runs
        .filter(r => r.text.length > 0)
        .map(r => {
            const marks: PMMarkType[] = []
            if (r.bold) marks.push({ type: 'bold' })
            if (r.italic) marks.push({ type: 'italic' })
            if (r.underline) marks.push({ type: 'underline' })
            if (r.strikethrough) marks.push({ type: 'strike' })
            if (r.color || r.fontSize) {
                const attrs: Record<string, unknown> = {}
                if (r.color) attrs.color = r.color
                if (r.fontSize) attrs.fontSize = r.fontSize
                marks.push({ type: 'textStyle', attrs })
            }
            if (r.highlight) marks.push({ type: 'highlight' })
            if (r.linkHref) marks.push({ type: 'link', attrs: { href: r.linkHref, target: '_blank', rel: 'noopener noreferrer' } })
            return { type: 'text' as const, text: r.text, ...(marks.length ? { marks } : {}) }
        })
}

function elementToPMNodes(el: IntermediateElement, savedImages: Map<string, string>): PMBlockNode[] {
    switch (el.type) {
        case 'heading': {
            const level = clampHeadingLevel(el.level)
            const node: PMHeadingNode = {
                type: 'heading',
                attrs: { level },
                content: [{ type: 'text', text: el.text }],
            }
            return [node]
        }

        case 'paragraph': {
            if (!el.text.trim()) return []
            const content: PMTextNode[] = (el.runs && el.runs.length > 0)
                ? runsToPMContent(el.runs)
                : [textNodeWithMarks(el.text, el.bold, el.italic, el.underline)]
            const node: PMParagraphNode = {
                type: 'paragraph',
                content,
            }
            return [node]
        }

        case 'list': {
            if (el.ordered) {
                const node: PMOrderedListNode = {
                    type: 'orderedList',
                    content: el.items.map((item, i) => ({
                        type: 'listItem' as const,
                        content: [{
                            type: 'paragraph' as const,
                            content: (el.itemRuns && el.itemRuns[i] && el.itemRuns[i].length > 0)
                                ? runsToPMContent(el.itemRuns[i])
                                : [{ type: 'text' as const, text: item }],
                        }],
                    })),
                }
                return [node]
            } else {
                const node: PMBulletListNode = {
                    type: 'bulletList',
                    content: el.items.map((item, i) => ({
                        type: 'listItem' as const,
                        content: [{
                            type: 'paragraph' as const,
                            content: (el.itemRuns && el.itemRuns[i] && el.itemRuns[i].length > 0)
                                ? runsToPMContent(el.itemRuns[i])
                                : [{ type: 'text' as const, text: item }],
                        }],
                    })),
                }
                return [node]
            }
        }

        case 'table': {
            const tableNode = {
                type: 'table' as const,
                attrs: { borderColor: '#4a5060', borderWidth: 1, tableWidth: '100%' },
                content: el.rows.map((row, rowIdx) => {
                    const isHeaderRow = el.hasHeaderRow === true && rowIdx === 0
                    return {
                        type: 'tableRow' as const,
                        content: row.map((cellText, colIdx) => {
                            const cellRuns = el.cells?.[rowIdx]?.[colIdx]
                            const paragraphContent: PMTextNode[] = (cellRuns && cellRuns.length > 0)
                                ? runsToPMContent(cellRuns)
                                : [{ type: 'text' as const, text: cellText }]
                            const cellType: 'tableHeader' | 'tableCell' = isHeaderRow ? 'tableHeader' : 'tableCell'
                            return {
                                type: cellType,
                                attrs: { colspan: 1, rowspan: 1, colwidth: null },
                                content: [{
                                    type: 'paragraph' as const,
                                    content: paragraphContent,
                                }],
                            }
                        }),
                    }
                }),
            }
            return [tableNode as unknown as PMBlockNode]
        }

        case 'image_ref': {
            const url = savedImages.get(el.tempId) ?? ''
            const node: PMImageNode = {
                type: 'image',
                attrs: { src: url, alt: null, title: null },
            }
            // Images are inline — wrap in paragraph
            const wrapper: PMParagraphNode = {
                type: 'paragraph',
                content: [node],
            }
            return [wrapper]
        }

        case 'hr': {
            const node: PMHorizontalRuleNode = { type: 'horizontalRule' }
            return [node]
        }

        default:
            return []
    }
}

function buildSection(
    id: string,
    title: string,
    isPublic: boolean,
    nodes: PMBlockNode[]
): OperationSection {
    const doc: PMDoc = {
        type: 'doc',
        content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }],
    }
    return { id, title, isPublic, content: doc }
}

function sectionIsPublic(label: SmeacLabel | null, title: string, options?: ConversionOptions): boolean {
    // Options override takes priority
    if (options?.defaultVisibility && title in options.defaultVisibility) {
        return options.defaultVisibility[title]
    }
    // Enforce always-private rule
    if (label && ALWAYS_PRIVATE.includes(label)) return false
    // Situation and Mission default public
    if (label === 'Situation' || label === 'Mission') return true
    // Everything else defaults private
    return false
}

export function intermediateToSections(doc: IntermediateDoc, options?: ConversionOptions): OperationSection[] {
    const { elements } = doc

    // savedImages will be populated later by image-extractor; placeholder map
    const savedImages = new Map<string, string>()

    // Walk elements, splitting on SMEAC headings
    const sections: OperationSection[] = []

    // "Preamble" section for content before the first SMEAC heading
    let currentLabel: SmeacLabel | null = null
    let currentTitle = 'Introduction'
    let currentNodes: PMBlockNode[] = []
    let foundFirstSmeac = false

    function pushSection() {
        if (!foundFirstSmeac && currentNodes.length === 0) return
        const isPublic = sectionIsPublic(currentLabel, currentTitle, options)
        sections.push(buildSection(randomUUID(), currentTitle, isPublic, currentNodes))
        currentNodes = []
    }

    for (const el of elements) {
        const smeacLabel = isSmeacHeading(el)

        if (smeacLabel) {
            // Flush previous section
            pushSection()
            foundFirstSmeac = true
            currentLabel = smeacLabel
            currentTitle = smeacLabel
            continue
        }

        // Skip H1 headings that look like the document title (level 1 only)
        if (el.type === 'heading' && el.level === 1 && !foundFirstSmeac) {
            continue
        }

        const nodes = elementToPMNodes(el, savedImages)
        currentNodes.push(...nodes)
    }

    // Flush last section
    if (currentNodes.length > 0 || foundFirstSmeac) {
        pushSection()
    }

    // If no SMEAC sections were found at all, create a single generic section
    if (sections.length === 0) {
        const allNodes = elements.flatMap(el => elementToPMNodes(el, savedImages))
        sections.push(buildSection(randomUUID(), 'Orders', false, allNodes))
    }

    return sections
}
