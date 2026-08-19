/* ============================================================================
   HZN-MED — the patient model.

   A parody of the ARMA 3 ACE + KAT medical model: body parts carry wounds and
   fractures, wounds bleed until they are dressed, bleeding drains volume, and
   losing enough volume arrests the casualty.

   Everything here is pure and serialisable. Treatments in ./actions.ts mutate a
   Patient in place; the component clones before handing one over, so the
   mutation never escapes. That shape is deliberate — it is what lets the whole
   action table be swapped for server calls later without touching the UI.
   ========================================================================== */

export type PartId = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR'

export const PARTS: { id: PartId, name: string }[] = [
    { id: 'head',  name: 'Head' },
    { id: 'torso', name: 'Torso' },
    { id: 'armL',  name: 'Left Arm' },
    { id: 'armR',  name: 'Right Arm' },
    { id: 'legL',  name: 'Left Leg' },
    { id: 'legR',  name: 'Right Leg' },
]

export type WoundKind = 'scrape' | 'cut' | 'avulsion' | 'mvw' | 'hvw' | 'frag' | 'crush'

/** name, severity 1–3, bleed rate. */
export const WOUND_TYPES: Record<WoundKind, { name: string, sev: 1 | 2 | 3, bleed: number }> = {
    scrape:   { name: 'Small Abrasion',            sev: 1, bleed: 0.4 },
    cut:      { name: 'Medium Cut',                sev: 1, bleed: 0.8 },
    avulsion: { name: 'Medium Avulsion',           sev: 2, bleed: 1.4 },
    mvw:      { name: 'Medium Velocity Wound',     sev: 2, bleed: 2.0 },
    hvw:      { name: 'High Velocity Wound',       sev: 3, bleed: 3.4 },
    frag:     { name: 'Large Fragmentation Wound', sev: 3, bleed: 3.0 },
    crush:    { name: 'Large Crush Wound',         sev: 3, bleed: 1.6 },
}

export interface Wound { t: WoundKind, n: number, bandaged: boolean }

export interface BodyPart {
    id: PartId
    wounds: Wound[]
    fractured: boolean
    tourniquet: boolean
    splinted: boolean
    iv: number
    checked: boolean
}

export type Triage = 'none' | 'minor' | 'delayed' | 'immediate' | 'deceased'

export interface Patient {
    name: string
    /** Rank abbreviation, or '' for a member the roster has none for. */
    rank: string
    /** Bare, without quotes — the header adds those. '' when they have none. */
    callsign: string
    /** Element and billet, already joined: "1-1-1 ALPHA · MACHINEGUNNER". */
    unit: string
    /** Discord avatar URL, or '' — the head falls back to a blank shape. */
    avatar: string
    bloodType: string
    bloodTypeKnown: boolean
    parts: Record<PartId, BodyPart>
    /** Volume, as a percentage. */
    blood: number
    /** 0–100. */
    pain: number
    hr: number
    sysBp: number
    diaBp: number
    spo2: number
    rr: number
    etco2: number
    temp: number
    conscious: boolean
    cardiacArrest: boolean
    airway: string
    meds: string[]
    tqCount: number
    triage: Triage
    triageEntries: { stamp: string, text: string }[]
    cprActive: boolean
}

function mkPart(id: PartId): BodyPart {
    return { id, wounds: [], fractured: false, tourniquet: false, splinted: false, iv: 0, checked: false }
}

/**
 * Who is on the table: how you would say their name over the net.
 *
 * `rank` and `callsign` are optional because the roster carries them
 * unevenly — a member with no milpac has neither, and only some elements
 * work under a callsign at all.
 */
export interface Casualty {
    name: string
    rank?: string
    callsign?: string
    /** The element they belong to — "1-1-1 ALPHA". */
    unit: string
    /** Their billet — "MACHINEGUNNER". */
    role: string
    /** Discord avatar, drawn into the head on the body diagram. */
    avatar?: string
}

/** The stand-in when the ORBAT has nobody to offer — an empty roster, mostly. */
export const FALLBACK_CASUALTY: Casualty = {
    name: 'Noah Williams', rank: 'PTE', callsign: 'VULTURE', unit: '2-1 BRAVO', role: 'RIFLEMAN',
}

export type Difficulty = 'easy' | 'moderate' | 'hard' | 'extreme'

export const DIFFICULTIES: { id: Difficulty, label: string }[] = [
    { id: 'easy',     label: 'Easy' },
    { id: 'moderate', label: 'Moderate' },
    { id: 'hard',     label: 'Hard' },
    { id: 'extreme',  label: 'Extreme' },
]

/**
 * What each difficulty puts in front of you.
 *
 * The knobs that matter are `parts` and `kinds` rather than the raw wound
 * count: one high-velocity wound bleeds faster than four abrasions, and a
 * casualty bleeding from four limbs is a different problem from one bleeding
 * hard from a single limb — it is the number of things you must get to before
 * they run out of blood that makes it hard, not the tally.
 */
const PROFILES: Record<Difficulty, {
    parts: [number, number]
    woundsPerPart: [number, number]
    kinds: WoundKind[]
    fractures: [number, number]
    blood: [number, number]
    pain: [number, number]
    /** Chance a given wound arrives already dressed by whoever got there first. */
    preDressed: number
    /** Chance the casualty is already in arrest when you open the menu. */
    arrest: number
}> = {
    easy: {
        parts: [1, 2], woundsPerPart: [1, 1], kinds: ['scrape', 'cut'],
        fractures: [0, 0], blood: [88, 96], pain: [15, 35], preDressed: 0.35, arrest: 0,
    },
    moderate: {
        parts: [2, 3], woundsPerPart: [1, 2], kinds: ['cut', 'avulsion', 'mvw'],
        fractures: [0, 1], blood: [72, 86], pain: [40, 65], preDressed: 0.2, arrest: 0,
    },
    hard: {
        parts: [3, 4], woundsPerPart: [1, 3], kinds: ['avulsion', 'mvw', 'crush', 'hvw'],
        fractures: [1, 2], blood: [52, 70], pain: [60, 85], preDressed: 0.1, arrest: 0.05,
    },
    extreme: {
        parts: [4, 6], woundsPerPart: [2, 3], kinds: ['mvw', 'hvw', 'frag', 'crush'],
        fractures: [1, 3], blood: [30, 48], pain: [80, 100], preDressed: 0, arrest: 0.25,
    },
}

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]

/** Limbs take tourniquets; the head and torso are the ones you cannot clamp. */
const LIMBS: PartId[] = ['armL', 'armR', 'legL', 'legR']

export function newPatient(who: Casualty = FALLBACK_CASUALTY, difficulty: Difficulty = 'moderate'): Patient {
    const cfg = PROFILES[difficulty]

    const p: Patient = {
        name: who.name,
        rank: who.rank ?? '',
        callsign: who.callsign ?? '',
        // The billet only reads as one when there is an element in front of it.
        unit: [who.unit, who.role].filter(Boolean).join(' · '),
        avatar: who.avatar ?? '',
        bloodType: pick(['O POS', 'O NEG', 'A POS', 'A NEG', 'B POS', 'AB POS']),
        bloodTypeKnown: false,
        parts: Object.fromEntries(PARTS.map(x => [x.id, mkPart(x.id)])) as Record<PartId, BodyPart>,
        blood: randInt(...cfg.blood),
        pain: randInt(...cfg.pain),
        hr: 80, sysBp: 118, diaBp: 74, spo2: 98, rr: 16, etco2: 36,
        temp: Math.round((36.8 - Math.random() * 1.4) * 10) / 10,
        conscious: true, cardiacArrest: false, airway: 'clear',
        meds: [], tqCount: 0,
        triage: 'none', triageEntries: [],
        cprActive: false,
    }

    // Wounds, spread over a random subset of the body.
    const pool = [...PARTS.map(x => x.id)]
    const hit: PartId[] = []
    for (let i = 0, n = randInt(...cfg.parts); i < n && pool.length; i++) {
        hit.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    for (const id of hit) {
        const wounds = randInt(...cfg.woundsPerPart)
        for (let i = 0; i < wounds; i++) {
            p.parts[id].wounds.push({
                t: pick(cfg.kinds),
                n: randInt(1, 2),
                bandaged: Math.random() < cfg.preDressed,
            })
        }
    }

    // Fractures land on limbs the casualty already has trouble with where
    // possible, so a splint is something you find rather than stumble over.
    const breakable = (hit.filter(id => LIMBS.includes(id)).length ? hit.filter(id => LIMBS.includes(id)) : LIMBS).slice()
    for (let i = 0, n = randInt(...cfg.fractures); i < n && breakable.length; i++) {
        p.parts[breakable.splice(Math.floor(Math.random() * breakable.length), 1)[0]].fractured = true
    }

    // Vitals follow from the volume lost rather than being rolled separately —
    // a casualty reading 96/58 at full blood would be a contradiction.
    const lost = 100 - p.blood
    p.hr = clamp(Math.round(72 + lost * 1.05 + randInt(-5, 5)), 50, 180)
    p.sysBp = clamp(Math.round(122 - lost * 0.85 + randInt(-4, 4)), 45, 140)
    p.diaBp = clamp(Math.round(p.sysBp * 0.62 + randInt(-3, 3)), 25, 95)
    p.spo2 = clamp(Math.round(99 - lost * 0.22 + randInt(-1, 1)), 60, 100)
    p.rr = clamp(Math.round(15 + lost * 0.16 + randInt(-2, 2)), 8, 40)

    if (Math.random() < cfg.arrest) {
        p.cardiacArrest = true
        p.conscious = false
    }

    return p
}

/**
 * The handover you are read when the casualty arrives.
 *
 * Generated from the injuries rather than written down, because the injuries
 * are now different every time — a fixed script would have been telling you
 * about a leg that is fine.
 */
export function handover(p: Patient): { text: string, kind: 'bad' | 'warn' | '' }[] {
    const lines: { text: string, kind: 'bad' | 'warn' | '' }[] = []

    for (const { id, name } of PARTS) {
        const pt = p.parts[id]
        const open = pt.wounds.filter(w => !w.bandaged)
        const bits: string[] = []
        if (pt.fractured) bits.push('fractured')
        for (const w of open) bits.push(`${w.n}× ${WOUND_TYPES[w.t].name.toLowerCase()}`)
        if (bits.length) lines.push({ text: `${name} — ${bits.join(', ')}`, kind: 'bad' })
    }

    if (p.cardiacArrest) lines.push({ text: 'CASUALTY IS IN CARDIAC ARREST', kind: 'bad' })
    else if (totalBleed(p) > 0) lines.push({ text: 'Casualty is bleeding', kind: 'bad' })
    else if (!lines.length) lines.push({ text: 'No obvious injuries — survey the casualty', kind: '' })

    lines.push({ text: `Casualty on the table — ${p.name.toUpperCase()}`, kind: '' })
    return lines
}

/* ---------- helpers ------------------------------------------------------- */

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Simulated instrument noise. Vitals are never read twice the same. */
export const jitter = (v: number, d: number) => Math.round(v + (Math.random() * 2 - 1) * d)

export const pName = (id: PartId) => PARTS.find(p => p.id === id)?.name ?? id

/**
 * -1 controlled · 0 clean · 1–3 how badly it is bleeding.
 *
 * Bleeding only. A fracture no longer tints the limb: it is drawn as a bone
 * inside it instead, so the two problems a limb can have stop competing for
 * one colour. A yellow leg means blood is coming out of it, every time.
 */
export function partSeverity(pt: BodyPart): -1 | 0 | 1 | 2 | 3 {
    if (!pt.wounds.length) return 0
    // A tourniquet has stopped the bleed even though the wound is still open,
    // which is exactly the state "controlled" is for.
    if (pt.tourniquet) return -1
    const open = pt.wounds.filter(w => !w.bandaged)
    if (!open.length) return -1
    return Math.max(...open.map(w => WOUND_TYPES[w.t].sev)) as 1 | 2 | 3
}

/** A tourniquet stops the limb bleeding outright — that is the whole point. */
export function partBleeding(pt: BodyPart): number {
    if (pt.tourniquet) return 0
    return pt.wounds.reduce((a, w) => a + (w.bandaged ? 0 : WOUND_TYPES[w.t].bleed * w.n), 0)
}

export const totalBleed = (p: Patient) =>
    Object.values(p.parts).reduce((a, pt) => a + partBleeding(pt), 0)

export function bloodWord(v: number): [string, string] {
    if (v >= 90) return ['', '']
    if (v >= 75) return ['Lost some blood', 'yel']
    if (v >= 55) return ['Lost a lot of blood', 'yel']
    return ['Lost a dangerous amount of blood', 'red']
}

export function painWord(v: number): string {
    if (v < 10) return ''
    if (v < 40) return 'In minor pain'
    if (v < 70) return 'In pain'
    return 'In severe pain'
}

/** hh:mm:ss since the mission clock's epoch. */
export function stampFrom(t0: number, now = Date.now()): string {
    const ms = now - t0
    return [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
        .map(n => String(n).padStart(2, '0')).join(':')
}
