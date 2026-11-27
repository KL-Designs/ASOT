'use client'

import React from 'react'

/** GFM block node types. */
type GfmBlock =
    | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: GfmInline[]; id: string }
    | { type: 'paragraph'; inlines: GfmInline[] }
    | { type: 'anchor'; id: string }
    | { type: 'list'; ordered: boolean; items: GfmBlock[][] }
    | { type: 'blockquote'; callout: 'warning' | 'note' | 'tip' | 'image' | null; lines: GfmInline[][] }
    | { type: 'table'; headers: GfmInline[]; align: ('left' | 'center' | 'right' | null)[]; rows: GfmInline[][] }
    | { type: 'rule' }
    | { type: 'codeblock'; lang?: string; code: string }

type GfmInline =
    | { type: 'text'; text: string }
    | { type: 'bold'; children: GfmInline[] }
    | { type: 'italic'; children: GfmInline[] }
    | { type: 'code'; text: string }
    | { type: 'link'; href: string; children: GfmInline[] }
    | { type: 'image'; src: string; alt: string }
    | { type: 'br' }

// ── Inline parser ────────────────────────────────────────────────────────────

function parseInline(src: string): GfmInline[] {
    const out: GfmInline[] = []
    let rest = src
    while (rest.length) {
        // Image before link (similar pattern)
        const imgM = /!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/.exec(rest)
        const boldM = /\*\*(.+?)\*\*/.exec(rest)
        const italicM = /\*([^*\s][^*]*?)\*/.exec(rest)
        const codeM = /`([^`]+)`/.exec(rest)
        const linkM = /\[([^\]]+)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/.exec(rest)
        const brM = /\\n|  \n/.exec(rest)

        const candidates = [
            imgM && { m: imgM, pri: 0 },
            boldM && { m: boldM, pri: 1 },
            italicM && { m: italicM, pri: 2 },
            codeM && { m: codeM, pri: 3 },
            linkM && { m: linkM, pri: 4 },
            brM && { m: brM, pri: 5 },
        ].filter(Boolean) as { m: RegExpExecArray; pri: number }[]

        if (!candidates.length) { out.push({ type: 'text', text: rest }); break }

        candidates.sort((a, b) => a.m.index - b.m.index || a.pri - b.pri)
        const { m, pri } = candidates[0]

        if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) })
        if (pri === 0) {
            // image
            const rawSrc = m[2].split(/\s+"/)[0]
            out.push({ type: 'image', src: rawSrc, alt: m[1] })
        } else if (pri === 1) {
            out.push({ type: 'bold', children: parseInline(m[1]) })
        } else if (pri === 2) {
            out.push({ type: 'italic', children: parseInline(m[1]) })
        } else if (pri === 3) {
            out.push({ type: 'code', text: m[1] })
        } else if (pri === 4) {
            const rawSrc = m[2].split(/\s+"/)[0]
            out.push({ type: 'link', href: rawSrc, children: parseInline(m[1]) })
        } else {
            out.push({ type: 'br' })
        }
        rest = rest.slice(m.index + m[0].length)
    }
    return out.reduce<GfmInline[]>((acc, n) => {
        const last = acc[acc.length - 1]
        if (n.type === 'text' && last?.type === 'text') last.text += n.text
        else acc.push(n)
        return acc
    }, [])
}

function slugId(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function inlineText(nodes: GfmInline[]): string {
    return nodes.map(n => {
        if (n.type === 'text') return n.text
        if (n.type === 'bold' || n.type === 'italic' || n.type === 'link') return inlineText(n.children)
        if (n.type === 'code') return n.text
        if (n.type === 'image') return n.alt
        return ''
    }).join('')
}

// ── Block parser ─────────────────────────────────────────────────────────────

function parseTable(lines: string[]): GfmBlock | null {
    if (lines.length < 2) return null
    const sep = lines[1]
    if (!/^\|?[\s:|-]+[\s:|-]*\|/.test(sep)) return null
    const parseCells = (line: string) => line.replace(/^\||\|$/g, '').split('|').map(c => parseInline(c.trim()))
    const parseAlign = (cell: string): 'left' | 'center' | 'right' | null => {
        const t = cell.trim()
        if (t.startsWith(':') && t.endsWith(':')) return 'center'
        if (t.endsWith(':')) return 'right'
        if (t.startsWith(':')) return 'left'
        return null
    }
    const headers = parseCells(lines[0])
    const alignCells = sep.replace(/^\||\|$/g, '').split('|')
    const align = alignCells.map(parseAlign)
    const rows: GfmInline[][] = []
    for (let i = 2; i < lines.length; i++) {
        const cells = parseCells(lines[i])
        while (cells.length < headers.length) cells.push([{ type: 'text', text: '' }])
        rows.push(cells.flat())
    }
    return { type: 'table', headers: headers.flat(), align, rows }
}

function detectCallout(first: string): 'warning' | 'note' | 'tip' | 'image' | null {
    const t = first.trimStart()
    if (/^\*\*⚠/.test(t) || /^\*\*WARNING/.test(t)) return 'warning'
    if (/^\*\*ℹ/.test(t) || /^\*\*NOTE/.test(t)) return 'note'
    if (/^\*\*💡/.test(t) || /^\*\*TIP/.test(t)) return 'tip'
    if (/^\*\*📷/.test(t) || /^\*\*IMAGE NEEDED/.test(t)) return 'image'
    return null
}

export function parseGfmMarkdown(src: string): GfmBlock[] {
    const blocks: GfmBlock[] = []
    const lines = src.replace(/\r\n?/g, '\n').split('\n')
    let i = 0

    while (i < lines.length) {
        const line = lines[i]
        const trimmed = line.trim()

        // Skip blank lines
        if (!trimmed) { i++; continue }

        // Fenced code block
        if (/^```/.test(trimmed)) {
            const lang = trimmed.slice(3).trim() || undefined
            const code: string[] = []
            i++
            while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i++ }
            i++ // closing ```
            blocks.push({ type: 'codeblock', lang, code: code.join('\n') })
            continue
        }

        // HTML anchor <a id="..."></a>
        const anchorM = /^<a\s+id="([^"]+)"\s*><\/a>$/.exec(trimmed)
        if (anchorM) { blocks.push({ type: 'anchor', id: anchorM[1] }); i++; continue }

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { blocks.push({ type: 'rule' }); i++; continue }

        // ATX heading
        const headingM = /^(#{1,6})\s+(.+)$/.exec(trimmed)
        if (headingM) {
            const text = parseInline(headingM[2].replace(/\s+#+\s*$/, '').trim())
            const id = slugId(inlineText(text))
            blocks.push({ type: 'heading', level: headingM[1].length as 1 | 2 | 3 | 4 | 5 | 6, text, id })
            i++; continue
        }

        // Blockquote
        if (trimmed.startsWith('>')) {
            const quoteLines: string[] = []
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                quoteLines.push(lines[i].replace(/^>\s?/, ''))
                i++
            }
            const callout = detectCallout(quoteLines[0] ?? '')
            const parsedLines = quoteLines.map(l => parseInline(l))
            blocks.push({ type: 'blockquote', callout, lines: parsedLines })
            continue
        }

        // Table detection: look ahead for separator line
        if (trimmed.startsWith('|') || (lines[i + 1] ?? '').trim().startsWith('|---')) {
            const tableLines: string[] = []
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i].trim())
                i++
            }
            if (tableLines.length >= 2) {
                const tbl = parseTable(tableLines)
                if (tbl) { blocks.push(tbl); continue }
                // Not a table: fall through as paragraphs
                for (const tl of tableLines) blocks.push({ type: 'paragraph', inlines: parseInline(tl) })
                continue
            }
        }

        // Ordered list
        if (/^\d+[.)]\s+/.test(trimmed)) {
            const items: GfmBlock[][] = []
            while (i < lines.length) {
                const lt = lines[i].trimEnd()
                const lm = /^(\d+[.)]\s+)(.*)$/.exec(lt.trimStart())
                if (!lm) {
                    // Continuation line
                    if (/^\s+/.test(lt) && items.length) {
                        items[items.length - 1].push({ type: 'paragraph', inlines: parseInline(lt.trim()) })
                        i++; continue
                    }
                    break
                }
                items.push([{ type: 'paragraph', inlines: parseInline(lm[2]) }])
                i++
            }
            if (items.length) { blocks.push({ type: 'list', ordered: true, items }); continue }
        }

        // Unordered list
        if (/^[-*+]\s+/.test(trimmed)) {
            const items: GfmBlock[][] = []
            while (i < lines.length) {
                const lt = lines[i].trimEnd()
                const lm = /^[-*+]\s+(.*)$/.exec(lt.trimStart())
                if (!lm) {
                    if (/^\s+/.test(lt) && items.length) {
                        items[items.length - 1].push({ type: 'paragraph', inlines: parseInline(lt.trim()) })
                        i++; continue
                    }
                    break
                }
                items.push([{ type: 'paragraph', inlines: parseInline(lm[1]) }])
                i++
            }
            if (items.length) { blocks.push({ type: 'list', ordered: false, items }); continue }
        }

        // Paragraph (collect consecutive non-special lines)
        const paraLines: string[] = []
        while (i < lines.length) {
            const lt = lines[i].trim()
            if (!lt) break
            if (/^#{1,6}\s/.test(lt)) break
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(lt)) break
            if (lt.startsWith('>')) break
            if (lt.startsWith('|')) break
            if (/^```/.test(lt)) break
            if (/^<a\s+id=/.test(lt)) break
            if (/^\d+[.)]\s+/.test(lt) || /^[-*+]\s+/.test(lt)) break
            paraLines.push(lt)
            i++
        }
        if (paraLines.length) {
            blocks.push({ type: 'paragraph', inlines: parseInline(paraLines.join(' ')) })
        }
    }

    return blocks
}

// ── React renderer ────────────────────────────────────────────────────────────

function RenderInlines({ nodes }: { nodes: GfmInline[] }) {
    return (
        <>
            {nodes.map((n, idx) => {
                if (n.type === 'text') return <React.Fragment key={idx}>{n.text}</React.Fragment>
                if (n.type === 'bold') return <strong key={idx}><RenderInlines nodes={n.children} /></strong>
                if (n.type === 'italic') return <em key={idx}><RenderInlines nodes={n.children} /></em>
                if (n.type === 'code') return <code key={idx} style={{ background: 'var(--ink-2)', padding: '1px 5px', borderRadius: 3, fontSize: '0.9em', fontFamily: 'monospace' }}>{n.text}</code>
                if (n.type === 'link') return <a key={idx} href={n.href} style={{ color: 'var(--accent)' }}><RenderInlines nodes={n.children} /></a>
                if (n.type === 'image') return <img key={idx} src={n.src} alt={n.alt} style={{ maxWidth: '100%', height: 'auto', borderRadius: 4, margin: '4px 8px 4px 0', verticalAlign: 'middle' }} />
                if (n.type === 'br') return <br key={idx} />
                return null
            })}
        </>
    )
}

function RenderBlock({ block, depth = 0 }: { block: GfmBlock; depth?: number }) {
    if (block.type === 'anchor') return <span id={block.id} style={{ display: 'block', position: 'relative', top: -80 }} />
    if (block.type === 'rule') return <hr style={{ border: 'none', borderTop: '1px solid var(--line-1)', margin: '20px 0' }} />
    if (block.type === 'codeblock') return (
        <pre style={{ background: 'var(--ink-2)', borderRadius: 6, padding: '10px 14px', overflowX: 'auto', fontSize: '0.9em', lineHeight: 1.5, margin: '8px 0' }}>
            <code style={{ fontFamily: 'monospace' }}>{block.code}</code>
        </pre>
    )

    if (block.type === 'heading') {
        const Tag = `h${block.level}` as keyof JSX.IntrinsicElements
        const styles: React.CSSProperties = {
            scrollMarginTop: 80,
            lineHeight: 1.3,
        }
        if (block.level === 1) Object.assign(styles, { fontSize: '1.6em', fontWeight: 700, marginTop: 0, marginBottom: 12, color: 'var(--fg)' })
        else if (block.level === 2) Object.assign(styles, { fontSize: '1.25em', fontWeight: 700, marginTop: 28, marginBottom: 10, paddingLeft: 10, borderLeft: '3px solid var(--accent)', color: 'var(--fg)' })
        else if (block.level === 3) Object.assign(styles, { fontSize: '1.05em', fontWeight: 600, marginTop: 20, marginBottom: 6, color: 'var(--accent)' })
        else Object.assign(styles, { fontSize: '1em', fontWeight: 600, marginTop: 16, marginBottom: 4, color: 'var(--fg-2)' })
        return <Tag id={block.id} style={styles}><RenderInlines nodes={block.text} /></Tag>
    }

    if (block.type === 'paragraph') return (
        <p style={{ margin: '0 0 10px', lineHeight: 1.65 }}>
            <RenderInlines nodes={block.inlines} />
        </p>
    )

    if (block.type === 'blockquote') {
        const calloutStyles: Record<string, React.CSSProperties> = {
            warning: { background: 'rgba(var(--accent-rgb, 155,27,48), 0.08)', borderLeft: '3px solid var(--red, #c0392b)', color: 'var(--fg)' },
            note:    { background: 'var(--ink-2)', borderLeft: '3px solid var(--fg-3)', color: 'var(--fg)' },
            tip:     { background: 'rgba(47,125,50,0.08)', borderLeft: '3px solid #2f7d32', color: 'var(--fg)' },
            image:   { background: 'var(--ink-2)', borderLeft: '3px dashed var(--accent)', color: 'var(--accent)' },
        }
        const style: React.CSSProperties = {
            margin: '8px 0 12px',
            padding: '8px 12px',
            borderRadius: '0 4px 4px 0',
            fontSize: '0.95em',
            lineHeight: 1.6,
            ...(block.callout ? calloutStyles[block.callout] : { borderLeft: '3px solid var(--line-2)', background: 'var(--ink-2)', color: 'var(--fg)' }),
        }
        return (
            <blockquote style={style}>
                {block.lines.map((line, idx) => (
                    <p key={idx} style={{ margin: idx === 0 ? 0 : '4px 0 0' }}>
                        <RenderInlines nodes={line} />
                    </p>
                ))}
            </blockquote>
        )
    }

    if (block.type === 'list') {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
            <Tag style={{ margin: '6px 0 10px', paddingLeft: depth > 0 ? 18 : 24, lineHeight: 1.65 }}>
                {block.items.map((itemBlocks, idx) => (
                    <li key={idx} style={{ marginBottom: 3 }}>
                        {itemBlocks.map((b, bi) => <RenderBlock key={bi} block={b} depth={depth + 1} />)}
                    </li>
                ))}
            </Tag>
        )
    }

    if (block.type === 'table') {
        const colCount = block.headers.length / (block.rows[0]?.length / block.headers.length || 1)
        const cells = block.headers.length
        return (
            <div style={{ overflowX: 'auto', margin: '10px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92em' }}>
                    <thead>
                        <tr>
                            {block.headers.map((h, ci) => (
                                <th key={ci} style={{ background: 'var(--ink-2)', padding: '7px 10px', textAlign: (block.align[ci] ?? 'left') as React.CSSProperties['textAlign'], borderBottom: '2px solid var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    <RenderInlines nodes={[h]} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {block.rows.map((row, ri) => (
                            <tr key={ri} style={{ borderBottom: '1px solid var(--line-1)' }}>
                                {row.map((cell, ci) => (
                                    <td key={ci} style={{ padding: '6px 10px', textAlign: (block.align[ci] ?? 'left') as React.CSSProperties['textAlign'], verticalAlign: 'top' }}>
                                        <RenderInlines nodes={[cell]} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    return null
}

export function ModWikiMarkdown({ body }: { body: string }) {
    const blocks = parseGfmMarkdown(body)
    return (
        <div style={{ color: 'var(--fg)', fontSize: '0.95rem', lineHeight: 1.65 }}>
            {blocks.map((block, i) => <RenderBlock key={i} block={block} />)}
        </div>
    )
}

/** Extract headings for a table of contents. */
export function extractHeadings(body: string): { id: string; level: number; text: string }[] {
    return parseGfmMarkdown(body)
        .filter((b): b is Extract<GfmBlock, { type: 'heading' }> => b.type === 'heading')
        .map(b => ({ id: b.id, level: b.level, text: inlineText(b.text) }))
}
