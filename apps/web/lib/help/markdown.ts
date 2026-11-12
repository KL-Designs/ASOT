/**
 * The help wiki's Markdown dialect, parsed into blocks the React renderer
 * (`components/help/HelpMarkdown.tsx`) draws. Deliberately small: readers write
 * edit suggestions in it, so it has to be guessable, and it never produces raw
 * HTML, so nothing a reader types can inject markup.
 *
 * Blocks: `#`/`##`/`###` headings, paragraphs, `-` or `*` bullet lists,
 * `1.` numbered lists, `>` callouts (`> **Tip:**` style), and `---` rules.
 * Inline: `**bold**`, `*italic*`, `` `code` ``, `[text](/path)` links and
 * `[[slug]]` / `[[slug|text]]` links to other articles.
 *
 * Pure, no imports: the client and the AI route both use it.
 */

export type HelpInline =
    | { type: 'text'; text: string }
    | { type: 'bold'; children: HelpInline[] }
    | { type: 'italic'; children: HelpInline[] }
    | { type: 'code'; text: string }
    | { type: 'link'; href: string; children: HelpInline[]; external: boolean }
    | { type: 'article'; slug: string; text?: string }

export type HelpBlock =
    | { type: 'heading'; level: 1 | 2 | 3; text: HelpInline[]; id: string }
    | { type: 'paragraph'; text: HelpInline[] }
    | { type: 'list'; ordered: boolean; items: HelpInline[][] }
    | { type: 'callout'; text: HelpInline[] }
    | { type: 'rule' }

/** Only site paths, anchors and http(s) URLs become links; anything else stays text. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
    const href = raw.trim()
    if (/^\/(?!\/)/.test(href) || href.startsWith('#')) return { href, external: false }
    if (/^https?:\/\//i.test(href)) return { href, external: true }
    return null
}

export function slugifyHeading(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

const INLINE = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\])|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\s][^*]*?)\*)/

export function parseInline(src: string): HelpInline[] {
    const out: HelpInline[] = []
    let rest = src
    while (rest.length) {
        const m = INLINE.exec(rest)
        if (!m) { out.push({ type: 'text', text: rest }); break }
        if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) })
        if (m[1]) out.push({ type: 'bold', children: parseInline(m[2]) })
        else if (m[3]) out.push({ type: 'code', text: m[4] })
        else if (m[5]) out.push({ type: 'article', slug: m[6], text: m[7]?.trim() || undefined })
        else if (m[8]) {
            const safe = safeHref(m[10])
            out.push(safe
                ? { type: 'link', href: safe.href, external: safe.external, children: parseInline(m[9]) }
                : { type: 'text', text: m[9] })
        }
        else if (m[11]) out.push({ type: 'italic', children: parseInline(m[12]) })
        rest = rest.slice(m.index + m[0].length)
    }
    // Merge neighbouring text runs so the renderer has fewer nodes.
    return out.reduce<HelpInline[]>((acc, n) => {
        const last = acc[acc.length - 1]
        if (n.type === 'text' && last?.type === 'text') last.text += n.text
        else acc.push(n)
        return acc
    }, [])
}

export function parseHelpMarkdown(src: string): HelpBlock[] {
    const blocks: HelpBlock[] = []
    const lines = src.replace(/\r\n?/g, '\n').split('\n')
    let para: string[] = []
    let list: { ordered: boolean; items: string[] } | null = null
    let callout: string[] = []

    const flush = () => {
        if (para.length) { blocks.push({ type: 'paragraph', text: parseInline(para.join(' ')) }); para = [] }
        if (list) { blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) }); list = null }
        if (callout.length) { blocks.push({ type: 'callout', text: parseInline(callout.join(' ')) }); callout = [] }
    }

    for (const raw of lines) {
        const line = raw.trimEnd()
        const trimmed = line.trim()
        if (!trimmed) { flush(); continue }

        const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
        if (heading) {
            flush()
            const text = heading[2].trim()
            blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: parseInline(text), id: slugifyHeading(text) })
            continue
        }
        if (/^(-{3,}|\*{3,})$/.test(trimmed)) { flush(); blocks.push({ type: 'rule' }); continue }

        const quote = /^>\s?(.*)$/.exec(trimmed)
        if (quote) {
            if (para.length || list) flush()
            callout.push(quote[1])
            continue
        }

        const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
        const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
        if (bullet || numbered) {
            const ordered = !!numbered
            if (para.length || callout.length || (list && list.ordered !== ordered)) flush()
            if (!list) list = { ordered, items: [] }
            list.items.push((bullet ?? numbered)![1])
            continue
        }

        // A plain line straight after a list item, indented, continues the item.
        if (list && /^\s+/.test(line)) { list.items[list.items.length - 1] += ' ' + trimmed; continue }
        if (list || callout.length) flush()
        para.push(trimmed)
    }
    flush()
    return blocks
}

/** Plain text of an article, for search and for the AI's context. */
export function helpMarkdownToText(src: string): string {
    return src
        .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([a-z0-9-]+)\]\]/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,3}\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .trim()
}

/** Every `[[slug]]` an article links to, so a reviewer can be warned about dead ones. */
export function articleLinks(src: string): string[] {
    const outsideCode = src.replace(/`[^`]*`/g, '')
    return [...new Set([...outsideCode.matchAll(/\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1]))]
}

/** An article's chapters (its headings), for the table of contents. */
export function articleChapters(src: string): { id: string; level: 1 | 2 | 3; text: string }[] {
    return parseHelpMarkdown(src)
        .filter((b): b is Extract<HelpBlock, { type: 'heading' }> => b.type === 'heading')
        .map(b => ({ id: b.id, level: b.level, text: helpMarkdownToText(inlineText(b.text)) }))
}

function inlineText(nodes: HelpInline[]): string {
    return nodes.map(n => 'children' in n ? inlineText(n.children) : 'text' in n && n.text ? n.text : 'slug' in n ? n.slug : '').join('')
}
