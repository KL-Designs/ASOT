import {
    ADVANCED_MODULES, ALL_FIELDS, COMPOSITION_DETAIL_FIELDS, EMPTY_VALUES, FIELD_BY_KEY, SECTION_KEYS, splitCompositionKey,
    type CompositionDetail, type DoctrineValues, type ForceLayer, type Indicator, type Trigger,
} from './schema'

/**
 * Rows 334 and 335: doctrine values, inheritance and change control. Pure.
 *
 * Inheritance is Faction → Campaign → Mission, and each level stores only
 * what it changes on top of the one above (`DoctrineOverrides`). The builder
 * always edits the *effective* doctrine and `diffOverrides` works out what
 * that level changed, so a mission edit can never write into the campaign or
 * the faction.
 */

export interface DoctrineOverrides {
    fields?: Record<string, string | string[] | null>
    notes?: Record<string, string | null>
    composition?: Record<string, CompositionDetail | null>
    modules?: Record<string, string | null>
    indicators?: Indicator[]
    layers?: ForceLayer[]
    triggers?: Trigger[]
    na?: Record<string, boolean | null>
    images?: Record<string, string[] | null>
}

export type DoctrineLevel = 'faction' | 'campaign' | 'mission'

/* ── Sanitising ──────────────────────────────────────────────────────────── */

const str = (v: unknown, n = 4000) => typeof v === 'string' ? v.slice(0, n) : ''
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}

function cleanDetail(raw: unknown): CompositionDetail {
    const r = obj(raw)
    const out: CompositionDetail = {}
    for (const { key } of COMPOSITION_DETAIL_FIELDS) {
        const v = str(r[key], 2000).trim()
        if (v) out[key] = v
    }
    return out
}

function cleanList<T extends object>(raw: unknown, keys: (keyof T)[], max = 60): T[] {
    if (!Array.isArray(raw)) return []
    return raw.slice(0, max).map(item => {
        const r = obj(item)
        const out = {} as Record<keyof T, string>
        for (const k of keys) out[k] = str(r[k as string], 2000)
        return out as T
    }).filter(item => Object.values(item).some(v => typeof v === 'string' && v.trim()))
}

const INDICATOR_KEYS: (keyof Indicator)[] = ['observed', 'interpretation', 'capability', 'reliability', 'notes']
const LAYER_KEYS: (keyof ForceLayer)[] = ['layer', 'units', 'strength', 'role', 'area', 'activation', 'notes']
const TRIGGER_KEYS: (keyof Trigger)[] = ['event', 'response']
const MODULE_KEYS = new Set(ADVANCED_MODULES.map(m => m.key))

/**
 * Only known fields, known composition categories and non-empty values
 * survive. Custom subtypes and options are allowed (they are how custom
 * options work), so a value is not checked against the option list.
 */
export function sanitiseValues(raw: unknown): DoctrineValues {
    const r = obj(raw)
    const fields: DoctrineValues['fields'] = {}
    for (const [k, v] of Object.entries(obj(r.fields))) {
        const f = FIELD_BY_KEY.get(k)
        if (!f) continue
        if (f.type === 'multi') {
            const list = Array.isArray(v) ? [...new Set(v.map(x => str(x, 200).trim()).filter(Boolean))].slice(0, 40) : []
            if (list.length) fields[k] = list
        } else {
            const s = str(v, f.type === 'textarea' ? 8000 : 400).trim()
            if (s) fields[k] = s
        }
    }
    const notes: DoctrineValues['notes'] = {}
    for (const [k, v] of Object.entries(obj(r.notes))) {
        const s = str(v, 4000).trim()
        if (s && k.length < 200) notes[k] = s
    }
    const composition: DoctrineValues['composition'] = {}
    for (const [k, v] of Object.entries(obj(r.composition))) {
        const { category, subtype } = splitCompositionKey(k)
        // A custom subtype under a known category is fine; an unknown category is not.
        if (!category || !subtype.trim() || subtype.length > 120) continue
        if (Object.keys(composition).length >= 200) break
        composition[k] = cleanDetail(v)
    }
    const modules: DoctrineValues['modules'] = {}
    for (const [k, v] of Object.entries(obj(r.modules))) {
        const s = str(v, 8000).trim()
        if (s && MODULE_KEYS.has(k)) modules[k] = s
    }
    const boxKey = (k: string) => FIELD_BY_KEY.has(k) || (SECTION_KEYS as readonly string[]).includes(k)
    const na: DoctrineValues['na'] = {}
    for (const [k, v] of Object.entries(obj(r.na))) if (v === true && boxKey(k)) na[k] = true
    const images: DoctrineValues['images'] = {}
    for (const [k, v] of Object.entries(obj(r.images))) {
        if (!boxKey(k) || !Array.isArray(v)) continue
        const list = [...new Set(v.map(x => str(x, 600).trim()).filter(u => /^(\/|https?:\/\/)/i.test(u)))].slice(0, 12)
        if (list.length) images[k] = list
    }
    return {
        fields, notes, composition, modules, na, images,
        indicators: cleanList<Indicator>(r.indicators, INDICATOR_KEYS),
        layers: cleanList<ForceLayer>(r.layers, LAYER_KEYS),
        triggers: cleanList<Trigger>(r.triggers, TRIGGER_KEYS),
    }
}

/* ── Inheritance ─────────────────────────────────────────────────────────── */

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function diffMap<T>(base: Record<string, T>, edited: Record<string, T>): Record<string, T | null> | undefined {
    const out: Record<string, T | null> = {}
    for (const k of new Set([...Object.keys(base), ...Object.keys(edited)])) {
        if (!same(base[k], edited[k])) out[k] = k in edited ? edited[k] : null
    }
    return Object.keys(out).length ? out : undefined
}

/** What `edited` changes on top of `base`. Removed keys are recorded as null. */
export function diffOverrides(base: DoctrineValues, edited: DoctrineValues): DoctrineOverrides {
    const out: DoctrineOverrides = {}
    const f = diffMap(base.fields, edited.fields); if (f) out.fields = f
    const n = diffMap(base.notes, edited.notes); if (n) out.notes = n
    const c = diffMap(base.composition, edited.composition); if (c) out.composition = c
    const m = diffMap(base.modules, edited.modules); if (m) out.modules = m
    const a = diffMap(base.na ?? {}, edited.na ?? {}); if (a) out.na = a
    const i = diffMap(base.images ?? {}, edited.images ?? {}); if (i) out.images = i
    if (!same(base.indicators, edited.indicators)) out.indicators = edited.indicators
    if (!same(base.layers, edited.layers)) out.layers = edited.layers
    if (!same(base.triggers, edited.triggers)) out.triggers = edited.triggers
    return out
}

function applyMap<T>(base: Record<string, T>, ov: Record<string, T | null> | undefined): Record<string, T> {
    if (!ov) return base
    const out = { ...base }
    for (const [k, v] of Object.entries(ov)) {
        if (v === null) delete out[k]
        else out[k] = v
    }
    return out
}

export function applyOverrides(base: DoctrineValues, ov: DoctrineOverrides | null | undefined): DoctrineValues {
    if (!ov) return base
    return {
        fields: applyMap(base.fields, ov.fields),
        notes: applyMap(base.notes, ov.notes),
        composition: applyMap(base.composition, ov.composition),
        modules: applyMap(base.modules, ov.modules),
        na: applyMap(base.na ?? {}, ov.na),
        images: applyMap(base.images ?? {}, ov.images),
        indicators: ov.indicators ?? base.indicators,
        layers: ov.layers ?? base.layers,
        triggers: ov.triggers ?? base.triggers,
    }
}

/** Faction first. Each level's overrides on top of the last. */
export function resolveChain(chain: (DoctrineOverrides | null | undefined)[]): DoctrineValues {
    return chain.reduce<DoctrineValues>((acc, ov) => applyOverrides(acc, ov), EMPTY_VALUES)
}

/** Which level last set each field and composition entry, for provenance in the views and the comparison. */
export function sourcesOf(chain: { level: DoctrineLevel; overrides: DoctrineOverrides | null | undefined }[]) {
    const fields: Record<string, DoctrineLevel> = {}
    const composition: Record<string, DoctrineLevel> = {}
    for (const { level, overrides } of chain) {
        for (const [k, v] of Object.entries(overrides?.fields ?? {})) { if (v === null) delete fields[k]; else fields[k] = level }
        for (const [k, v] of Object.entries(overrides?.composition ?? {})) { if (v === null) delete composition[k]; else composition[k] = level }
    }
    return { fields, composition }
}

/** The version in force at a moment: the latest published at or before it. */
export function versionAt<T extends { version: number; publishedAt: Date | string }>(versions: T[], at: Date | null): T | null {
    const sorted = [...versions].sort((a, b) => b.version - a.version)
    if (!at) return sorted[0] ?? null
    return sorted.find(v => new Date(v.publishedAt).getTime() <= at.getTime()) ?? null
}

/* ── Change control ──────────────────────────────────────────────────────── */

export interface DoctrineChange {
    key: string
    label: string
    kind: 'field' | 'notes' | 'composition' | 'list' | 'module'
    significant: boolean
    before: string
    after: string
}

const show = (v: unknown): string => Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : v ? JSON.stringify(v) : ''

/** How many structural changes (choices, composition, lists) collectively count as significant. */
export const COLLECTIVE_THRESHOLD = 6

export function changesBetween(before: DoctrineValues, after: DoctrineValues): DoctrineChange[] {
    const out: DoctrineChange[] = []
    for (const k of new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])) {
        if (same(before.fields[k], after.fields[k])) continue
        const f = FIELD_BY_KEY.get(k)
        out.push({ key: k, label: f?.label ?? k, kind: 'field', significant: !!f?.significant, before: show(before.fields[k]), after: show(after.fields[k]) })
    }
    for (const k of new Set([...Object.keys(before.composition), ...Object.keys(after.composition)])) {
        if (same(before.composition[k], after.composition[k])) continue
        const { category, subtype } = splitCompositionKey(k)
        const added = !(k in before.composition), removed = !(k in after.composition)
        out.push({
            key: `composition.${k}`, label: `${category?.label ?? 'Composition'} › ${subtype}`, kind: 'composition',
            // A unit type appearing or disappearing is a major composition change; editing its details is not.
            significant: added || removed,
            before: removed || !added ? show(before.composition[k]?.name ?? 'present') : '',
            after: added || !removed ? show(after.composition[k]?.name ?? 'present') : '',
        })
    }
    for (const k of new Set([...Object.keys(before.notes), ...Object.keys(after.notes)])) {
        if (same(before.notes[k], after.notes[k])) continue
        out.push({ key: `notes.${k}`, label: `Notes: ${FIELD_BY_KEY.get(k)?.label ?? k}`, kind: 'notes', significant: false, before: show(before.notes[k]), after: show(after.notes[k]) })
    }
    for (const k of new Set([...Object.keys(before.modules), ...Object.keys(after.modules)])) {
        if (same(before.modules[k], after.modules[k])) continue
        out.push({ key: `modules.${k}`, label: ADVANCED_MODULES.find(m => m.key === k)?.title ?? k, kind: 'module', significant: false, before: show(before.modules[k]), after: show(after.modules[k]) })
    }
    const boxLabel = (k: string) => FIELD_BY_KEY.get(k)?.label ?? (k === 'composition' ? 'Force composition' : k === 'indicators' ? 'Indicators' : k)
    for (const k of new Set([...Object.keys(before.na ?? {}), ...Object.keys(after.na ?? {})])) {
        if (same(before.na?.[k], after.na?.[k])) continue
        out.push({ key: `na.${k}`, label: `Not applicable: ${boxLabel(k)}`, kind: 'notes', significant: false, before: before.na?.[k] ? 'Yes' : '', after: after.na?.[k] ? 'Yes' : '' })
    }
    for (const k of new Set([...Object.keys(before.images ?? {}), ...Object.keys(after.images ?? {})])) {
        if (same(before.images?.[k], after.images?.[k])) continue
        out.push({ key: `images.${k}`, label: `Pictures: ${boxLabel(k)}`, kind: 'notes', significant: false, before: `${before.images?.[k]?.length ?? 0} picture(s)`, after: `${after.images?.[k]?.length ?? 0} picture(s)` })
    }
    const lists: [keyof Pick<DoctrineValues, 'indicators' | 'layers' | 'triggers'>, string][] = [['indicators', 'Indicators'], ['layers', 'Force layers'], ['triggers', 'Behaviour triggers']]
    for (const [k, label] of lists) {
        if (!same(before[k], after[k])) out.push({ key: k, label, kind: 'list', significant: false, before: `${before[k].length} entries`, after: `${after[k].length} entries` })
    }
    return out
}

/**
 * Needs J2 Lead approval? Any significant field, any unit type added or
 * removed, or enough structural changes that together alter behaviour.
 * Text edits never count on their own: spelling, wording and clarification
 * are free. `before` is the last *approved* version, not the last published,
 * so a big change split into small publishes still adds up.
 */
export function needsApproval(changes: DoctrineChange[]): { required: boolean; reasons: string[] } {
    const reasons: string[] = []
    const significant = changes.filter(c => c.significant)
    if (significant.length) reasons.push(`Significant: ${significant.map(c => c.label).join('; ')}`)
    const structural = changes.filter(c => {
        if (c.kind === 'composition' || c.kind === 'list') return true
        if (c.kind !== 'field') return false
        const f = FIELD_BY_KEY.get(c.key)
        return f?.type === 'select' || f?.type === 'multi'
    })
    if (!significant.length && structural.length >= COLLECTIVE_THRESHOLD) reasons.push(`${structural.length} changes that together alter behaviour`)
    return { required: reasons.length > 0, reasons }
}

/* ── Views ───────────────────────────────────────────────────────────────── */

export const LEVEL_LABEL: Record<DoctrineLevel, string> = { faction: 'Faction', campaign: 'Campaign', mission: 'Mission' }

export function displayValue(v: string | string[] | undefined): string {
    return Array.isArray(v) ? v.join(', ') : v ?? ''
}

/** Is there anything at all? An empty doctrine renders as a prompt rather than twelve blank sections. */
export function hasContent(v: DoctrineValues): boolean {
    return Object.keys(v.fields).length > 0 || Object.keys(v.composition).length > 0 || v.indicators.length > 0 || Object.keys(v.images ?? {}).length > 0
}

export { ALL_FIELDS }
