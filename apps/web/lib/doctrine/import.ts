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
 * is handed back so they can see what was missed.
 */

export interface ImportResult {
    values: DoctrineValues
    /** Labels of the questions that were filled. */
    matched: string[]
    /** Lines that matched no question. */
    unmatched: string[]
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
    return null
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

        const heading = findSection(line)
        if (heading) { section = heading; last = null; continue }

        const colon = line.indexOf(':')
        const label = colon > 0 ? line.slice(0, colon).replace(/^\d{1,2}[.)]\s*/, '') : ''
        const rest = colon > 0 ? line.slice(colon + 1).trim() : ''

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
            if (f && (f.type === 'textarea' || f.type === 'text')) {
                const prev = values.fields[f.key]
                values.fields[f.key] = typeof prev === 'string' && prev ? `${prev}\n${line}` : line
                if (!matched.includes(f.label)) matched.push(f.label)
                continue
            }
            if (f?.type === 'select' && !values.fields[f.key]) { setField(f, line); continue }
        }
        unmatched.push(line)
    }
    return { values, matched, unmatched }
}
