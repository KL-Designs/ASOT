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

/* ---------- fluids --------------------------------------------------------- */

export type FluidId = 'blood' | 'plasma' | 'saline'

/**
 * What is on the shelf.
 *
 * `potency` is volume percentage points per ml, and it is what separates the
 * three: a unit of blood is worth four and a half bags of saline, which is the
 * whole argument for carrying it. `rate` is how fast the bag runs through once
 * it is hung, in ml per second of casualty time.
 */
export const FLUIDS: Record<FluidId, {
    label: string
    potency: number
    rate: number
    dot: 'r' | 'y' | 'b'
    colour: string
}> = {
    blood:  { label: 'Whole Blood', potency: 0.018, rate: 20, dot: 'r', colour: '#d2352c' },
    plasma: { label: 'Plasma',      potency: 0.012, rate: 25, dot: 'y', colour: '#e8c343' },
    saline: { label: 'Saline 0.9%', potency: 0.004, rate: 35, dot: 'b', colour: '#56a8e0' },
}

/** Bag sizes, in ml. */
export const BAG_SIZES = [250, 500, 1000, 2000] as const

/**
 * A bag that is up and running.
 *
 * Hanging one is the treatment; what it gives back arrives over the next half
 * minute or so, which is the point — you hook it up and go and do something
 * about the reason they needed it.
 */
export interface Infusion {
    id: number
    fluid: FluidId
    /** The limb it is running into. A tourniquet on it stops the line dead. */
    part: PartId
    /** ml the bag held when it went up. */
    volume: number
    /** ml still to run. */
    left: number
}

/** Everything still in a bag, across every line. */
export function mlRunning(p: Patient): number {
    return p.infusions.reduce((n, i) => n + i.left, 0)
}

/**
 * What the monitor is showing.
 *
 * `pea` is the one worth knowing about: organised complexes marching across the
 * screen with no pulse behind them. It looks survivable and is not shockable,
 * which is exactly why analysing before shocking is a step rather than a
 * formality.
 */
export type Rhythm = 'sinus' | 'stemi' | 'vt' | 'vf' | 'pea' | 'asystole'

export const RHYTHM_LABEL: Record<Rhythm, string> = {
    sinus:    'Sinus rhythm',
    stemi:    'ST elevation — tombstones',
    vt:       'Ventricular tachycardia',
    vf:       'Ventricular fibrillation',
    pea:      'Pulseless electrical activity',
    asystole: 'Asystole',
}

/** The two a defibrillator can do anything about. */
export const SHOCKABLE: ReadonlySet<Rhythm> = new Set<Rhythm>(['vt', 'vf'])

/** Rhythms with no cardiac output — the casualty is in arrest. */
export const ARRESTED: ReadonlySet<Rhythm> = new Set<Rhythm>(['vt', 'vf', 'pea', 'asystole'])

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
    rhythm: Rhythm
    /**
     * What the last analysis found, and whether it advised a shock.
     *
     * Kept against the rhythm it was taken from: the moment the rhythm moves,
     * the reading is stale and the defibrillator asks for a fresh one. That is
     * the behaviour the real device has and the reason you cannot simply hold
     * the button down.
     */
    analysed: { rhythm: Rhythm, advised: boolean } | null
    cardiacArrest: boolean
    airway: string
    meds: string[]
    tqCount: number
    /**
     * Doses of phenylephrine on board, decaying.
     *
     * The one drug in the drawer that stacks: each dose tightens the vessels
     * further and the bleeding slows with them. A fraction rather than a count
     * because it wears off continuously.
     */
    pressor: number
    /** Seconds of epinephrine left in the casualty. Compressions work on it. */
    epi: number
    /**
     * Where the heart rate is climbing to, or null if it is not climbing.
     *
     * A heart that has just restarted does not restart at seventy. It comes
     * back slow and works its way up, and watching it do that is most of how
     * you know the return was real.
     */
    hrTarget: number | null
    /** Seconds until they could come round. Set by a return of circulation. */
    wake: number
    /**
     * The arm the vitals monitor is strapped to, or null for no monitor.
     *
     * Nothing on the screen is free. A trace, a heart rate and a saturation
     * are things a machine is telling you, and the machine has to be on the
     * casualty first — which makes putting it there the first thing you do
     * rather than something the menu did for you before you arrived.
     */
    monitorOn: PartId | null
    /** Defibrillator pads sited on the chest. The AED does nothing without them. */
    padsOn: boolean
    /** Lines up and running. Drained by the sim, not by the treatment. */
    infusions: Infusion[]
    /** Ids for the bags, so React can key them and the log can name them. */
    infusionSeq: number
    /**
     * Seconds this casualty has spent without an output.
     *
     * Accumulated, never reset by treatment: compressions buy time, they do not
     * give it back. Five minutes of it and the brain has gone whatever the
     * monitor says afterwards.
     */
    downtime: number
    /** Decided once. `active` is the only state the sim keeps running in. */
    outcome: 'active' | 'stable' | 'dead'
    /** Why they died, for the board. Empty unless `outcome` is 'dead'. */
    cause: string
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
        conscious: true, rhythm: 'sinus', analysed: null, cardiacArrest: false, airway: 'clear',
        meds: [], tqCount: 0,
        pressor: 0, epi: 0, hrTarget: null, wake: 0,
        monitorOn: null, padsOn: false,
        infusions: [], infusionSeq: 0,
        downtime: 0, outcome: 'active', cause: '',
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

    /*
       At least one wound has to be open.

       On easy every wound can roll pre-dressed, and a casualty who arrives with
       nothing outstanding is declared stable before you have touched them — a
       win screen for opening the menu.
    */
    const all = Object.values(p.parts).flatMap(pt => pt.wounds)
    if (all.length && all.every(w => w.bandaged)) all[randInt(0, all.length - 1)].bandaged = false

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
        // Weighted the way an arrest actually presents: VF is the common one
        // you can do something about, asystole the one you mostly cannot.
        setRhythm(p, pick(['vf', 'vf', 'vt', 'pea', 'asystole'] as const))
    } else if (difficulty !== 'easy' && Math.random() < 0.12) {
        // A casualty with a pulse and a very bad ECG. Analysing finds it;
        // shocking does nothing for it.
        setRhythm(p, 'stemi')
    }

    return p
}

/**
 * Move the casualty to a rhythm, and settle everything that follows from it.
 *
 * The arrest flag, the pulse and any standing analysis are all consequences of
 * the rhythm rather than separate facts, and every one of them was a chance for
 * the monitor to disagree with itself when they were set by hand.
 */
export function setRhythm(p: Patient, r: Rhythm) {
    const wasArrested = p.cardiacArrest
    p.rhythm = r
    p.analysed = null
    p.cardiacArrest = ARRESTED.has(r)
    p.cprActive = false

    if (p.cardiacArrest) {
        p.conscious = false
        p.hr = arrestHr(r)
        return
    }

    // An output is an output: the clock only runs while there is none, so
    // getting one back stops it and clears what it had counted.
    p.downtime = 0
    p.hrTarget = null

    if (!wasArrested) { p.conscious = true; return }

    /*
       A return of circulation, which is not the same thing as a casualty.

       They stay under, and the rate comes back at forty and climbs from
       there. Both of those are the honest version and both are the version
       worth showing: a heart that restarts at seventy with the patient
       talking would teach you that the hard part was over.
    */
    p.conscious = false
    p.wake = WAKE_DELAY
    p.hr = 40
    p.hrTarget = 68 + Math.round(Math.random() * 14)
}

/** What the monitor reads for an arrested rhythm with nobody compressing. */
export function arrestHr(r: Rhythm): number {
    if (r === 'vt') return 190
    if (r === 'pea') return 40      // complexes, no output
    return 0                        // asystole, VF
}

/* ---------- winning and losing -------------------------------------------- */

/** Five minutes without an output. */
export const DEATH_DOWNTIME = 300

/**
 * Compressions do not stop the clock, they slow it.
 *
 * That is the honest version and the one worth teaching: CPR perfuses well
 * enough to stretch the window and nowhere near well enough to reset it, so it
 * buys you time to fix the actual problem rather than being the fix.
 */
export const CPR_DOWNTIME_RATE = 0.28

/** Compressions, in beats per minute. What the monitor reads while you work. */
export const CPR_RATE = 118

/** How long a casualty stays under after their heart restarts. */
export const WAKE_DELAY = 22

/** How long 1 mg of epinephrine keeps working, in seconds. */
export const EPI_WINDOW = 120

/* ---------- vasoconstriction ---------------------------------------------- */

/** Seconds one dose of phenylephrine holds for. */
export const PRESSOR_LIFE = 50

/** Doses worth giving. Past this the vessels are as tight as they will go. */
export const PRESSOR_MAX = 4

/**
 * What the bleeding is multiplied by, for the phenylephrine on board.
 *
 * Deliberately floored well above zero. Squeezing the vessels shut buys time
 * and buys it at a price the casualty pays later — it is not a dressing, and a
 * drug that could stop a haemorrhage outright would teach the wrong thing.
 * `totalBleed` is left alone for the same reason a tourniqueted limb keeps its
 * colour: the wound is exactly as open as it was.
 */
export function bleedFactor(p: Patient): number {
    return Math.max(0.3, 1 - 0.2 * Math.min(p.pressor, PRESSOR_MAX))
}

/* ---------- consciousness -------------------------------------------------- */

/**
 * Whether the casualty is with you, given everything else about them.
 *
 * Two sets of thresholds rather than one, because a single line would have
 * them flickering four times a second the moment they sat on it. Losing
 * consciousness is easier than getting it back, which is both how it works and
 * what makes going under feel like something that happened to them.
 */
export function isConscious(p: Patient): boolean {
    if (p.cardiacArrest || p.wake > 0) return false
    return p.conscious
        ? !(p.blood < 42 || p.pain > 84 || p.spo2 < 78)
        : (p.blood > 50 && p.pain < 72 && p.spo2 > 85)
}

/**
 * What they say, given how they are.
 *
 * Drawn from their state rather than a script, so the casualty telling you
 * they are cold is a casualty who has actually lost the volume for it. They go
 * quiet when they go under, which is its own indicator.
 */
export function chatter(p: Patient): string[] {
    const out: string[] = []
    if (p.pain > 72)      out.push('Aaah — that really hurts', 'Please, something for the pain', "I can't take much more of this")
    else if (p.pain > 38) out.push('That stings like hell', 'Careful — careful', 'It hurts when you touch it')
    if (p.blood < 58)     out.push("I'm freezing", "I'm so thirsty", 'Everything has gone grey')
    if (p.blood < 44)     out.push("I don't feel right", 'Am I going to be alright?', "I can't feel my hands")
    if (p.spo2 < 92)      out.push("I can't get a breath", 'My chest is tight')
    if (totalBleed(p) > 0) out.push("I'm still bleeding, aren't I", "Don't let go of it")
    if (p.tqCount > 0)    out.push("That strap is agony", 'Am I keeping the leg?')
    if (!out.length)      out.push("How's it looking?", 'I can walk it off', 'Just get me out of here', "Cheers — I owe you one", "Tell them I'm alright")
    return out
}

/**
 * What is still wrong, in the order you would fix it.
 *
 * Empty means stable — the casualty can be handed over. Returned as a list
 * rather than a boolean so the menu can show you what is left instead of
 * leaving you to guess which box is unticked.
 */
export function stabilityIssues(p: Patient): string[] {
    const out: string[] = []
    if (p.cardiacArrest) out.push('No cardiac output')
    if (totalBleed(p) > 0) out.push('Still bleeding')

    const undressed = Object.values(p.parts).reduce((n, pt) => n + pt.wounds.filter(w => !w.bandaged).length, 0)
    if (undressed > 0) out.push(`${undressed} wound${undressed === 1 ? '' : 's'} undressed`)

    const unsplinted = Object.values(p.parts).filter(pt => pt.fractured && !pt.splinted).length
    if (unsplinted > 0) out.push(`${unsplinted} fracture${unsplinted === 1 ? '' : 's'} unsplinted`)

    if (p.blood < 70) {
        // A bag already running is not an outstanding job, so say so rather
        // than telling you to go and hang the one you just hung.
        const running = mlRunning(p)
        out.push(running > 0
            ? `Volume ${Math.round(p.blood)}% — ${Math.ceil(running)} ml still running`
            : `Volume ${Math.round(p.blood)}% — needs fluids`)
    }
    if (p.spo2 < 92) out.push(`SpO₂ ${Math.round(p.spo2)}% — needs oxygen`)
    if (p.pain > 30) out.push('In pain — needs analgesia')
    return out
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
 * -1 dressed · 0 clean · 1–3 how badly the open wounds bleed.
 *
 * Bleeding only. A fracture no longer tints the limb: it is drawn as a bone
 * inside it instead, so the two problems a limb can have stop competing for
 * one colour.
 *
 * A tourniquet is deliberately *not* counted here. It stops the blood leaving —
 * `partBleeding` returns zero and the pulsing marker goes out — but the wound
 * underneath is exactly as open as it was, and a limb that goes white the
 * moment you clamp it would be telling you it is fixed. It keeps its colour,
 * and the TQ band on the diagram says why nothing is coming out. Blue is for a
 * wound that has actually been dressed.
 */
export function partSeverity(pt: BodyPart): -1 | 0 | 1 | 2 | 3 {
    if (!pt.wounds.length) return 0
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
