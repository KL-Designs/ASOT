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
    callsign: string
    unit: string
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

/** Name, element and billet for the casualty on the table. */
export interface Casualty { name: string, unit: string, role: string }

/** The stand-in when the ORBAT has nobody to offer — an empty roster, mostly. */
export const FALLBACK_CASUALTY: Casualty = { name: 'Noah Williams', unit: '2-1 BRAVO', role: 'RIFLEMAN' }

export function newPatient(who: Casualty = FALLBACK_CASUALTY): Patient {
    const p: Patient = {
        name: who.name, callsign: '"VULTURE"', unit: `${who.unit} · ${who.role}`,
        bloodType: 'O POS', bloodTypeKnown: false,
        parts: Object.fromEntries(PARTS.map(x => [x.id, mkPart(x.id)])) as Record<PartId, BodyPart>,
        blood: 82,
        pain: 62,
        hr: 118, sysBp: 96, diaBp: 58, spo2: 93, rr: 22, etco2: 36, temp: 36.4,
        conscious: true, cardiacArrest: false, airway: 'clear',
        meds: [], tqCount: 0,
        triage: 'none', triageEntries: [],
        cprActive: false,
    }
    // Starting injuries — the casualty you are handed.
    p.parts.legR.wounds.push({ t: 'mvw', n: 2, bandaged: false })
    p.parts.legR.wounds.push({ t: 'avulsion', n: 1, bandaged: true })
    p.parts.legR.fractured = true
    p.parts.torso.wounds.push({ t: 'scrape', n: 1, bandaged: false })
    return p
}

/* ---------- helpers ------------------------------------------------------- */

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Simulated instrument noise. Vitals are never read twice the same. */
export const jitter = (v: number, d: number) => Math.round(v + (Math.random() * 2 - 1) * d)

export const pName = (id: PartId) => PARTS.find(p => p.id === id)?.name ?? id

/** -1 treated · 0 healthy · 1–3 severity. Drives the body diagram's fill. */
export function partSeverity(pt: BodyPart): -1 | 0 | 1 | 2 | 3 {
    if (!pt.wounds.length && !pt.fractured) return 0
    let s = pt.fractured ? 2 : 0
    pt.wounds.forEach(w => { s = Math.max(s, WOUND_TYPES[w.t].sev) })
    const allTreated = pt.wounds.every(w => w.bandaged) && (!pt.fractured || pt.splinted)
    return (allTreated ? -1 : s) as -1 | 0 | 1 | 2 | 3
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
