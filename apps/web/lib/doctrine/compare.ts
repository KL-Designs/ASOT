import { COMPOSITION, FIELD_BY_KEY, RECON_METHODS, splitCompositionKey, type DoctrineValues } from './schema'
import { LEVEL_LABEL, type DoctrineLevel } from './values'

/**
 * Row 335 with 331: compare one intel entry with the doctrine in force.
 * **Advisory only.** It lists where the report's words line up with the
 * doctrine and where the report mentions something the doctrine does not
 * list. It never marks intel true or false: a faction having a capability
 * does not prove it was there on the night, and the assessor decides.
 */

export type MatchCategory = 'equipment' | 'composition' | 'recon' | 'behaviour' | 'assets'

export interface DoctrineMatch {
    category: MatchCategory
    /** What the report said. */
    term: string
    /** Where it sits in the doctrine. */
    doctrine: string
    level: DoctrineLevel | null
}

export interface DoctrineComparison {
    matches: DoctrineMatch[]
    /** Categories the report mentions that the doctrine in force does not list. */
    notListed: { category: MatchCategory; term: string; doctrine: string }[]
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ')

function mentions(text: string, term: string): boolean {
    const t = term.toLowerCase().trim()
    if (t.length < 2) return false
    // Whole word or phrase, so "aa" does not match "baa".
    return new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?($|[^a-z0-9])`).test(text)
}

export function compareIntel(
    entry: { title: string; description: string; evidence?: { caption: string }[] },
    doctrine: DoctrineValues,
    sources: { fields: Record<string, DoctrineLevel>; composition: Record<string, DoctrineLevel> },
): DoctrineComparison {
    const text = words([entry.title, entry.description, ...(entry.evidence ?? []).map(e => e.caption)].join(' '))
    const matches: DoctrineMatch[] = []
    const notListed: DoctrineComparison['notListed'] = []
    const seen = new Set<string>()
    const push = (m: DoctrineMatch) => {
        const k = `${m.category}|${m.doctrine}`
        if (!seen.has(k)) { seen.add(k); matches.push(m) }
    }

    // Specific units and equipment named in Section 4, then the unit types themselves.
    const present = new Set<string>()
    for (const [key, detail] of Object.entries(doctrine.composition)) {
        const { category, subtype } = splitCompositionKey(key)
        if (!category) continue
        present.add(category.key)
        const where = `${category.label} › ${subtype}`
        const level = sources.composition[key] ?? null
        for (const name of [detail.name, detail.designation].filter((x): x is string => !!x)) {
            for (const part of name.split(/[,/;]+/).map(p => p.trim()).filter(Boolean)) {
                if (mentions(text, part)) push({ category: 'equipment', term: part, doctrine: `${where}: ${name}`, level })
            }
        }
        if (mentions(text, subtype)) push({ category: 'composition', term: subtype, doctrine: where, level })
    }

    // The report names a kind of force the doctrine has no entry for at all.
    for (const cat of COMPOSITION) {
        const hit = cat.terms.find(t => mentions(text, t)) ?? cat.subtypes.find(s => mentions(text, s))
        if (!hit) continue
        if (present.has(cat.key)) {
            if (!matches.some(m => m.doctrine.startsWith(cat.label))) push({ category: 'composition', term: hit, doctrine: cat.label, level: null })
        } else {
            notListed.push({ category: cat.key === 'fires' ? 'assets' : 'composition', term: hit, doctrine: cat.label })
        }
    }

    // Reconnaissance methods, and the chosen behaviours.
    const methods = (doctrine.fields['recon.methods'] as string[] | undefined) ?? []
    for (const m of RECON_METHODS.concat(methods)) {
        const key = m.toLowerCase().split(' ')[0]
        if (!mentions(text, key) && !mentions(text, m)) continue
        if (methods.includes(m)) push({ category: 'recon', term: m, doctrine: `Reconnaissance methods: ${m}`, level: sources.fields['recon.methods'] ?? null })
        else notListed.push({ category: 'recon', term: m, doctrine: 'Reconnaissance methods' })
    }
    for (const key of ['contact.reaction', 'offence.style', 'defence.style', 'reserves.types', 'identity.combatStyle']) {
        const v = doctrine.fields[key]
        for (const opt of Array.isArray(v) ? v : v ? [v] : []) {
            const head = opt.toLowerCase().split(/[ -]/)[0]
            if (head.length > 3 && mentions(text, head)) {
                push({ category: 'behaviour', term: head, doctrine: `${FIELD_BY_KEY.get(key)?.label}: ${opt}`, level: sources.fields[key] ?? null })
            }
        }
    }
    // Recognisable indicators, written for exactly this.
    for (const ind of doctrine.indicators) {
        const head = ind.observed.trim()
        if (head && mentions(text, head)) push({ category: 'behaviour', term: head, doctrine: `Indicator: ${ind.interpretation || head}`, level: null })
    }

    return { matches, notListed }
}

export function levelName(level: DoctrineLevel | null): string {
    return level ? `${LEVEL_LABEL[level]} doctrine` : 'Doctrine'
}
