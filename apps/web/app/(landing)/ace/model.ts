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

export type WoundKind =
    | 'abrasion' | 'contusion' | 'cut' | 'laceration'
    | 'avulsion' | 'puncture' | 'crush' | 'velocity'

/** name, severity 1–3, bleed rate. */
export const WOUND_TYPES: Record<WoundKind, { name: string, sev: 1 | 2 | 3, bleed: number }> = {
    abrasion:   { name: 'Abrasion',       sev: 1, bleed: 0.4 },
    contusion:  { name: 'Contusion',      sev: 1, bleed: 0.2 },
    cut:        { name: 'Cut',            sev: 1, bleed: 0.9 },
    laceration: { name: 'Laceration',     sev: 2, bleed: 1.7 },
    avulsion:   { name: 'Avulsion',       sev: 2, bleed: 1.5 },
    puncture:   { name: 'Puncture',       sev: 2, bleed: 1.2 },
    crush:      { name: 'Crush Wound',    sev: 3, bleed: 1.8 },
    velocity:   { name: 'Velocity Wound', sev: 3, bleed: 3.2 },
}

/* ---------- dressings ------------------------------------------------------ */

export type BandageId = 'field' | 'packing' | 'elastic' | 'quik'

/** `life` is how long it holds before it gives out, in seconds, at full efficiency. */
export const BANDAGES: Record<BandageId, { label: string, short: string, life: number }> = {
    field:   { label: 'Field Dressing',  short: 'Field',    life: 75 },
    packing: { label: 'Packing Bandage', short: 'Packing',  life: 95 },
    elastic: { label: 'Elastic Bandage', short: 'Elastic',  life: 120 },
    quik:    { label: 'QuikClot',        short: 'QuikClot', life: 150 },
}

/**
 * How well a dressing holds a wound, and how likely it is to give way.
 *
 * Written in the chart's own three colours rather than numbers so a cell can
 * be corrected by reading one word off the chart and changing it here. Nothing
 * else in the file knows what `some` is worth.
 */
export type Eff = 'ok' | 'poor'
export type Reopen = 'none' | 'some' | 'high'

export const BANDAGE_CHART: Record<WoundKind, Record<BandageId, readonly [Eff, Reopen]>> = {
    abrasion:   { field: ['ok', 'high'],   packing: ['ok', 'high'], elastic: ['ok', 'some'], quik: ['ok', 'none'] },
    contusion:  { field: ['ok', 'none'],   packing: ['ok', 'none'], elastic: ['ok', 'none'], quik: ['ok', 'none'] },
    cut:        { field: ['ok', 'some'],   packing: ['ok', 'high'], elastic: ['ok', 'high'], quik: ['ok', 'high'] },
    laceration: { field: ['ok', 'some'],   packing: ['ok', 'high'], elastic: ['ok', 'high'], quik: ['ok', 'none'] },
    avulsion:   { field: ['ok', 'high'],   packing: ['ok', 'high'], elastic: ['ok', 'high'], quik: ['ok', 'none'] },
    puncture:   { field: ['ok', 'none'],   packing: ['ok', 'none'], elastic: ['ok', 'none'], quik: ['ok', 'none'] },
    crush:      { field: ['poor', 'some'], packing: ['poor', 'high'], elastic: ['ok', 'high'], quik: ['ok', 'high'] },
    velocity:   { field: ['ok', 'high'],   packing: ['ok', 'high'], elastic: ['ok', 'high'], quik: ['ok', 'none'] },
}

const REOPEN_CHANCE: Record<Reopen, number> = { none: 0, some: 0.4, high: 0.8 }
const EFF_HOLD: Record<Eff, number> = { ok: 1, poor: 0.55 }

/** How likely this dressing is to give way on this wound, eventually. */
export const reopenChance = (t: WoundKind, b: BandageId) => REOPEN_CHANCE[BANDAGE_CHART[t][b][1]]

/** How long it holds first, if it is going to give way at all. */
export const dressingLife = (t: WoundKind, b: BandageId) =>
    BANDAGES[b].life * EFF_HOLD[BANDAGE_CHART[t][b][0]]

/**
 * What to reach for.
 *
 * Least likely to give way wins, because everything here is temporary until it
 * is sutured and a dressing that pops is a wound you have to find again.
 * Efficiency only breaks a tie — which is why the answer for a contusion, where
 * nothing reopens, is simply the one that holds longest.
 */
export function bestBandage(t: WoundKind): BandageId {
    const ids = Object.keys(BANDAGES) as BandageId[]
    return ids.reduce((best, b) => {
        const d = reopenChance(t, b) - reopenChance(t, best)
        if (d < 0) return b
        if (d > 0) return best
        return dressingLife(t, b) > dressingLife(t, best) ? b : best
    })
}

/**
 * One wound. Not a count of them — a dressing goes on exactly one, and each
 * one has to remember what is on it and how long that has left.
 */
export interface Wound {
    id: number
    t: WoundKind
    bandaged: boolean
    /** What is on it, once something is. */
    dressing: BandageId | null
    /** Seconds until that dressing gives way, or null if it is going to hold. */
    failIn: number | null
}

/**
 * The open wound a dressing would go on: the worst one there.
 *
 * Deterministic on purpose. The menu recommends a bandage for this wound, so
 * the wound the recommendation is about has to be the wound that gets dressed.
 */
export function nextWound(pt: BodyPart): Wound | null {
    let worst: Wound | null = null
    for (const w of pt.wounds) {
        if (w.bandaged) continue
        if (!worst || WOUND_TYPES[w.t].sev > WOUND_TYPES[worst.t].sev) worst = w
    }
    return worst
}

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
    /** Fraction of what you hang that stays in the vasculature. */
    retention: number
    /**
     * Points of saturation lost per whole-volume replacement.
     *
     * Dilution. Volume is not the same thing as blood: crystalloid fills the
     * pipes and carries nothing, so a casualty full of saline has a pressure
     * you are pleased with and no oxygen going anywhere. Two and a half litres
     * into a five-litre man is half his haemoglobin — and this is the number
     * that makes that arithmetic land on the monitor.
     */
    dilute: number
    rate: number
    dot: 'r' | 'y' | 'b'
    colour: string
}> = {
    blood:  { label: 'Blood',       retention: 1,    dilute: 0,  rate: 20, dot: 'r', colour: '#d2352c' },
    plasma: { label: 'Plasma',      retention: 0.9,  dilute: 45, rate: 25, dot: 'y', colour: '#e8c343' },
    saline: { label: 'Saline 0.9%', retention: 0.42, dilute: 94, rate: 35, dot: 'b', colour: '#56a8e0' },
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
    /** Volume, as a percentage of `volume`. */
    blood: number
    /** What a full tank is, in ml. Everybody is a slightly different size. */
    volume: number
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
    /** What is in the airway, whether or not anybody has looked. */
    airway: Obstruction
    /** The adjunct sited, if any. */
    adjunct: Adjunct
    /** Rolled onto their side. Gravity holds the airway open for you. */
    recovery: boolean
    /**
     * Whether you have actually looked.
     *
     * The casualty's airway is not a readout, it is something you find out by
     * putting your face next to theirs — so it reads unknown until you do, and
     * goes back to unknown the moment it changes behind your back.
     */
    airwayChecked: boolean
    /** Suction pump charges left. One, and it always works. */
    suction: number
    /** Making respiratory effort of their own. Not the same as an open airway. */
    spontaneous: boolean
    /** Somebody has hands on a bag-valve mask. */
    bagging: boolean
    /** A non-rebreather is on with the tank running. */
    oxygen: boolean
    /**
     * The aortic balloon, if one is up.
     *
     * `site` is the groin it went in through and `up` is how long it has been
     * inflated — which is the only number that matters about it.
     */
    reboa: { site: PartId, up: number } | null
    /** A hole in the chest. Where a pneumothorax comes from. */
    chestWound: boolean
    /** Occlusive dressing over it. Stops it tensioning again. */
    sealed: boolean
    /** Seconds until an unsealed chest tensions, or null if it is not going to. */
    pneumoIn: number | null
    /** Air in the pleural space with nowhere to go. Needs a needle. */
    pneumo: boolean
    meds: string[]
    tqCount: number
    /** Everything still working, with how far along it is. */
    doses: Dose[]
    /** Ids for the doses, so React has something stable to key on. */
    doseSeq: number
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
    /** Ids for the wounds, so a dressing has something stable to sit on. */
    woundSeq: number
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
    /**
     * Seconds of aspirin and GTN together, against `STEMI_CLEARS`.
     *
     * Held on the casualty rather than worked out from the doses because it
     * has to be able to go backwards: stop halfway and the segments creep back
     * up, so one spray and a walk away gets you nowhere.
     */
    stemiFixing: number
    /**
     * Whether the stable board has already been shown for this state.
     *
     * Cleared the moment anything is wrong with them again, so a casualty who
     * comes apart and is put back together is declared twice. Without it,
     * choosing to carry on working a casualty you have already saved gets you
     * the same board again on the very next tick.
     */
    declared: boolean
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
    /** Chance one of the wounds is a hole in the chest. */
    chest: number
}> = {
    // `woundsPerPart` counts actual wounds now rather than entries that each
    // stood for one or two, so the ranges are up to keep the casualties the
    // same weight as before.
    easy: {
        parts: [1, 2], woundsPerPart: [1, 2], kinds: ['abrasion', 'contusion', 'cut'],
        fractures: [0, 0], blood: [88, 96], pain: [15, 35], preDressed: 0.35, arrest: 0, chest: 0,
    },
    moderate: {
        parts: [2, 3], woundsPerPart: [1, 3], kinds: ['cut', 'laceration', 'avulsion'],
        fractures: [0, 1], blood: [72, 86], pain: [40, 65], preDressed: 0.2, arrest: 0, chest: 0.18,
    },
    hard: {
        parts: [3, 4], woundsPerPart: [2, 4], kinds: ['laceration', 'avulsion', 'puncture', 'velocity'],
        fractures: [1, 2], blood: [52, 70], pain: [60, 85], preDressed: 0.1, arrest: 0.05, chest: 0.35,
    },
    extreme: {
        parts: [4, 6], woundsPerPart: [3, 5], kinds: ['velocity', 'crush', 'puncture', 'avulsion'],
        fractures: [1, 3], blood: [30, 48], pain: [80, 100], preDressed: 0, arrest: 0.25, chest: 0.55,
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
        volume: randInt(4500, 5500),
        pain: randInt(...cfg.pain),
        hr: 80, sysBp: 118, diaBp: 74, spo2: 98, rr: 16, etco2: 36,
        temp: Math.round((36.8 - Math.random() * 1.4) * 10) / 10,
        conscious: true, rhythm: 'sinus', analysed: null, cardiacArrest: false,
        airway: 'none', adjunct: 'none', recovery: false, airwayChecked: false, suction: 1,
        spontaneous: true, bagging: false, oxygen: false,
        reboa: null, chestWound: false, sealed: false, pneumoIn: null, pneumo: false,
        meds: [], tqCount: 0,
        doses: [], doseSeq: 0, hrTarget: null, wake: 0,
        monitorOn: null, padsOn: false, woundSeq: 0,
        infusions: [], infusionSeq: 0,
        downtime: 0, stemiFixing: 0, declared: false, outcome: 'active', cause: '',
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
            const t = pick(cfg.kinds)
            const pre = Math.random() < cfg.preDressed
            // Whoever got there first used what they had, and it is as likely
            // to give way as anything else you put on.
            const b: BandageId = pre ? pick(['field', 'packing'] as const) : 'field'
            p.parts[id].wounds.push({
                id: p.woundSeq++,
                t,
                bandaged: pre,
                dressing: pre ? b : null,
                failIn: pre && Math.random() < reopenChance(t, b) ? dressingLife(t, b) : null,
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
    if (all.length && all.every(w => w.bandaged)) {
        const w = all[randInt(0, all.length - 1)]
        w.bandaged = false; w.dressing = null; w.failIn = null
    }

    /*
       A hole in the chest, which is a different problem from a hole anywhere
       else: it is the wound that kills you by filling the chest rather than
       emptying it. Sometimes it has already tensioned by the time you get
       there, which is the version you have to recognise rather than prevent.
    */
    if (Math.random() < cfg.chest) {
        p.chestWound = true
        p.parts.torso.wounds.push({
            id: p.woundSeq++,
            t: Math.random() < 0.5 ? 'puncture' : 'velocity',
            bandaged: false, dressing: null, failIn: null,
        })
        p.pneumoIn = Math.random() < 0.22 ? 0 : randInt(25, 110)
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
        resetRateLedger(p)
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
    resetRateLedger(p)
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

/** Seconds of suturing per hole. A limb is however many of these it has. */
export const SUTURE_PER_WOUND = 4

/** The rate a casualty is allowed to leave on, either side. */
export const HR_OK: readonly [number, number] = [50, 110]

/** Seconds of aspirin and GTN together before the ST segments settle. */
export const STEMI_CLEARS = 100

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

/* ---------- the aortic balloon --------------------------------------------- */

/**
 * REBOA — a balloon up the femoral artery, inflated in the aorta.
 *
 * The answer to the bleeding you cannot put a tourniquet on: a pelvis, an
 * abdomen, a torso. It shuts the aorta off and everything below the balloon
 * stops bleeding because everything below the balloon stops being perfused,
 * which is the whole trade and the reason it has a clock on it. It is not a
 * treatment for a haemorrhage. It is a loan against one, and the interest is
 * two legs.
 */

/** How much of the bleeding below the balloon it actually stops. */
export const REBOA_OCCLUSION = 0.88

/** Seconds before the legs start paying for it. */
export const REBOA_WARN = 90

/** Seconds before the casualty does. */
export const REBOA_FATAL = 240

/** Everything the balloon is upstream of. */
export const bleedBelowBalloon = (p: Patient) =>
    partBleeding(p.parts.torso) + partBleeding(p.parts.legL) + partBleeding(p.parts.legR)

/* ---------- pharmacology --------------------------------------------------- */

export type DrugId =
    | 'morphine' | 'nalbuphine' | 'fentanyl'
    | 'epi' | 'atropine' | 'amiodarone' | 'phenylephrine'
    | 'aspirin' | 'gtn'
    | 'txa' | 'naloxone' | 'caffeine'

export type VitalKey = 'pain' | 'hr' | 'sysBp' | 'diaBp' | 'rr' | 'spo2'

export interface Drug {
    label: string
    /** The dose on the label, for the button. */
    dose: string
    /** Seconds to reach full effect. Nothing in the bag works the moment it goes in. */
    onset: number
    /** Seconds it works for in total, onset included. */
    duration: number
    /** How much of that is spent wearing off. */
    fade: number
    /** What it does at full effect, as offsets from wherever the casualty was. */
    effect: Partial<Record<VitalKey, number>>
    /** What it multiplies the bleeding by, if it does anything to bleeding. */
    bleedMul?: number
    /** Doses that do what it says on the label. Past this you are dosing, not treating. */
    max: number
    /** Drugs this one reverses. Given, it pulls them straight back out. */
    antagonises?: DrugId[]
    /**
     * What too much of it does.
     *
     * Applied on top of the normal effect, by every dose past `max` — so the
     * fourth ampoule of adrenaline still does everything the first one did and
     * a great deal you did not want. The menu will let you give it. Refusing
     * would be the safe design and the useless one: you cannot learn what an
     * overdose looks like from a button that will not press.
     */
    toxic?: {
        /** Extra offsets, per dose over the limit. */
        effect?: Partial<Record<VitalKey, number>>
        /** A rhythm it can throw the heart into, rolled once as the dose lands. */
        rhythm?: { to: Rhythm, chance: number }
        /** What to say when it bites. */
        warn: string
    }
}

/**
 * The drawer.
 *
 * Everything here is a curve rather than a number: it comes up over `onset`,
 * holds, and goes back down over `fade`, and the vitals it moved come back with
 * it. Nothing is permanent and nothing is instant, which between them are most
 * of what makes giving a drug a decision — you are committing the next few
 * minutes of somebody's heart rate, not pressing a button that adds twenty.
 *
 * Two drugs act on the same vital and they simply sum, which is all
 * counteraction needs to be for most of this: atropine and amiodarone will
 * cancel each other out and leave you with a casualty you have done nothing
 * for. Naloxone is the exception — a real antagonist, which does not add an
 * opposite effect but takes the opioid back off the board.
 */
export const DRUGS: Record<DrugId, Drug> = {
    // The three opioids kill the same way and it is not the pain: they take the
    // drive to breathe with them, and enough of them take it entirely.
    morphine:      { label: 'Morphine',      dose: '10 mg IV', onset: 25, duration: 300, fade: 90,  max: 3, effect: { pain: -48, hr: -8, rr: -4, sysBp: -6 },
        toxic: { effect: { rr: -6, sysBp: -10, spo2: -4 }, warn: 'Opioid overdose — respiratory drive going' } },
    nalbuphine:    { label: 'Nalbuphine',    dose: '10 mg IM', onset: 20, duration: 240, fade: 70,  max: 3, effect: { pain: -34, hr: -4, rr: -2 },
        toxic: { effect: { rr: -5, sysBp: -8 }, warn: 'Opioid overdose — respiratory drive going' } },
    fentanyl:      { label: 'Fentanyl',      dose: '800 µg',  onset: 12, duration: 180, fade: 50,  max: 3, effect: { pain: -42, rr: -3 },
        toxic: { effect: { rr: -7, spo2: -5 }, warn: 'Opioid overdose — respiratory drive going' } },

    epi:           { label: 'Epinephrine',   dose: '1 mg',     onset: 8,  duration: 120, fade: 40,  max: 4, effect: { hr: 24, sysBp: 20, diaBp: 9 },
        toxic: { effect: { hr: 26, sysBp: 24 }, rhythm: { to: 'vf', chance: 0.35 }, warn: 'Adrenaline toxicity — the heart is irritable' } },
    atropine:      { label: 'Atropine',      dose: '0.5 mg',   onset: 10, duration: 200, fade: 60,  max: 3, effect: { hr: 18 },
        toxic: { effect: { hr: 26, spo2: -3 }, rhythm: { to: 'vt', chance: 0.2 }, warn: 'Atropine toxicity — rate running away' } },
    amiodarone:    { label: 'Amiodarone',    dose: '300 mg',   onset: 20, duration: 280, fade: 80,  max: 2, effect: { hr: -16, sysBp: -8 },
        toxic: { effect: { hr: -22, sysBp: -26 }, rhythm: { to: 'pea', chance: 0.25 }, warn: 'Amiodarone toxicity — pressure falling away' } },
    phenylephrine: { label: 'Phenylephrine', dose: '100 µg',  onset: 10, duration: 90,  fade: 30,  max: 4, effect: { sysBp: 16, diaBp: 10, hr: -6 }, bleedMul: 0.8,
        toxic: { effect: { sysBp: 26, diaBp: 16, hr: -14, spo2: -9 }, warn: 'Vessels clamped too hard — nothing is perfusing' } },

    /*
       The two that do anything about tombstones.

       Neither of them is a defibrillator and neither is quick — aspirin stops
       the clot growing, GTN opens what is still open, and between them the ST
       segments come back down over a minute or two of both being on board.
       One on its own does nothing, which is the entire reason there are two.

       Both have a price, and both prices are the ones that matter here.
       Aspirin thins the blood, which is the last thing you want in somebody
       with holes in them. GTN drops the pressure, so giving it to a casualty
       who is already empty is how you arrest them for a reason that was
       entirely yours.
    */
    aspirin:       { label: 'Aspirin',       dose: '300 mg chewed', onset: 30, duration: 900, fade: 120, max: 1, effect: {}, bleedMul: 1.16,
        toxic: { effect: { sysBp: -6 }, warn: 'Too much aspirin — every wound on them is thinner now' } },
    gtn:           { label: 'GTN Spray',     dose: '400 µg SL', onset: 15, duration: 180, fade: 45,  max: 3, effect: { pain: -20, sysBp: -14, diaBp: -8, hr: 6 },
        toxic: { effect: { sysBp: -26, diaBp: -14, hr: 16, spo2: -3 }, warn: 'GTN on an empty tank — the pressure has gone' } },

    txa:           { label: 'TXA',           dose: '1 g slow', onset: 45, duration: 600, fade: 120, max: 1, effect: {}, bleedMul: 0.78,
        toxic: { effect: { spo2: -6 }, warn: 'Too much TXA — clot where you did not want one' } },
    naloxone:      { label: 'Naloxone',      dose: '0.4 mg',   onset: 8,  duration: 150, fade: 40,  max: 3, effect: { rr: 4 },
        antagonises: ['morphine', 'nalbuphine', 'fentanyl'],
        toxic: { effect: { pain: 30, hr: 18, sysBp: 14 }, warn: 'Acute withdrawal — casualty is in agony' } },
    caffeine:      { label: 'Caffeine Gum',  dose: 'morale',   onset: 60, duration: 300, fade: 90,  max: 2, effect: { hr: 5 },
        toxic: { effect: { hr: 16 }, warn: 'Rather too much caffeine' } },
}

/** Respiratory rate below which they stop trying. Opioids get you here. */
export const DEPRESSED_RR = 5

/**
 * A dose, and how much of it has landed.
 *
 * `applied` is a ledger rather than a description: it records the fraction of
 * the effect already added to the casualty's vitals, so every tick only has to
 * apply the difference. Wearing off is the same operation with a smaller
 * number, which means a drug takes back exactly what it gave and no accounting
 * of "original" vitals is needed anywhere.
 */
export interface Dose {
    id: number
    drug: DrugId
    /** Given past the drug's limit. Carries the toxic effect as well as the normal one. */
    over: boolean
    /** Whether an over-limit dose has already rolled for what it might throw the heart into. */
    bit: boolean
    /** Seconds since it went in. */
    age: number
    /** Fraction of the effect currently applied, 0–1. */
    applied: number
    /**
     * The same, for heart rate alone.
     *
     * Rate is the one vital something else assigns outright — an arrest sets
     * it, compressions set it — so a rate drug's contribution is definitionally
     * not in that number while either is happening. It pauses, the ledger reads
     * zero, and it picks up again when the heart is setting its own rate. Which
     * is also the truth of it: adrenaline cannot speed up a heart that has
     * stopped.
     */
    hrApplied: number
}

/**
  * Forget what the drugs have done to the heart rate.
  *
  * Anything that assigns `p.hr` outright — an arrest, a return of circulation —
  * has just thrown the ledger's contribution away along with everything else
  * that was in that number. The ledger has to be told, because otherwise it
  * subtracts the same contribution a second time as the dose fades and walks
  * the rate down through zero. Five ampoules of adrenaline and a ROSC is how
  * you end up looking at a conscious casualty at minus two.
  */
export function resetRateLedger(p: Patient) {
    for (const d of p.doses) d.hrApplied = 0
}

/** How much of a dose is working, at that age. */
export function intensity(d: Drug, age: number): number {
    if (age <= 0 || age >= d.duration) return 0
    if (age < d.onset) return age / d.onset
    const fadeAt = d.duration - d.fade
    return age < fadeAt ? 1 : Math.max(0, (d.duration - age) / d.fade)
}

/** Doses on board that are past the label. */
export const overdosed = (p: Patient) => p.doses.filter(d => d.over).length

/**
 * Whether anything on board is holding the heart rate where it is.
 *
 * Asked before the rate is allowed to drift back towards its own baseline,
 * because that drift *assigns* `p.hr` and the ledger is holding a number for
 * how much of that vital belongs to a drug. Two writers on one number is the
 * disagreement that had a conscious casualty reading minus two, and the cheap
 * way to stay out of it is to let the drug have the rate while it has it.
 */
export const rateHeld = (p: Patient) => p.doses.some(d => {
    if (d.hrApplied <= 0.01) return false
    const drug = DRUGS[d.drug]
    return (drug.effect.hr ?? 0) !== 0 || (d.over && (drug.toxic?.effect?.hr ?? 0) !== 0)
})

/** Whether a drug is actually working, as opposed to merely having been given. */
export const onBoard = (p: Patient, drug: DrugId) =>
    p.doses.some(d => d.drug === drug && d.applied > 0.05)

/**
 * What the bleeding is multiplied by, for what is on board.
 *
 * Floored well above zero on purpose. Tightening the vessels and slowing the
 * clot breakdown both buy time at a price the casualty pays later — neither is
 * a dressing, and a drug that could stop a haemorrhage outright would teach the
 * wrong thing. `totalBleed` is left alone for the same reason a tourniqueted
 * limb keeps its colour: the wound is exactly as open as it was.
 */
export function bleedFactor(p: Patient): number {
    let f = 1
    for (const d of p.doses) {
        const m = DRUGS[d.drug].bleedMul
        if (m !== undefined) f *= 1 - (1 - m) * d.applied
    }
    return Math.max(0.3, f)
}

/* ---------- the airway ----------------------------------------------------- */

export type Obstruction = 'none' | 'tongue' | 'vomit'
export type Adjunct = 'none' | 'npa' | 'opa' | 'king'

export const ADJUNCT_LABEL: Record<Adjunct, string> = {
    none: 'none', npa: 'NPA', opa: 'Guedel (OPA)', king: 'King LT',
}

export const OBSTRUCTION_LABEL: Record<Obstruction, string> = {
    none: 'Clear', tongue: 'Tongue has fallen back', vomit: 'Vomit in the airway',
}

/** Saturation below which the casualty is gone. */
export const FATAL_SPO2 = 50

/** Saturation at which respiratory effort gives out, and at which it comes back. */
export const APNOEA_AT = 60
export const APNOEA_OUT = 74

/**
 * Whether they are making respiratory effort of their own.
 *
 * The distinction the airway section turns on: an open airway is a pipe with
 * nothing blocking it, and a pipe moves no air unless something is working it.
 * A casualty in arrest is not breathing, and neither is one who has been
 * hypoxic long enough to stop trying.
 */
export function breathing(p: Patient): boolean {
    return !p.cardiacArrest && p.spontaneous
}

/**
 * Whether air is actually reaching the lungs — theirs, or somebody's bag.
 *
 * This, and not `airwayOpen`, is what saturation follows. Clearing an airway
 * on a casualty who has stopped breathing gets you a clear airway; it does not
 * get you a rising number, and that gap is the whole reason to carry a BVM.
 */
/**
 * Whether both your hands are already on the casualty.
 *
 * Compressions and a bag-valve mask are things you are *doing*, continuously,
 * with the hands you would otherwise be drawing up adrenaline with. So they
 * block everything else until you stop — which is the decision they were
 * always supposed to be: every second you spend on the drug is a second
 * nobody is pushing on the chest, and the downtime clock speeds back up while
 * you do it.
 */
export function handsFull(p: Patient): 'Compressions' | null {
    return p.cprActive ? 'Compressions' : null
}

/** The row that frees your hands again, and so stays available. */
export const FREES_HANDS: ReadonlySet<string> = new Set(['cpr'])

/**
 * What everything else is multiplied by while you are bagging.
 *
 * A bag is one hand, not two. You can carry on working with the other one and
 * everything takes twice as long, which is a real choice rather than a wall:
 * the casualty keeps breathing and the dressing takes eight seconds instead of
 * four. Compressions are still both hands and still stop everything.
 */
export const BAGGING_SLOWDOWN = 2

export function ventilating(p: Patient): boolean {
    return airwayOpen(p) && (breathing(p) || p.bagging)
}

/**
 * The respiratory rate as the monitor would read it.
 *
 * `p.rr` is the drive — what the drugs and the injuries have done to how hard
 * they are trying. What comes out of the chest is a different number: nothing
 * at all if they have stopped, twelve if somebody is squeezing a bag, and
 * visibly laboured if they are working against something that is in the way.
 */
/**
 * The pressure the monitor reads.
 *
 * A stopped heart makes none. Somebody's hands make a surprising amount of
 * systolic and almost no diastolic, which is both what compressions actually
 * produce and the reason the number is worth showing: it is enough for the
 * probe to find and nowhere near enough to be a circulation.
 */
export function shownBp(p: Patient): [number, number] {
    if (!p.cardiacArrest) return [Math.round(p.sysBp), Math.round(p.diaBp)]
    if (p.cprActive) return [jitter(74, 7), jitter(26, 4)]
    return [0, 0]
}

/**
 * Saturation as the probe reads it, or null if it cannot find anything.
 *
 * A pulse oximeter needs pulsatile flow. An arrest has none and the cell reads
 * dashes — but compressions are flow, so the moment you start pushing the
 * number comes back, and what it does from there is the point: without a bag on
 * them it carries on falling while you compress, which is the whole argument
 * for both at once.
 *
 * Derived rather than written, so nothing here fights the drugs or the fluids
 * for ownership of a vital.
 */
export function shownSpo2(p: Patient): number | null {
    if (p.cardiacArrest && !p.cprActive) return null
    return jitter(p.spo2, 1)
}

export function shownRr(p: Patient): number {
    if (!breathing(p)) return p.bagging ? 12 : 0
    return Math.round(airwayOpen(p) ? p.rr : p.rr * 1.6)
}

/** How often going under brings the last meal up with it. */
export const VOMIT_ON_COLLAPSE = 0.45

/**
 * Whether air is actually moving.
 *
 * Four ways to keep it moving and they are not interchangeable, which is the
 * whole lesson of the section:
 *
 * · The recovery position lets gravity do it, and gravity does not get tired.
 * · A supraglottic seals the trachea off from the mouth, so it holds against
 *   anything, including what the casualty brings up afterwards.
 * · An NPA or a Guedel only holds the tongue off the back of the throat. They
 *   are an answer to unconsciousness and no answer at all to vomit — which is
 *   why putting one in a mouth full of it is not offered.
 * · Clearing it by hand works on what is in there now and nothing after.
 */
export function airwayOpen(p: Patient): boolean {
    if (p.recovery || p.adjunct === 'king') return true
    if (p.airway === 'vomit') return false
    if (p.airway === 'tongue') return p.adjunct !== 'none'
    return true
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
    /** How much of a drug class is actually working, summed across doses. */
    const load = (...ids: DrugId[]) =>
        p.doses.filter(d => ids.includes(d.drug)).reduce((n, d) => n + d.applied, 0)

    const opioid = load('morphine', 'nalbuphine', 'fentanyl')
    const tooMuch = p.doses.some(d => d.over && d.applied > 0.5)

    /*
       A casualty full of morphine has opinions and none of them are about their
       injuries. Checked before anything else because it is comfortably the
       loudest thing about them, and because a man telling you he loves you is
       a more useful reading than a pain score — it is how you notice you have
       given him rather a lot.
    */
    if (opioid >= 1.6 || (opioid >= 0.7 && tooMuch)) {
        return [
            "…m'fine. M'totally fine.",
            "Why're there two of you?",
            "'m just gonna have a little sleep…",
            'Wha… who… wha?',
            "Is it Thursday? It feels like a Thursday.",
        ]
    }
    if (opioid >= 0.7) {
        return [
            'I love you, mate. Genuinely.',
            'Am I floating? I think I might be floating.',
            "You've got really kind eyes, you know that?",
            'Tell my mum I did a good job.',
            "I can't feel my face and I am completely fine with it.",
            'Put me in for a commendation. I have earned it.',
            "Everything's gone all warm and lovely.",
            'Do you reckon I could still make the op?',
            "I'm naming my firstborn after you.",
            'This is the best I have felt all year.',
        ]
    }

    const out: string[] = []
    if (load('naloxone') > 0.4 && p.meds.some(m => m === 'Morphine' || m === 'Fentanyl' || m === 'Nalbuphine')) {
        out.push('WHY would you do that', 'Bring back the good stuff. Please.', "You've ruined a perfectly nice time")
    }
    if (load('epi') > 0.5)      out.push("My heart is going like a machine gun", 'I can hear my own pulse')
    if (load('caffeine') > 0.6) out.push('I am extremely awake now', 'I could run the whole way back')

    // The one thing the casualty knows that the monitor has not told you yet.
    // Worth saying out loud, because tombstones with a blood pressure look
    // like a casualty doing rather well from every other angle.
    if (p.rhythm === 'stemi') out.push("There's something sitting on my chest", 'My left arm has gone numb', "It's like a band round my ribs")
    if (p.pain > 72)      out.push('Aaah — that really hurts', 'Please, something for the pain', "I can't take much more of this")
    else if (p.pain > 38) out.push('That stings like hell', 'Careful — careful', 'It hurts when you touch it')
    if (p.blood < 58)     out.push("I'm freezing", "I'm so thirsty", 'Everything has gone grey')
    if (p.blood < 44)     out.push("I don't feel right", 'Am I going to be alright?', "I can't feel my hands")
    if (p.spo2 < 92)      out.push("I can't get a breath", 'My chest is tight')
    if (totalBleed(p) > 0) out.push("I'm still bleeding, aren't I", "Don't let go of it")
    if (p.tqCount > 0)    out.push('That strap is agony', 'Am I keeping the leg?')
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
    /*
       A pulse is not a rhythm.

       Tombstones with a blood pressure is a casualty having a heart attack
       while you tidy up their leg, and they will read entirely well while it
       happens — rate, pressure, saturation, all of it. Handing that over as
       stable is how you find out too late, so the trace has to be right before
       anybody is going anywhere.
    */
    else if (p.rhythm !== 'sinus') out.push(`${RHYTHM_LABEL[p.rhythm]} — rhythm not corrected`)
    if (totalBleed(p) > 0) out.push('Still bleeding')

    const undressed = Object.values(p.parts).reduce((n, pt) => n + pt.wounds.filter(w => !w.bandaged).length, 0)
    if (undressed > 0) out.push(`${undressed} wound${undressed === 1 ? '' : 's'} undressed`)

    /*
       A dressing is a delay, not a repair.

       Every one of them gives way eventually, so a casualty who is only
       bandaged is a casualty who will be bleeding again by the time anybody
       else sees them. Sutures are what close a wound for good, and nobody is
       stable until every wound has some.
    */
    const unsutured = Object.values(p.parts).reduce((n, pt) => n + pt.wounds.length, 0)
    if (unsutured > 0) out.push(`${unsutured} wound${unsutured === 1 ? '' : 's'} not sutured`)

    const unsplinted = Object.values(p.parts).filter(pt => pt.fractured && !pt.splinted).length
    if (unsplinted > 0) out.push(`${unsplinted} fracture${unsplinted === 1 ? '' : 's'} unsplinted`)

    if (!airwayOpen(p)) out.push(OBSTRUCTION_LABEL[p.airway] + ' — airway blocked')
    // Nobody is handed over with a balloon in their aorta. Taking it down is
    // the last thing you do, and it is the thing the rest of the job was for.
    if (p.reboa) out.push(`REBOA inflated ${Math.round(p.reboa.up)}s — must come down`)
    // A bag is somebody standing there squeezing. They are not stable until
    // they are doing it themselves.
    if (!p.cardiacArrest && !p.spontaneous) out.push('Not breathing — needs ventilating')
    if (p.pneumo) out.push('Tension pneumothorax — needs decompressing')
    if (p.chestWound && !p.sealed) out.push('Chest wound unsealed')

    if (p.blood < 70) {
        // A bag already running is not an outstanding job, so say so rather
        // than telling you to go and hang the one you just hung.
        const running = mlRunning(p)
        out.push(running > 0
            ? `Volume ${Math.round(p.blood)}% — ${Math.ceil(running)} ml still running`
            : `Volume ${Math.round(p.blood)}% — needs fluids`)
    }
    if (!p.cardiacArrest) {
        // The rate itself, not just the trace. A casualty running at 150 after
        // a litre of adrenaline is compensating for something or being driven
        // by something, and either way they are not finished.
        const hr = Math.round(p.hr)
        if (hr < HR_OK[0]) out.push(`Heart rate ${hr} — bradycardic`)
        else if (hr > HR_OK[1]) out.push(`Heart rate ${hr} — tachycardic`)
    }
    if (p.spo2 < 92) out.push(`SpO₂ ${Math.round(p.spo2)}% — needs oxygen`)
    if (p.pain > 30) out.push('In pain — needs analgesia')
    if (p.rr < 8 && breathing(p)) out.push(`Respiratory rate ${Math.round(p.rr)} — over-sedated`)
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
        for (const w of open) bits.push(WOUND_TYPES[w.t].name.toLowerCase())
        if (bits.length) lines.push({ text: `${name} — ${bits.join(', ')}`, kind: 'bad' })
    }

    if (p.chestWound) lines.push({ text: 'Penetrating chest wound — watch for a tension', kind: 'bad' })
    if (p.cardiacArrest) lines.push({ text: 'CASUALTY IS IN CARDIAC ARREST', kind: 'bad' })
    else if (totalBleed(p) > 0) lines.push({ text: 'Casualty is bleeding', kind: 'bad' })
    else if (!lines.length) lines.push({ text: 'No obvious injuries — survey the casualty', kind: '' })

    lines.push({ text: `Casualty on the table — ${p.name.toUpperCase()}`, kind: '' })
    return lines
}

/* ---------- helpers ------------------------------------------------------- */

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/**
  * Simulated instrument noise. Vitals are never read twice the same.
  *
  * Floored at zero: everything it is used on is a count of something, and a
  * heart rate of nought jittered by two reads minus two, which is not a number
  * any monitor has ever shown anybody.
  */
export const jitter = (v: number, d: number) => Math.max(0, Math.round(v + (Math.random() * 2 - 1) * d))

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
    return pt.wounds.reduce((a, w) => a + (w.bandaged ? 0 : WOUND_TYPES[w.t].bleed), 0)
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
