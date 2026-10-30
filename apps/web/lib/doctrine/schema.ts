/**
 * Rows 334 and 335: the Enemy Doctrine schema. The one list of sections,
 * questions and options the builder, both Zeus views, the change rules and
 * the intel comparison all read, so none of them can drift from the others.
 *
 * Every field also takes Additional Notes, stored by the field's key in
 * `DoctrineValues.notes`. Fields marked `significant` are the ones a
 * mid-campaign change to needs J2 Lead approval (see `changes.ts`).
 */

export type FieldType = 'text' | 'textarea' | 'select' | 'multi'

export interface DoctrineField {
    key: string
    label: string
    type: FieldType
    options?: string[]
    /** Changing it mid-campaign needs J2 Lead approval. */
    significant?: boolean
    /** Shown in the Quick Reference. */
    quick?: boolean
    hint?: string
    /** Only asked when the composition has one of these categories. */
    requires?: CompositionCategoryKey[]
}

export interface DoctrineSection {
    key: string
    number: number
    title: string
    fields: DoctrineField[]
    /** Sections with their own editor rather than a field list. */
    kind?: 'composition' | 'indicators'
    /** Shown in the Quick Reference. */
    quick?: boolean
}

const LEVELS = ['Very low', 'Low', 'Moderate', 'High', 'Very high']
export const PROFICIENCY = ['Poorly trained', 'Militia', 'Regular', 'Professional', 'Elite']

export const COMBAT_STYLES = [
    'Combined arms', 'Mechanised warfare', 'Conventional infantry', 'Armoured warfare', 'Guerrilla warfare',
    'Defensive warfare', 'Mobile warfare', 'Special operations', 'Amphibious operations', 'Airborne operations',
]

export const RECON_METHODS = [
    'Foot patrols', 'Vehicle reconnaissance', 'Observation posts', 'UAV surveillance', 'Aerial reconnaissance',
    'Maritime reconnaissance', 'Electronic reconnaissance', 'HUMINT', 'Reconnaissance in force',
]

export const SECTIONS: DoctrineSection[] = [
    {
        key: 'identity', number: 1, title: 'Faction Identity', quick: true,
        fields: [
            { key: 'identity.name', label: 'Faction name', type: 'text', quick: true },
            { key: 'identity.country', label: 'Country / organisation', type: 'text', quick: true },
            { key: 'identity.era', label: 'Era / time period', type: 'text' },
            { key: 'identity.nature', label: 'Conventional, irregular or hybrid', type: 'select', options: ['Conventional', 'Irregular', 'Hybrid'], quick: true },
            { key: 'identity.combatStyle', label: 'Primary combat style', type: 'multi', options: COMBAT_STYLES, significant: true, quick: true },
            { key: 'identity.description', label: 'General description', type: 'textarea' },
            { key: 'identity.strengths', label: 'Strengths', type: 'textarea' },
            { key: 'identity.weaknesses', label: 'Weaknesses', type: 'textarea' },
        ],
    },
    {
        key: 'command', number: 2, title: 'Command and Control', quick: true,
        fields: [
            { key: 'command.structure', label: 'Command structure', type: 'select', options: ['Centralised', 'Balanced', 'Decentralised'], significant: true, quick: true },
            { key: 'command.independence', label: 'Subordinate independence', type: 'select', options: LEVELS },
            { key: 'command.comms', label: 'Communication effectiveness', type: 'select', options: LEVELS },
            { key: 'command.responsiveness', label: 'Command responsiveness', type: 'select', options: LEVELS },
            { key: 'command.coordination', label: 'Coordination between elements', type: 'select', options: LEVELS },
            { key: 'command.lossReaction', label: 'Reaction to loss of command personnel', type: 'select', options: ['Collapses', 'Halts and waits', 'Next in command takes over', 'Continues the last order', 'Becomes more aggressive'], significant: true, quick: true },
        ],
    },
    {
        key: 'quality', number: 3, title: 'Force Quality and Characteristics', quick: true,
        fields: [
            { key: 'quality.training', label: 'Training standard', type: 'select', options: PROFICIENCY, significant: true, quick: true },
            { key: 'quality.discipline', label: 'Discipline', type: 'select', options: LEVELS },
            { key: 'quality.aggression', label: 'Aggression', type: 'select', options: LEVELS, quick: true },
            { key: 'quality.morale', label: 'Morale', type: 'select', options: LEVELS, quick: true },
            { key: 'quality.equipment', label: 'Equipment quality', type: 'select', options: LEVELS },
            { key: 'quality.coordination', label: 'Coordination', type: 'select', options: LEVELS },
            { key: 'quality.adaptability', label: 'Adaptability', type: 'select', options: LEVELS },
        ],
    },
    { key: 'composition', number: 4, title: 'Force Composition', kind: 'composition', quick: true, fields: [] },
    {
        key: 'recon', number: 5, title: 'Reconnaissance and Intelligence', quick: true,
        fields: [
            { key: 'recon.capability', label: 'Reconnaissance capability', type: 'select', options: LEVELS, significant: true, quick: true },
            { key: 'recon.methods', label: 'Methods', type: 'multi', options: RECON_METHODS, significant: true, quick: true },
            { key: 'recon.assets', label: 'Assets', type: 'textarea' },
            { key: 'recon.sharing', label: 'Information sharing', type: 'select', options: ['None', 'Within the element', 'Across the force', 'Immediate and force-wide'] },
            { key: 'recon.reporting', label: 'Detection and reporting behaviour', type: 'textarea' },
            { key: 'recon.reliability', label: 'Intelligence reliability', type: 'select', options: LEVELS },
        ],
    },
    {
        key: 'contact', number: 6, title: 'Contact and Engagement', quick: true,
        fields: [
            {
                key: 'contact.reaction', label: 'Initial reaction to contact', type: 'select', significant: true, quick: true,
                options: ['Hold and report', 'Return fire and hold', 'Engage and coordinate', 'Aggressive engagement', 'Investigate before engagement', 'Avoid contact', 'Ambush and withdraw'],
            },
            { key: 'contact.reporting', label: 'Reporting', type: 'textarea' },
            { key: 'contact.priorities', label: 'Engagement priorities', type: 'textarea', quick: true },
            { key: 'contact.support', label: 'Coordination / support', type: 'textarea' },
            { key: 'contact.commitment', label: 'Commitment level', type: 'select', options: LEVELS },
            { key: 'contact.disengagement', label: 'Disengagement', type: 'textarea', quick: true },
        ],
    },
    {
        key: 'offence', number: 7, title: 'Offensive Behaviour', quick: true,
        fields: [
            {
                key: 'offence.style', label: 'Preferred offensive style', type: 'multi', significant: true, quick: true,
                options: ['Deliberate attack', 'Rapid assault', 'Combined-arms attack', 'Frontal assault', 'Flanking manoeuvre', 'Raids', 'Harassment', 'Ambush', 'Limited offensive capability'],
            },
            { key: 'offence.speed', label: 'Attack speed', type: 'select', options: ['Slow and deliberate', 'Measured', 'Fast', 'Very fast'] },
            { key: 'offence.coordination', label: 'Coordination', type: 'select', options: LEVELS },
            { key: 'offence.support', label: 'Supporting elements', type: 'textarea' },
            { key: 'offence.commit', label: 'Conditions for committing additional forces', type: 'textarea' },
            { key: 'offence.halt', label: 'Conditions for halting or abandoning', type: 'textarea', quick: true },
        ],
    },
    {
        key: 'defence', number: 8, title: 'Defensive Behaviour', quick: true,
        fields: [
            {
                key: 'defence.style', label: 'Defensive style', type: 'multi', significant: true, quick: true,
                options: ['Static defence', 'Defence in depth', 'Mobile defence', 'Strongpoints', 'Dispersed positions', 'Ambush defence', 'Delaying defence'],
            },
            { key: 'defence.prepared', label: 'Prepared positions', type: 'select', options: ['None', 'Hasty', 'Prepared', 'Fortified'] },
            { key: 'defence.depth', label: 'Depth', type: 'select', options: LEVELS },
            { key: 'defence.mobility', label: 'Mobility', type: 'select', options: LEVELS },
            { key: 'defence.reserve', label: 'Reserve employment', type: 'textarea' },
            { key: 'defence.counterattack', label: 'Counterattack behaviour', type: 'textarea', quick: true },
            { key: 'defence.withdrawal', label: 'Withdrawal conditions', type: 'textarea', quick: true },
        ],
    },
    {
        key: 'support', number: 9, title: 'Vehicles, Aviation and Supporting Fires', quick: true,
        fields: [
            { key: 'support.vehicles', label: 'Vehicle employment', type: 'textarea', quick: true, requires: ['vehicles'] },
            { key: 'support.infantryVehicle', label: 'Infantry / vehicle coordination', type: 'select', options: LEVELS, requires: ['vehicles'] },
            { key: 'support.aviation', label: 'Aviation employment', type: 'textarea', quick: true, requires: ['fixedWing', 'rotary', 'unmanned'] },
            { key: 'support.fires', label: 'Artillery / mortar availability', type: 'select', options: ['None', 'On call, limited', 'On call', 'Plentiful'], quick: true, requires: ['fires'] },
            { key: 'support.requests', label: 'Support request procedures', type: 'textarea' },
            { key: 'support.responsiveness', label: 'Support responsiveness', type: 'select', options: LEVELS },
            { key: 'support.restrictions', label: 'Restrictions', type: 'textarea' },
        ],
    },
    {
        key: 'reserves', number: 10, title: 'Reinforcements and Reserves', quick: true,
        fields: [
            { key: 'reserves.availability', label: 'Reserve availability', type: 'select', options: LEVELS },
            {
                key: 'reserves.types', label: 'Reinforcement types', type: 'multi', significant: true, quick: true,
                options: ['No reinforcements', 'Quick reaction force', 'Scheduled waves', 'Objective-triggered', 'Commander-directed'],
            },
            { key: 'reserves.conditions', label: 'Reinforcement conditions', type: 'textarea', quick: true },
            { key: 'reserves.delay', label: 'Delay', type: 'text' },
            { key: 'reserves.limits', label: 'Commitment limitations', type: 'textarea' },
            { key: 'reserves.regroup', label: 'Withdrawal / regrouping', type: 'textarea' },
        ],
    },
    {
        key: 'limits', number: 11, title: 'Operational Limitations',
        fields: [
            { key: 'limits.logistics', label: 'Logistics', type: 'textarea' },
            { key: 'limits.ammunition', label: 'Ammunition', type: 'select', options: ['Critical', 'Limited', 'Adequate', 'Plentiful'] },
            { key: 'limits.fuel', label: 'Fuel', type: 'select', options: ['Critical', 'Limited', 'Adequate', 'Plentiful'] },
            { key: 'limits.comms', label: 'Communications', type: 'textarea' },
            { key: 'limits.morale', label: 'Morale', type: 'textarea' },
            { key: 'limits.readiness', label: 'Readiness', type: 'select', options: LEVELS },
            { key: 'limits.environment', label: 'Environment', type: 'textarea' },
            { key: 'limits.civilians', label: 'Civilian considerations', type: 'textarea' },
        ],
    },
    { key: 'indicators', number: 12, title: 'Enemy Signatures / Recognisable Indicators', kind: 'indicators', fields: [] },
]

/* ── Section 4: force composition ────────────────────────────────────────── */

export type CompositionCategoryKey = 'infantry' | 'vehicles' | 'fixedWing' | 'rotary' | 'unmanned' | 'naval' | 'fires' | 'specialist'

export interface CompositionCategory {
    key: CompositionCategoryKey
    label: string
    subtypes: string[]
    /** Words an intel report might use for this category, for the comparison. */
    terms: string[]
}

export const COMPOSITION: CompositionCategory[] = [
    {
        key: 'infantry', label: 'Infantry', terms: ['infantry', 'troops', 'soldiers', 'squad', 'fireteam', 'platoon', 'riflemen'],
        subtypes: ['Light infantry', 'Medium infantry', 'Motorised infantry', 'Mechanised infantry', 'Armoured infantry', 'Airborne / paratrooper', 'Air assault', 'Naval infantry / marines', 'Special operations', 'Combat divers', 'Militia / irregular', 'Reconnaissance infantry'],
    },
    {
        key: 'vehicles', label: 'Ground Vehicles', terms: ['vehicle', 'tank', 'apc', 'ifv', 'technical', 'truck', 'armour', 'armor', 'mbt', 'btr', 'bmp', 't-72', 't-90'],
        subtypes: ['Utility', 'Technical', 'Reconnaissance', 'APC', 'IFV', 'Main battle tank', 'Light tank', 'Engineering', 'Logistics', 'Self-propelled artillery', 'Air defence'],
    },
    {
        key: 'fixedWing', label: 'Aviation — Fixed Wing', terms: ['jet', 'aircraft', 'plane', 'fighter', 'cas'],
        subtypes: ['Fighters', 'Strike', 'Multirole', 'Reconnaissance', 'Transport'],
    },
    {
        key: 'rotary', label: 'Aviation — Rotary Wing', terms: ['helicopter', 'helo', 'chopper', 'gunship'],
        subtypes: ['Attack helicopter', 'Transport helicopter', 'Utility helicopter', 'Reconnaissance helicopter'],
    },
    {
        key: 'unmanned', label: 'Unmanned Aviation', terms: ['uav', 'drone', 'loitering'],
        subtypes: ['Recon UAV', 'Surveillance UAV', 'Armed UAV', 'Loitering munitions'],
    },
    {
        key: 'naval', label: 'Naval', terms: ['boat', 'vessel', 'ship', 'craft', 'submarine'],
        subtypes: ['Patrol craft', 'Landing craft', 'Amphibious vessels', 'Surface combatants', 'Submarines', 'Naval support'],
    },
    {
        key: 'fires', label: 'Fire Support', terms: ['mortar', 'artillery', 'rocket', 'mlrs', 'aa', 'anti-air', 'manpads', 'atgm', 'hmg', 'gpmg'],
        subtypes: ['Mortars', 'Towed artillery', 'Self-propelled artillery', 'Rocket artillery', 'Anti-tank', 'Air defence', 'Static heavy weapons'],
    },
    {
        key: 'specialist', label: 'Specialist Elements', terms: ['sniper', 'marksman', 'engineer', 'jammer', 'jamming', 'ew', 'medic', 'radio', 'command post', 'hq'],
        subtypes: ['Reconnaissance teams', 'Snipers / marksmen', 'Combat engineers', 'Electronic warfare', 'Communications', 'Medical', 'Logistics', 'Command'],
    },
]

export const COMPOSITION_DETAIL_FIELDS: { key: keyof CompositionDetail; label: string }[] = [
    { key: 'name', label: 'Specific unit / equipment' },
    { key: 'designation', label: 'Designation' },
    { key: 'strength', label: 'Approximate strength' },
    { key: 'count', label: 'Number of vehicles / assets' },
    { key: 'proficiency', label: 'Proficiency' },
    { key: 'role', label: 'Battlefield role' },
    { key: 'support', label: 'Supporting elements' },
    { key: 'restrictions', label: 'Restrictions' },
    { key: 'classRef', label: 'Arma / mod class (optional)' },
    { key: 'notes', label: 'Additional Notes' },
]

export interface CompositionDetail {
    name?: string
    designation?: string
    strength?: string
    count?: string
    proficiency?: string
    role?: string
    support?: string
    restrictions?: string
    classRef?: string
    notes?: string
}

/** `infantry.Light infantry` and the like. */
export const compositionKey = (cat: CompositionCategoryKey, subtype: string) => `${cat}.${subtype}`

export function splitCompositionKey(key: string): { category: CompositionCategory | undefined; subtype: string } {
    const i = key.indexOf('.')
    const cat = key.slice(0, i)
    return { category: COMPOSITION.find(c => c.key === cat), subtype: key.slice(i + 1) }
}

/* ── Section 12 and the advanced modules ─────────────────────────────────── */

export interface Indicator { observed: string; interpretation: string; capability: string; reliability: string; notes: string }
export interface ForceLayer { layer: string; units: string; strength: string; role: string; area: string; activation: string; notes: string }
export interface Trigger { event: string; response: string }

export const RELIABILITY = ['Unreliable', 'Sometimes', 'Usually', 'Almost always']

export const FORCE_LAYERS = ['Reconnaissance / screening', 'Main force', 'Supporting elements', 'Command', 'Reserve / reinforcement']

export const TRIGGER_EVENTS = [
    'Enemy sighted', 'Contact reported', 'Objective attacked', 'Objective captured', 'Casualty threshold',
    'Support unavailable', 'Command element lost', 'Mission phase changed', 'Manual Zeus decision',
]

/** Collapsed by default; a basic doctrine is complete without opening any of them. */
export const ADVANCED_MODULES: { key: string; title: string; kind: 'text' | 'layers' | 'triggers'; hint: string }[] = [
    { key: 'organisation', title: 'Detailed force organisation', kind: 'text', hint: 'Order of battle beyond Section 4: echelons, attachments, call signs.' },
    { key: 'deployment', title: 'Battlefield deployment / force layers', kind: 'layers', hint: 'Where each layer sits and what activates it. Refines Section 4 rather than repeating it.' },
    { key: 'detection', title: 'Detection and communications', kind: 'text', hint: 'How the enemy detects, reports and passes information. Refines Section 5.' },
    { key: 'triggers', title: 'Behaviour / reinforcement triggers', kind: 'triggers', hint: 'Reference instructions for Zeus. Choosing these does not change Arma AI.' },
    { key: 'limitations', title: 'Operational limitations (detail)', kind: 'text', hint: 'Refines Section 11.' },
]

/* ── The values ──────────────────────────────────────────────────────────── */

export interface DoctrineValues {
    fields: Record<string, string | string[]>
    notes: Record<string, string>
    composition: Record<string, CompositionDetail>
    indicators: Indicator[]
    layers: ForceLayer[]
    triggers: Trigger[]
    modules: Record<string, string>
    /** Ticked "Not applicable", by field key (or `composition` / `indicators` for those sections). Counts as complete. */
    na: Record<string, boolean>
    /** Pictures attached to a field (or section), by the same keys as `na`. Uploaded or picked from the site library. */
    images: Record<string, string[]>
}

export const EMPTY_VALUES: DoctrineValues = { fields: {}, notes: {}, composition: {}, indicators: [], layers: [], triggers: [], modules: {}, na: {}, images: {} }

/** The `na` / `images` keys that are sections rather than fields. */
export const SECTION_KEYS = ['composition', 'indicators'] as const

export const ALL_FIELDS: DoctrineField[] = SECTIONS.flatMap(sec => sec.fields)
export const FIELD_BY_KEY = new Map(ALL_FIELDS.map(f => [f.key, f]))

/** Categories present in the composition, for the `requires` rule. */
export function presentCategories(v: Pick<DoctrineValues, 'composition'>): Set<CompositionCategoryKey> {
    return new Set(Object.keys(v.composition).map(k => splitCompositionKey(k).category?.key).filter((k): k is CompositionCategoryKey => !!k))
}

export function fieldApplies(f: DoctrineField, present: Set<CompositionCategoryKey>): boolean {
    return !f.requires || f.requires.some(r => present.has(r))
}

/** A custom option added in the builder: usable at once, pending J2 Lead review to become global. */
export interface DoctrineCustomOption {
    id: string
    fieldKey: string
    label: string
    description: string
    status: 'pending' | 'approved' | 'rejected' | 'merged'
    mergedInto?: string
    reviewNote?: string
    addedById: string
    addedByName: string
    addedAt: string
}

/** Answered, or ticked Not applicable: the builder turns the box green. */
export function fieldComplete(v: DoctrineValues, key: string): boolean {
    if (v.na?.[key]) return true
    if (key === 'composition') return Object.keys(v.composition).length > 0
    if (key === 'indicators') return v.indicators.length > 0
    const val = v.fields[key]
    return Array.isArray(val) ? val.length > 0 : !!val?.trim()
}

/** Every box in the section that applies is complete. */
export function sectionComplete(v: DoctrineValues, sec: DoctrineSection, present: Set<CompositionCategoryKey>): boolean {
    if (sec.kind) return fieldComplete(v, sec.kind)
    const fields = sec.fields.filter(f => fieldApplies(f, present))
    return fields.length > 0 && fields.every(f => fieldComplete(v, f.key))
}
