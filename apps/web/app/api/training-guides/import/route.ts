import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import mammoth from 'mammoth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

function htmlText(fragment: string): string {
    return fragment
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .trim()
}

// Like htmlText but preserves <strong>, <em>, <u>, <s> inline formatting.
// Normalises <b>→<strong> and <i>→<em> for consistency.
function richText(fragment: string): string {
    return fragment
        .replace(/<b\b[^>]*>/gi, '<strong>').replace(/<\/b>/gi, '</strong>')
        .replace(/<i\b[^>]*>/gi, '<em>').replace(/<\/i>/gi, '</em>')
        .replace(/<(strong|em|u|s)\b[^>]*>/gi, (_, tag) => `<${tag}>`)
        .replace(/<br\s*\/?>/gi, ' ')
        // Strip every tag that is NOT an allowed inline tag or its closing tag
        .replace(/<(?!\/?(strong|em|u|s)>)[^>]*>/gi, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function extractCellTexts(rowHtml: string): string[] {
    const cells: string[] = []
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(rowHtml)) !== null) {
        cells.push(htmlText(cm[1]))
    }
    return cells
}

function extractRichCellTexts(rowHtml: string): string[] {
    const cells: string[] = []
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(rowHtml)) !== null) {
        cells.push(richText(cm[1]))
    }
    return cells
}

type Token = {
    tag:           string
    text:          string       // plain text — used for section/header detection
    richText:      string       // inline-HTML preserved — used for stored content
    pos:           number       // source HTML offset — used to sort tokens into document order
    indent?:       number       // li only: 0 = top-level, 1 = first indent (from mammoth l0/l1 class)
    tableData?:    string[][]   // fault-table tokens: plain text rows for detection
    richTableData?: { fault: string; correction: string }[]  // fault-table with formatting
}

// Build a flat, position-ordered token list from the mammoth HTML.
//
// Strategy:
//   1. Scan the FULL HTML for FAULT/CORRECTION table header rows and extract
//      the data rows that immediately follow them.  These become 'fault-table'
//      tokens positioned at the header row's offset in the source.
//      Uses htmlText() on cell content so bold/paragraph-wrapped "FAULT" headers match.
//   2. Scan the FULL HTML for headings and paragraphs (h1-h6, p) — this
//      includes elements inside <table><td> cells.
//   3. Scan the FULL HTML for <li> elements separately, extracting only their
//      immediate text (not nested child list items) and computing indent depth
//      from either the class="lN" attribute (mammoth styleMap) or ul/ol nesting depth.
//   4. Merge and sort by position so everything appears in document order.
function buildTokens(html: string): Token[] {
    const tokens: Token[] = []

    // ── 1. Fault/correction table extraction ─────────────────────────────────
    // Find every <tr> that contains a cell whose text (after stripping tags) is
    // exactly "FAULT".  This handles bold/paragraph-wrapped header cells.
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    let trm: RegExpExecArray | null
    while ((trm = trRe.exec(html)) !== null) {
        const headerCells = extractCellTexts(trm[1])
        if (!headerCells.some(c => /^FAULT$/i.test(c.trim()))) continue

        const afterHeader = trm.index + trm[0].length
        const tableClose  = html.indexOf('</table>', afterHeader)
        const section     = html.slice(afterHeader, tableClose !== -1 ? tableClose : html.length)

        const rows: string[][] = []
        const richRows: { fault: string; correction: string }[] = []
        const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
        let rm: RegExpExecArray | null
        while ((rm = rowRe.exec(section)) !== null) {
            const rowCells      = extractCellTexts(rm[1])
            const richRowCells  = extractRichCellTexts(rm[1])
            if (rowCells.length > 0) rows.push(rowCells)
            if (richRowCells.length >= 2) richRows.push({ fault: richRowCells[0], correction: richRowCells[1] })
        }
        if (rows.length > 0) {
            tokens.push({ tag: 'fault-table', text: '', richText: '', pos: trm.index, tableData: rows, richTableData: richRows })
        }
    }

    // ── 2. Block-level headings and paragraphs ────────────────────────────────
    // Scan the raw HTML — headings and paragraphs are captured regardless of
    // whether they appear at the top level or inside table cells.
    const blockRe = /<(h[1-6]|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi
    let bm: RegExpExecArray | null
    while ((bm = blockRe.exec(html)) !== null) {
        const tag      = bm[1].toLowerCase()
        const text     = htmlText(bm[3])
        const rich     = richText(bm[3])
        if (text) tokens.push({ tag, text, richText: rich, pos: bm.index })
    }

    // ── 3. List items — immediate text only, with correct indent depth ────────
    // <li> is handled separately because the non-greedy block regex would stop
    // at the first </li> inside a nested list, concatenating parent + child text.
    const liRe = /<li\b([^>]*)>/gi
    let lm: RegExpExecArray | null
    while ((lm = liRe.exec(html)) !== null) {
        const pos   = lm.index
        const attrs = lm[1]
        const start = lm.index + lm[0].length

        // Capture only the immediate text — stop before any nested <ul>/<ol> or </li>
        const sub        = html.slice(start)
        const stopM      = sub.match(/<\/li>|<[uo]l\b/i)
        const rawContent = stopM ? sub.slice(0, stopM.index!) : sub
        const text = htmlText(rawContent)
        const rich = richText(rawContent)
        if (!text) continue

        // Prefer class-based indent ("l0", "l1" …) injected by mammoth styleMap
        const classMatch = attrs.match(/class="([^"]*)"/)
        const classList  = classMatch ? classMatch[1].split(/\s+/) : []
        let indent = -1
        for (const cls of classList) {
            const lvl = cls.match(/^l(\d+)$/)
            if (lvl) { indent = parseInt(lvl[1]); break }
        }

        // Fall back: count <ul>/<ol> opens vs closes before this <li> position
        if (indent < 0) {
            const before = html.slice(0, pos)
            const opens  = (before.match(/<[uo]l\b/gi) || []).length
            const closes = (before.match(/<\/[uo]l>/gi) || []).length
            indent = Math.max(0, opens - closes - 1)
        }

        tokens.push({ tag: 'li', text, richText: rich, pos, indent })
    }

    // ── 4. Sort into document order ───────────────────────────────────────────
    tokens.sort((a, b) => a.pos - b.pos)
    return tokens
}

function parseDocxHtml(html: string): {
    title: string
    duration: string
    trainingAreaDescription: string
    overview: string
    equipment: TrainingGuideEquipmentItem[]
    revisionTopics: RevisionTopic[]
    teachingPoints: TrainingGuideTeachingPoint[]
    notes: string
    warnings: string[]
} {
    const tokens = buildTokens(html)

    const warnings: string[] = []
    let title = 'Untitled Training Guide'
    let duration = ''
    let trainingAreaDescription = ''
    let overview = ''
    const equipment: TrainingGuideEquipmentItem[] = []
    const revisionTopics: RevisionTopic[] = []
    const teachingPoints: TrainingGuideTeachingPoint[] = []
    let notes = ''

    const h1 = tokens.find(t => t.tag === 'h1')
    if (h1) {
        title = h1.text
    } else {
        warnings.push('No Heading 1 title found — guide saved as "Untitled Training Guide"')
    }

    // ── Pre-pass: extract metadata from any token regardless of section ───────
    // Handles "Label: value" in one token AND label/value split across adjacent
    // table cells (which mammoth outputs as separate p tokens with no colon).
    {
        let nextIsDuration = false
        let nextIsArea     = false
        for (const tok of tokens) {
            if (tok.tag !== 'p' && !tok.tag.match(/^h[2-6]$/)) continue

            // Consume a pending label whose value was in the next cell
            if (nextIsDuration && !duration && tok.text.trim()) {
                duration = tok.text.trim()
                nextIsDuration = false; nextIsArea = false; continue
            }
            if (nextIsArea && !trainingAreaDescription && tok.text.trim()) {
                trainingAreaDescription = tok.richText.trim()
                nextIsDuration = false; nextIsArea = false; continue
            }
            nextIsDuration = false; nextIsArea = false

            const colonIdx = tok.text.indexOf(':')
            const lc       = tok.text.toLowerCase().trim()
            if (colonIdx !== -1) {
                const label = tok.text.slice(0, colonIdx).toLowerCase().trim()
                const value = tok.text.slice(colonIdx + 1).trim()
                if (!duration && label.includes('duration')) {
                    if (value) duration = value; else nextIsDuration = true
                }
                if (!trainingAreaDescription && label.includes('training area')) {
                    const rv = tok.richText.slice(tok.richText.indexOf(':') + 1).trim()
                    if (rv) trainingAreaDescription = rv; else nextIsArea = true
                }
            } else if (!duration && lc === 'duration') {
                nextIsDuration = true
            } else if (!trainingAreaDescription && /^training area/i.test(lc)) {
                nextIsArea = true
            }
        }
    }

    type Section = 'none' | 'metadata' | 'overview' | 'equipment' | 'revision' | 'teaching_points' | 'notes'
    let section: Section = 'none'
    let currentTP: TrainingGuideTeachingPoint | null = null
    let tpSub: 'dot' | 'vital' | 'fault' | null = null
    let currentRevTopic: RevisionTopic | null = null
    let lastMetaLabel: 'duration' | 'area' | null = null

    function isSectionHeader(upper: string): Section | null {
        if (upper.includes('METADATA'))        return 'metadata'
        if (upper.includes('OVERVIEW'))         return 'overview'
        if (upper.includes('EQUIPMENT'))        return 'equipment'
        if (upper.includes('REVISION'))         return 'revision'
        if (upper.includes('TEACHING POINT'))   return 'teaching_points'
        if (/^NOTES$/.test(upper))              return 'notes'
        return null
    }

    for (const tok of tokens) {
        if (tok.tag === 'h1') continue

        // ── Section headers — H2, H3 (outside teaching_points), or bold paragraph ─
        if (tok.tag === 'h2' || (tok.tag === 'h3' && section !== 'teaching_points')) {
            const upper = tok.text.toUpperCase().trim()
            const next  = isSectionHeader(upper)
            if (next) {
                section = next
                currentTP = null; currentRevTopic = null; lastMetaLabel = null
                continue
            }
            if (tok.tag === 'h2') {
                warnings.push(`Unrecognised H2 section skipped: "${tok.text}"`)
                section = 'none'
                continue
            }
        }

        // Paragraph-level section fallback: catches section labels written as bold
        // body text (no heading style applied) — common in Google Docs exports
        if (tok.tag === 'p' && tok.text.length < 80) {
            const upper = tok.text.toUpperCase().trim()
            const next  = isSectionHeader(upper)
            if (next) { section = next; currentTP = null; currentRevTopic = null; lastMetaLabel = null; continue }
        }

        switch (section) {
            // ── Metadata ─────────────────────────────────────────────────────
            case 'metadata':
                if (tok.tag === 'p') {
                    const lc       = tok.text.toLowerCase().trim()
                    const colonIdx = tok.text.indexOf(':')

                    if (colonIdx !== -1) {
                        const plainValue = tok.text.slice(colonIdx + 1).trim()
                        const richColon  = tok.richText.indexOf(':')
                        const richValue  = richColon !== -1 ? tok.richText.slice(richColon + 1).trim() : plainValue
                        if (lc.includes('duration') && plainValue)           { duration               = plainValue; lastMetaLabel = null }
                        else if (lc.includes('training area') && plainValue) { trainingAreaDescription = richValue;  lastMetaLabel = null }
                        else { lastMetaLabel = null }
                    } else if (/^duration$/i.test(lc)) {
                        lastMetaLabel = 'duration'
                    } else if (/^training area/i.test(lc)) {
                        lastMetaLabel = 'area'
                    } else if (lastMetaLabel) {
                        if (lastMetaLabel === 'duration') duration               = tok.text
                        else                              trainingAreaDescription = tok.richText
                        lastMetaLabel = null
                    }
                }
                break

            // ── Overview ──────────────────────────────────────────────────────
            case 'overview':
                if (tok.tag === 'p') overview = overview ? `${overview}\n\n${tok.richText}` : tok.richText
                break

            // ── Equipment ─────────────────────────────────────────────────────
            case 'equipment':
                if (tok.tag === 'li') equipment.push({ id: randomUUID(), text: tok.richText })
                break

            // ── Revision (Pre-learning Check) ─────────────────────────────────
            case 'revision':
                if (tok.tag === 'h3' || tok.tag === 'h4') {
                    const cleanTitle = tok.text.replace(/^\d+[\s.)–\-]+/, '').trim() || tok.text
                    currentRevTopic = { id: randomUUID(), title: cleanTitle, questions: [] }
                    revisionTopics.push(currentRevTopic)
                } else if (tok.tag === 'li' && currentRevTopic) {
                    currentRevTopic.questions.push({ id: randomUUID(), text: tok.richText, indent: tok.indent ?? 0 })
                } else if (tok.tag === 'p' && currentRevTopic && tok.text.length < 80) {
                    // Plain paragraphs under a topic treated as questions (some exports omit list style)
                    currentRevTopic.questions.push({ id: randomUUID(), text: tok.richText, indent: 0 })
                }
                break

            // ── Teaching points ───────────────────────────────────────────────
            case 'teaching_points':
                if (tok.tag === 'h3') {
                    const cleanTitle = tok.text.replace(/^\d+[\s.)–\-]+/, '').trim() || tok.text
                    currentTP = {
                        id: randomUUID(),
                        title: cleanTitle,
                        dotPoints: [],
                        vitalPoints: [],
                        commonFaults: [],
                        images: [],
                    }
                    teachingPoints.push(currentTP)
                    tpSub = null

                } else if ((tok.tag === 'h4' || tok.tag === 'p') && currentTP) {
                    const upper = tok.text.trim().toUpperCase()
                    if      (/^DOT POINTS?$/.test(upper))    tpSub = 'dot'
                    else if (/^VITAL POINTS?$/.test(upper))  tpSub = 'vital'
                    else if (/^COMMON FAULTS?$/.test(upper)) tpSub = 'fault'
                    else if (tok.tag === 'h4')                tpSub = null

                } else if (tok.tag === 'fault-table' && currentTP) {
                    for (let ri = 0; ri < (tok.tableData?.length ?? 0); ri++) {
                        const row = tok.tableData![ri]
                        if (row.length < 2) continue
                        const plainFault = row[0].trim()
                        if (!plainFault || /^\[.*\]$/.test(plainFault)) continue
                        const richRow = tok.richTableData?.[ri]
                        currentTP.commonFaults.push({
                            id:         randomUUID(),
                            fault:      richRow?.fault      ?? plainFault,
                            correction: richRow?.correction ?? row[1].trim(),
                        })
                    }

                } else if (tok.tag === 'li' && currentTP) {
                    if (tpSub === 'dot' || tpSub === null) {
                        currentTP.dotPoints.push({ id: randomUUID(), text: tok.richText, indent: tok.indent ?? 0 })
                    } else if (tpSub === 'vital') {
                        currentTP.vitalPoints.push({ id: randomUUID(), text: tok.richText, indent: tok.indent ?? 0 })
                    } else if (tpSub === 'fault') {
                        const pipeIdx    = tok.text.indexOf('|')
                        const richPipe   = tok.richText.indexOf('|')
                        const fault      = (pipeIdx !== -1 ? tok.richText.slice(0, richPipe !== -1 ? richPipe : pipeIdx) : tok.richText).replace(/^FAULT:\s*/i, '').trim()
                        const correction = (pipeIdx !== -1 ? tok.richText.slice(richPipe !== -1 ? richPipe + 1 : pipeIdx + 1) : '').replace(/^CORRECTION:\s*/i, '').trim()
                        currentTP.commonFaults.push({ id: randomUUID(), fault, correction })
                    }
                }
                break

            // ── Notes ─────────────────────────────────────────────────────────
            case 'notes':
                if (tok.tag === 'p') {
                    // Skip template placeholder lines — plain text entirely wrapped in [...]
                    if (/^\[.*\]$/.test(tok.text.trim())) break
                    notes = notes ? `${notes}\n\n${tok.richText}` : tok.richText
                }
                break
        }
    }

    const filledTPs = teachingPoints.filter(tp =>
        tp.dotPoints.length > 0 || tp.vitalPoints.length > 0 || tp.commonFaults.length > 0
    )
    if (filledTPs.length === 0) warnings.push('No teaching points found in document')

    return { title, duration, trainingAreaDescription, overview, equipment, revisionTopics, teachingPoints: filledTPs, notes, warnings }
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const formData = await req.formData().catch(() => null)
    if (!formData) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })

    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.docx')) {
        return NextResponse.json({ error: 'File must be a .docx document' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    let htmlResult: Awaited<ReturnType<typeof mammoth.convertToHtml>>
    try {
        htmlResult = await mammoth.convertToHtml(
            { buffer },
            {
                // Override default nested-list HTML with flat <li class="l0">, <li class="l1"> etc.
                // so the block tokeniser can read indent level from the class attribute.
                styleMap: [
                    "p[numbering-level='0'] => li.l0:fresh",
                    "p[numbering-level='1'] => li.l1:fresh",
                    "p[numbering-level='2'] => li.l2:fresh",
                ],
            }
        )
    } catch {
        return NextResponse.json({ error: 'Failed to parse DOCX — ensure the file is a valid .docx document' }, { status: 422 })
    }

    const parsed = parseDocxHtml(htmlResult.value)
    const mammothWarnings = htmlResult.messages
        .filter(m => m.type === 'warning')
        .map(m => m.message)
    const allWarnings = [...mammothWarnings, ...parsed.warnings]

    const name   = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const count  = await Db.trainingGuides.countDocuments({})
    const docRef = `TRG-${String(count + 1).padStart(3, '0')}`
    const now    = new Date()

    const guide: Omit<TrainingGuide, '_id'> = {
        docRef,
        title:                   parsed.title,
        accentColor:             '#db001d',
        revisionColor:           '#d97706',
        guideType:               'trainers_guide',
        status:                  'draft',
        version:                 '1.0',
        lastRevisedAt:           now,
        duration:                parsed.duration,
        overview:                parsed.overview,
        equipment:               parsed.equipment,
        trainingAreaDescription: parsed.trainingAreaDescription,
        teachingPoints:          parsed.teachingPoints,
        revisionTopics:          parsed.revisionTopics,
        notes:                   parsed.notes,
        createdAt:               now,
        createdById:             me.id,
        createdByName:           name,
        updatedAt:               now,
        updatedById:             me.id,
        updatedByName:           name,
        editHistory:             [{ at: now, byId: me.id, byName: name, type: 'created',
            snapshot: JSON.stringify({
                title: parsed.title, duration: parsed.duration, overview: parsed.overview,
                trainingAreaDescription: parsed.trainingAreaDescription, notes: parsed.notes,
                equipment: parsed.equipment.map(e => ({ id: e.id, text: e.text })),
                teachingPoints: parsed.teachingPoints.map(tp => ({
                    id: tp.id, title: tp.title,
                    dotPoints:    tp.dotPoints.map(dp => ({ id: dp.id, text: dp.text, indent: dp.indent ?? 0 })),
                    vitalPoints:  tp.vitalPoints.map(vp => ({ id: vp.id, text: vp.text })),
                    commonFaults: tp.commonFaults.map(cf => ({ id: cf.id, fault: cf.fault, correction: cf.correction })),
                })),
            }),
        }],
        contentBaseline:         '{}',
    }

    const result = await Db.trainingGuides.insertOne(guide as TrainingGuide)

    return NextResponse.json({
        guideId:            result.insertedId.toString(),
        docRef,
        title:              parsed.title,
        teachingPointCount: parsed.teachingPoints.length,
        warnings:           allWarnings,
    })
}
