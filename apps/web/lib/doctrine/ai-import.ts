import { ADVANCED_MODULES, COMPOSITION, COMPOSITION_DETAIL_FIELDS, FIELD_BY_KEY, FORCE_LAYERS, RELIABILITY, SECTIONS, TRIGGER_EVENTS, type DoctrineValues } from './schema'
import { sanitiseValues } from './values'
import type { ImportResult } from './import'

/**
 * Row 334: reading a doctrine written any old way. The "Question: answer"
 * importer (`import.ts`) only works on text laid out like the builder; a
 * real write-up is headings, prose and bullet points. This asks the AI to
 * place what it says into the builder's own questions and options, and the
 * answer is put through the same sanitiser as anything else saved, so it can
 * only ever fill known questions. Pure: the route makes the call.
 */

export const DOCTRINE_IMPORT_SYSTEM_PROMPT = `You fill in an enemy doctrine form for an ARMA 3 milsim unit from a document a mission maker wrote.
Read the whole document and decide where each piece of information belongs, whatever its layout or wording.
Reply with one JSON object and nothing else, in this shape:
{"fields": {"<key>": "<text>" or ["<option>", ...]}, "notes": {"<key>": "<extra detail>"}, "na": {"<key>": true},
 "composition": {"<category>.<subtype>": {"name": "", "designation": "", "strength": "", "count": "", "role": "", "proficiency": "", "equipment": "", "notes": ""}},
 "indicators": [{"observed": "", "interpretation": "", "capability": "", "reliability": "", "notes": ""}],
 "layers": [{"layer": "", "units": "", "strength": "", "role": "", "area": "", "activation": "", "notes": ""}],
 "triggers": [{"event": "", "response": ""}], "modules": {"<module key>": "<text>"},
 "images": {"<key>": ["<url>"]}}
Rules:
- Use only the keys listed. Leave out anything the document does not cover; never invent.
- select: choose the single closest listed option. If none is close, use the document's own short wording.
- multi: a list of the closest listed options; add the document's own wording for anything not listed.
- text / textarea: the document's information in clear sentences, keeping its specifics (names, numbers, places).
- Detail that does not fit the answer itself goes in notes under the same key.
- Only mark na when the document says the thing does not apply or the faction has none.
- composition keys are "<category key>.<subtype>"; prefer the listed subtypes.
- A line "[[image:URL]]" is a picture. Put its URL in images under the key of the question the text around it is about ("composition" or "indicators" for those sections).`

export function doctrineSchemaForPrompt(): string {
    const lines: string[] = ['QUESTIONS (key | type | label | options):']
    for (const sec of SECTIONS) {
        lines.push(`## ${sec.number}. ${sec.title}${sec.kind ? ` (use "${sec.kind}")` : ''}`)
        for (const f of sec.fields) lines.push(`${f.key} | ${f.type} | ${f.label}${f.options?.length ? ` | ${f.options.join('; ')}` : ''}`)
    }
    lines.push('', 'COMPOSITION CATEGORIES (category key | label | subtypes):')
    for (const c of COMPOSITION) lines.push(`${c.key} | ${c.label} | ${c.subtypes.join('; ')}`)
    lines.push(`Composition detail keys: ${COMPOSITION_DETAIL_FIELDS.map(d => d.key).join(', ')}`)
    lines.push('', `Indicator reliability: ${RELIABILITY.join('; ')}`)
    lines.push(`Force layers: ${FORCE_LAYERS.join('; ')}`)
    lines.push(`Trigger events: ${TRIGGER_EVENTS.join('; ')}`)
    lines.push(`Modules (key | title): ${ADVANCED_MODULES.filter(m => m.kind === 'text').map(m => `${m.key} | ${m.title}`).join('; ')}`)
    return lines.join('\n')
}

/** The JSON object out of a reply that may wrap it in prose or a code fence. */
export function extractJson(reply: string): unknown {
    const start = reply.indexOf('{')
    const end = reply.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try { return JSON.parse(reply.slice(start, end + 1)) } catch { return null }
}

/**
 * Merge what the AI placed onto what the builder already holds. The AI's
 * answers win where it gave one; lists it returned are added to, not swapped.
 */
export function mergeAiDoctrine(reply: unknown, base: DoctrineValues): ImportResult {
    const got = sanitiseValues(reply)
    const values: DoctrineValues = {
        ...base,
        fields: { ...base.fields, ...got.fields },
        notes: { ...base.notes, ...Object.fromEntries(Object.entries(got.notes).map(([k, v]) => [k, base.notes[k] && !base.notes[k].includes(v) ? `${base.notes[k]}\n${v}` : v])) },
        composition: { ...base.composition, ...got.composition },
        modules: { ...base.modules, ...got.modules },
        na: { ...(base.na ?? {}), ...got.na },
        images: { ...(base.images ?? {}) },
        indicators: [...base.indicators, ...got.indicators],
        layers: [...base.layers, ...got.layers],
        triggers: [...base.triggers, ...got.triggers],
    }
    let pictures = 0
    for (const [k, urls] of Object.entries(got.images)) {
        values.images[k] = [...new Set([...(values.images[k] ?? []), ...urls])]
        pictures += urls.length
    }
    for (const k of Object.keys(got.na)) delete values.fields[k]
    const matched = [
        ...new Set([...Object.keys(got.fields), ...Object.keys(got.na), ...Object.keys(got.notes)].map(k => FIELD_BY_KEY.get(k)?.label ?? (k === 'composition' ? 'Force composition' : k))),
        ...(Object.keys(got.composition).length ? [`Force composition (${Object.keys(got.composition).length})`] : []),
        ...(got.indicators.length ? [`Indicators (${got.indicators.length})`] : []),
        ...(got.layers.length ? [`Force layers (${got.layers.length})`] : []),
        ...(got.triggers.length ? [`Triggers (${got.triggers.length})`] : []),
        ...Object.keys(got.modules).map(k => ADVANCED_MODULES.find(m => m.key === k)?.title ?? k),
    ]
    return { values, matched, unmatched: [], pictures, unplaced: [] }
}
