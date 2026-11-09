import { COMPOSITION, SECTIONS, compositionKey, type DoctrineField, type DoctrineSection, type DoctrineValues } from './schema'

/**
 * Row 334: paste a written doctrine into the builder. Pure.
 *
 * Reads "Label: answer" lines against the builder's own questions, so a
 * doctrine typed up in a document, or copied out of the Full Doctrine view,
 * comes back in. A numbered heading ("6. Contact and Engagement") narrows
 * the search to that section, which matters because several questions share
 * a label ("Coordination"). Lines with no label carry on the answer above;
 * "Additional notes:" goes to the notes of the question above; "N/A" or
 * "Not applicable" ticks the box. Force composition takes "Infantry: Rifle
 * squads, Machine gun teams". Nothing is saved: the result is merged into
 * the builder for the member to check, and every line that matched nothing
 * is handed back so they can see what was missed. This is the fallback: the
 * builder first asks the AI to read the text whatever its layout
 * (ai-import.ts), and only reads it line by line when that is unavailable.
 */

export interface ImportResult {
    values: DoctrineValues
    /** Labels of the questions that were filled. */
    matched: string[]
    /** Lines that matched no question. */
    unmatched: string[]
    /** Pictures from a document attached to the question they sat under. */
    pictures: number
    /** Pictures that came before any question: in the image library, not on the doctrine. */
    unplaced: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()
const NA = /^(n\/?a|not applicable|none|nil)\.?$/i

function findSection(line: string): DoctrineSection | null {
    // "1. Faction name: Takistani Army" is an answer, not a heading.
    if (/:\s*\S/.test(line)) return null
    const m = line.match(/^\s*(?:section\s*)?(\d{1,2})[.):\s-]+\s*(.+?)\s*:?\s*$/i)
    const title = norm(m ? m[2] : line.replace(/:\s*$/, ''))
    return SECTIONS.find(sec => norm(sec.title) === title) ?? (m ? SECTIONS.find(sec => sec.number === Number(m[1]) && title.startsWith(norm(sec.title).split(' ')[0])) ?? null : null)
}

function findField(label: string, section: DoctrineSection | null): DoctrineField | null {
    const n = norm(label)
    if (!n) return null
    const pools = section ? [section.fields, SECTIONS.flatMap(sec => sec.fields)] : [SECTIONS.flatMap(sec => sec.fields)]
    for (const pool of pools) {
        const exact = pool.find(f => norm(f.label) === n)
        if (exact) return exact
    }
    for (const pool of pools) {
        const loose = pool.filter(f => norm(f.label).startsWith(n) || n.startsWith(norm(f.label)))
        if (loose.length === 1) return loose[0]
    }
    // Worded differently ("Name of faction", "Combat style"): the question
    // whose words the label shares most, when that is most of them.
    const mine = words(n)
    if (!mine.size) return null
    for (const pool of pools) {
        let best: DoctrineField | null = null
        let bestScore = 0
        let tied = false
        for (const f of pool) {
            const theirs = words(norm(f.label))
            if (!theirs.size) continue
            let shared = 0
            for (const w of mine) if ([...theirs].some(t => t === w || (w.length > 4 && t.length > 4 && (t.startsWith(w.slice(0, 5)) || w.startsWith(t.slice(0, 5)))))) shared++
            const score = shared / Math.max(theirs.size, mine.size)
            if (score > bestScore) { best = f; bestScore = score; tied = false } else if (score === bestScore && score > 0) tied = true
        }
        if (best && !tied && bestScore >= 0.5) return best
    }
    return null
}

const hasValue = (v: unknown) => Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? !!v.trim() : v != null

const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'or', 'to', 'in', 'on', 'for', 'by', 'with', 'their', 'its', 'is', 'are', 'what', 'how', 'does', 'do', 'they', 'enemy', 'faction'])
function words(n: string): Set<string> {
    return new Set(n.split(' ').filter(w => w.length > 1 && !STOP.has(w)))
}

/** The option as the schema spells it, or the text as typed (a custom option). */
function matchOption(text: string, options: string[] = []): string {
    const n = norm(text)
    return options.find(o => norm(o) === n) ?? text.trim()
}

function splitList(text: string): string[] {
    return text.split(/\s*[,;]\s*|\s+\/\s+|\s*\n\s*/).map(x => x.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
}

export function parseDoctrineText(text: string, base: DoctrineValues): ImportResult {
    const values: DoctrineValues = {
        ...base,
        fields: { ...base.fields }, notes: { ...base.notes }, composition: { ...base.composition },
        na: { ...(base.na ?? {}) }, images: { ...(base.images ?? {}) },
    }
    const matched: string[] = []
    const unmatched: string[] = []
    let pictures = 0
    const unplaced: string[] = []
    let section: DoctrineSection | null = null
    // Where an unlabelled line goes: the answer or the notes of the last question.
    let last = null as { key: string; target: 'field' | 'notes' } | null

    const setField = (f: DoctrineField, raw: string) => {
        const answer = raw.trim()
        if (NA.test(answer)) { values.na[f.key] = true; delete values.fields[f.key] }
        else if (f.type === 'multi') values.fields[f.key] = [...new Set(splitList(answer).map(x => matchOption(x, f.options)))]
        else if (f.type === 'select') values.fields[f.key] = matchOption(answer, f.options)
        else values.fields[f.key] = answer
        if (!matched.includes(f.label)) matched.push(f.label)
    }

    for (const rawLine of text.replace(/\r/g, '').split('\n')) {
        const line = rawLine.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim()
        if (!line) { last = null; continue }

        // A picture from an imported document goes with the question it sat under.
        const pic = line.match(/^\[\[image:(.+)\]\]$/)
        if (pic) {
            const key = last?.key ?? (section?.kind ?? null)
            const url = pic[1].trim()
            if (key && /^(\/|https?:\/\/)/i.test(url)) {
                values.images[key] = [...new Set([...(values.images[key] ?? []), url])]
                pictures++
            } else unplaced.push(url)
            continue
        }

        const heading = findSection(line)
        if (heading) { section = heading; last = null; continue }

        // "Label: answer", or "Label – answer" / "Label - answer" in a document without colons.
        const dash = line.indexOf(':') < 0 ? line.search(/\s[-–—]\s/) : -1
        const colon = line.indexOf(':') >= 0 ? line.indexOf(':') : dash
        const label = colon > 0 ? line.slice(0, colon).replace(/^\d{1,2}[.)]\s*/, '') : ''
        const rest = colon > 0 ? line.slice(colon + (colon === dash ? 2 : 1)).replace(/^[-–—]\s*/, '').trim() : ''

        if (label && /^(additional )?notes?$/i.test(label.trim())) {
            const key = last?.key ?? (section?.kind === 'composition' ? 'composition' : null)
            if (key) { values.notes[key] = [values.notes[key], rest].filter(Boolean).join('\n'); last = { key, target: 'notes' }; continue }
        }

        const category = label ? COMPOSITION.find(c => norm(c.label) === norm(label)) : null
        if (category && rest) {
            for (const sub of splitList(rest)) {
                const name = matchOption(sub, category.subtypes)
                const key = compositionKey(category.key, name)
                if (!values.composition[key]) values.composition[key] = {}
            }
            if (!matched.includes(category.label)) matched.push(category.label)
            last = { key: 'composition', target: 'notes' }
            continue
        }

        const field = label ? findField(label, section) : null
        if (field) {
            if (rest) setField(field, rest)
            else if (!matched.includes(field.label)) matched.push(field.label)
            last = { key: field.key, target: 'field' }
            continue
        }

        // A question on its own line ("Faction name") takes the line below as its answer.
        const awaiting = last?.target === 'field' && !hasValue(values.fields[last.key])
        if (!label && line.length <= 60 && !awaiting) {
            const bare = line.replace(/^\d{1,2}[.)]\s*/, '').replace(/[?.]$/, '')
            // Prose ends in a full stop or runs long; a question on its own line doesn't.
            const own = /[.!]$/.test(line) || bare.split(/\s+/).length > 7 ? null : findField(bare, section)
            if (own) { last = { key: own.key, target: 'field' }; continue }
        }

        // A short "Something:" label that matched nothing is its own line, not more of the answer above.
        if (label && label.length <= 50) { unmatched.push(line); last = null; continue }

        // A continuation of the answer above. Multi-select lines add options; text appends.
        if (last) {
            if (last.target === 'notes') {
                values.notes[last.key] = [values.notes[last.key], line].filter(Boolean).join('\n')
                continue
            }
            const f = SECTIONS.flatMap(sec => sec.fields).find(x => x.key === last!.key)
            if (f?.type === 'multi') {
                const prev = (values.fields[f.key] as string[] | undefined) ?? []
                values.fields[f.key] = [...new Set([...prev, ...splitList(line).map(x => matchOption(x, f.options))])]
                continue
            }
            // Only a long answer runs on; a one-line answer that is already
            // filled does not soak up the prose that follows it.
            const prevText = f ? values.fields[f.key] : undefined
            if (f && (f.type === 'textarea' || (f.type === 'text' && !prevText))) {
                const prev = prevText
                values.fields[f.key] = typeof prev === 'string' && prev ? `${prev}\n${line}` : line
                if (!matched.includes(f.label)) matched.push(f.label)
                continue
            }
            if (f?.type === 'select' && !values.fields[f.key]) { setField(f, line); continue }
        }
        unmatched.push(line)
    }
    return { values, matched, unmatched, pictures, unplaced }
}
