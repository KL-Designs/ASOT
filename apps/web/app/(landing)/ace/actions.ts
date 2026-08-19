import {
    ADJUNCT_LABEL, APNOEA_AT, APNOEA_OUT, BAG_SIZES, BANDAGES, CPR_DOWNTIME_RATE, CPR_RATE,
    DEATH_DOWNTIME, DEPRESSED_RR, DRUGS, FATAL_SPO2, FLUIDS, OBSTRUCTION_LABEL,
    RHYTHM_LABEL, SHOCKABLE, VOMIT_ON_COLLAPSE, WOUND_TYPES,
    BAGGING_SLOWDOWN, FREES_HANDS, REBOA_FATAL, REBOA_OCCLUSION, REBOA_WARN,
    airwayOpen, arrestHr, bleedBelowBalloon, bestBandage, bleedFactor, breathing, clamp, dressingLife,
    handsFull, intensity, partBleeding,
    isConscious, jitter, nextWound, onBoard, pName, reopenChance, setRhythm, shownBp, shownSpo2,
    stabilityIssues,
    totalBleed, ventilating,
    type Adjunct, type BandageId, type BodyPart, type Dose, type DrugId, type FluidId,
    type Patient, type PartId, type VitalKey,
} from './model'
import type { Sfx } from './audio'

/* ============================================================================
   HZN-MED — the treatment tables.

   Three tables and nothing else is hard-coded: TOOLS is the toolbar, ACTIONS is
   what each tool offers, and model.ts's PARTS / WOUND_TYPES are what it acts on.
   Add a limb, an injury or a treatment by editing one of those.

   Every `run` mutates the patient it is handed and returns what to say about
   it. The component clones first, so the mutation lands on a copy — which is
   also the seam to POST {action, part} at instead, if this ever grows a server.
   ========================================================================== */

export type ToolId =
    | 'triage' | 'examine' | 'bandage' | 'medication'
    | 'airway' | 'advanced'

export const TOOLS: { id: ToolId, label: string }[] = [
    { id: 'triage',     label: 'Triage Card' },
    { id: 'examine',    label: 'Examine' },
    { id: 'bandage',    label: 'Bandages & Splints' },
    { id: 'medication', label: 'Medication' },
    { id: 'airway',     label: 'Airway & Chest' },
    { id: 'advanced',   label: 'Advanced Treatment' },
]

/** A rule drawn after these, so the toolbar groups rather than runs on. */
export const TOOL_SEPS = new Set<ToolId>(['triage', 'advanced'])

/*
   How long a treatment takes, in seconds.

   Nothing here is instant, and only one thing can be underway at a time — the
   casualty keeps bleeding while you work, so what you reach for first is the
   decision the menu is actually asking you to make. A tourniquet costs five
   seconds you could have spent on a dressing.

   Most actions take their tool's default; the table below is the exceptions.
   Triage is zero: filling in a card is paperwork, not treatment.
*/
const TOOL_TIME: Record<ToolId, number> = {
    triage: 0, examine: 3, bandage: 3, medication: 3,
    airway: 4, advanced: 6,
}

const ACTION_TIME: Record<string, number> = {
    full: 8, bt: 4,
    packing: 4, quik: 4, tq: 5, tqoff: 3, seal: 5,
    decom: 5, bvm: 2, oxy: 3,
    iv: 5, blood: 8, plasma: 8, saline: 8, analyse: 6, shock: 4, pak: 10, surg: 15,
    monon: 5, monoff: 3, pads: 6,
    look: 3, tilt: 3, turn: 4, suction: 5, recov: 5, reboa: 20, reboaDown: 8,
    splint: 6, realign: 4, sling: 4, blanket: 3, heat: 3,
}

/**
 * Whether this row can be pressed at all right now.
 *
 * Separate from `showFor`, which is about the casualty. This is about you:
 * a row can be perfectly indicated and still be something you have no free
 * hand for.
 */
export function blockedBy(p: Patient, a: Action): string | null {
    const hands = handsFull(p)
    if (hands && !FREES_HANDS.has(a.id)) return hands
    return null
}

/**
 * Seconds this action takes, for this casualty.
 *
 * Not a constant, because one of your hands may be on a bag — see
 * `BAGGING_SLOWDOWN`. The menu shows the number this returns rather than the
 * one in the table, so what the row promises is what the row costs.
 */
export function actionTime(tool: ToolId, a: Action, p?: Patient): number {
    const base = a.time ?? ACTION_TIME[a.id] ?? TOOL_TIME[tool]
    return p?.bagging ? base * BAGGING_SLOWDOWN : base
}

/**
 * What each row sounds like.
 *
 * A table rather than a field on forty rows: the noise a thing makes is a
 * property of the thing, not of the treatment table, and half the entries
 * share one. Anything missing is silent, which is the right answer for taking
 * a pulse.
 */
const ACTION_SFX: Record<string, Sfx> = {
    field: 'bandage', packing: 'bandage', elastic: 'bandage', quik: 'bandage',
    pak: 'bandage', sling: 'bandage', surg: 'suture',
    tq: 'tourniquet', tqoff: 'tqOff', seal: 'seal',
    splint: 'splint', realign: 'roll',

    iv: 'needle', blood: 'fluid', plasma: 'fluid', saline: 'fluid',
    reboa: 'reboaUp', reboaDown: 'reboaDown',

    monon: 'cuff', monoff: 'tqOff', pads: 'pads',
    tilt: 'roll', turn: 'roll', recov: 'roll', suction: 'suction',
    npa: 'tube', opa: 'tube', king: 'tube', decom: 'decompress',

    morph: 'syringe', nalb: 'syringe', fent: 'syringe',
    epi: 'syringe', atro: 'syringe', amio: 'syringe', phen: 'syringe',
    txa: 'syringe', nalox: 'syringe', carb: 'syringe',

    blanket: 'roll', heat: 'roll',
}

export const actionSfx = (a: Action): Sfx | null => ACTION_SFX[a.id] ?? null

/**
 * What a row sounds like *while* it runs, and how often.
 *
 * Grouped by what your hands are actually doing rather than by tool: wrapping,
 * stitching, ratcheting, pumping, probing, drawing up, or moving somebody
 * about. Rows with their own dedicated run sound — the defibrillator's charge
 * and its analysis — are left out, because two noises at once is one too many.
 */
const ACTION_WORK: Record<string, [Sfx, number]> = {
    field: ['workWrap', 480], packing: ['workWrap', 480], elastic: ['workWrap', 480],
    quik: ['workWrap', 480], pak: ['workWrap', 440], sling: ['workWrap', 500],
    splint: ['workWrap', 520], seal: ['workWrap', 460],

    surg: ['workStitch', 420],

    tq: ['workRatchet', 300], tqoff: ['workRatchet', 340],
    monon: ['workRatchet', 380], monoff: ['workRatchet', 380],

    reboa: ['workPump', 520], reboaDown: ['workPump', 560],
    suction: ['workPump', 400], decom: ['workPump', 480],
    blood: ['workPump', 620], plasma: ['workPump', 620], saline: ['workPump', 620],

    iv: ['workProbe', 620], pads: ['workProbe', 640],
    look: ['workProbe', 700], part: ['workProbe', 700], full: ['workProbe', 640],
    pulse: ['workProbe', 720], bp: ['workProbe', 720], spo2: ['workProbe', 720],
    resp: ['workProbe', 720], bt: ['workProbe', 680],

    npa: ['workScrape', 500], opa: ['workScrape', 500], king: ['workScrape', 520],
    morph: ['workScrape', 560], nalb: ['workScrape', 560], fent: ['workScrape', 560],
    epi: ['workScrape', 560], atro: ['workScrape', 560], amio: ['workScrape', 560],
    phen: ['workScrape', 560], txa: ['workScrape', 600], nalox: ['workScrape', 560],
    carb: ['workScrape', 600],

    tilt: ['workCloth', 620], turn: ['workCloth', 560], recov: ['workCloth', 640],
    realign: ['workCloth', 520], blanket: ['workCloth', 660], heat: ['workCloth', 660],
}

export const actionWork = (a: Action): [Sfx, number] | null =>
    a.sound ? null : ACTION_WORK[a.id] ?? null

export type LogKind = '' | 'good' | 'warn' | 'bad'

/** A section heading in the treatment list. */
export interface ActionSection { sec: string, id?: undefined }

export interface Action {
    id: string
    label: string
    /** Seconds to perform. Omitted takes the tool's default — see TOOL_TIME. */
    time?: number
    /** Right-aligned detail — a dose, a duration, the instrument. */
    note?: string
    /** Status dot: g healthy · y caution · r serious · b informational. */
    dot?: 'g' | 'y' | 'r' | 'b'
    /** Disabled until a body part is selected. */
    needsPart?: boolean
    /** A cue for the UI to play. The defibrillator is all of them. */
    sound?: 'charge' | 'analyse'
    /**
     * Offers a bag size instead of a single button, and hands the choice to
     * `run` as `ml`. Fluids are the only thing you pick an amount of.
     */
    sizes?: readonly number[]
    /** Overrides the label from the casualty's state — CPR reads start or stop. */
    labelFor?: (p: Patient) => string
    /** Whether the row is currently switched on, for the rows that latch. */
    onFor?: (p: Patient) => boolean
    /** The dressing this row applies, so the menu can recommend one of them. */
    bandage?: BandageId
    /**
     * Whether this is indicated at all, right now, for what is selected.
     *
     * The list is a shelf you are looking at rather than a catalogue you are
     * searching. A dressing offered for a limb with nothing open on it is
     * noise, and noise is what you have to read past while somebody bleeds —
     * so anything not indicated is not shown, rather than shown and refused.
     *
     * `pt` is null when no part is selected, which is why every limb-specific
     * row starts by testing for one.
     */
    showFor?: (p: Patient, pt: BodyPart | null) => boolean
    run: (p: Patient, partId: PartId | null, ml: number) => [string, LogKind]
    sec?: undefined
}

export type ActionRow = Action | ActionSection

/* ---------- what is indicated --------------------------------------------- */

/** The four you can put a tourniquet or a cannula in. */
const LIMBS: ReadonlySet<PartId> = new Set<PartId>(['armL', 'armR', 'legL', 'legR'])

/** An open wound, dressed or not — a tourniqueted limb still has one. */
const isOpen = (pt: BodyPart) => pt.wounds.some(w => !w.bandaged)

const onChest = (_p: Patient, pt: BodyPart | null) => pt?.id === 'torso'
const onHead  = (_p: Patient, pt: BodyPart | null) => pt?.id === 'head'
const woundOn = (_p: Patient, pt: BodyPart | null) => !!pt && isOpen(pt)
const brokenOn = (_p: Patient, pt: BodyPart | null) => !!pt && pt.fractured && !pt.splinted
const hasLine = (_p: Patient, pt: BodyPart | null) => !!pt && pt.iv > 0 && !pt.tourniquet
const onArm = (_p: Patient, pt: BodyPart | null) => !!pt && (pt.id === 'armL' || pt.id === 'armR')

/**
 * The rows worth drawing, with the headings of any section that emptied.
 *
 * Done here rather than in the component because what is indicated is a
 * question about the casualty, and the component's job is to draw the answer.
 */
export function visibleRows(rows: ActionRow[], p: Patient, pt: BodyPart | null): ActionRow[] {
    const kept = rows.filter(r => r.sec !== undefined || !r.showFor || r.showFor(p, pt))
    return kept.filter((r, i) => {
        if (r.sec === undefined) return true
        const next = kept[i + 1]
        return next !== undefined && next.sec === undefined
    })
}

/* ---------- shared treatment effects -------------------------------------- */

/**
 * Return of spontaneous circulation.
 *
 * `setRhythm` does the work — forty beats a minute, still under, climbing.
 * All this adds is where it is climbing to and a pressure that is back but
 * nowhere near good, because the casualty at the end of a resuscitation is
 * not a casualty you have finished with.
 */
function rosc(p: Patient, target: number) {
    setRhythm(p, 'sinus')
    p.hrTarget = target
    p.sysBp = clamp(Math.max(p.sysBp, 74), 0, 200)
    p.diaBp = clamp(Math.max(p.diaBp, 44), 0, 140)
    p.spo2 = clamp(Math.max(p.spo2, 84), 0, 100)
}

/**
 * One dressing, one wound. The worst one open on that part.
 *
 * Whether it will hold is rolled here rather than every tick, so the answer is
 * fixed the moment you put it on: a dressing that was going to give way was
 * always going to, and the chart is what told you the odds beforehand.
 */
function dress(p: Patient, id: PartId, b: BandageId): [string, LogKind] {
    const pt = p.parts[id]
    const w = nextWound(pt)
    if (!w) return ['No open wounds on the ' + pName(id), 'warn']

    w.bandaged = true
    w.dressing = b
    w.failIn = Math.random() < reopenChance(w.t, b) ? dressingLife(w.t, b) : null
    p.pain = clamp(p.pain - 4, 0, 100)

    const wound = WOUND_TYPES[w.t].name.toLowerCase()
    return [`${BANDAGES[b].label} — ${pName(id)} · ${wound} closed`, 'good']
}

/** What a vital is allowed to reach, so a drug cannot push one somewhere absurd. */
const VITAL_CAP: Record<VitalKey, number> = { pain: 100, spo2: 100, hr: 250, sysBp: 250, diaBp: 200, rr: 60 }

/**
 * Put a drug in. Nothing happens yet.
 *
 * It goes on the board with an age of zero and comes up over its onset, which
 * is the whole difference between this and a button that adds twenty to a
 * number: you have committed the next few minutes and you will not know what
 * you have done for another twenty seconds.
 */
function give(p: Patient, id: DrugId): [string, LogKind] {
    const drug = DRUGS[id]
    // Past the label it still goes in. Refusing would be the safe design and
    // the useless one — you cannot learn what an overdose looks like from a
    // button that will not press.
    const over = p.meds.filter(m => m === drug.label).length >= drug.max
    p.meds.push(drug.label)

    /*
       An antagonist does not add an opposite effect, it takes the other drug
       off the board — which means the analgesia comes off with it. Reversing an
       opioid gets you a casualty who is breathing and in a great deal of pain,
       and that is the trade, not a side effect.
    */
    let reversed = 0
    for (const d of p.doses) {
        if (!drug.antagonises?.includes(d.drug)) continue
        const other = DRUGS[d.drug]
        d.age = Math.max(d.age, other.duration - other.fade * 0.3)
        reversed++
    }

    p.doses.push({ id: p.doseSeq++, drug: id, over, age: 0, bit: false, applied: 0, hrApplied: 0 })
    if (over) return [`${drug.label} — past the maximum dose, and it is going in anyway`, 'bad']
    if (reversed) return [`${drug.label} given — ${reversed} opioid dose(s) reversing`, 'warn']
    return [`${drug.label} ${drug.dose} — in, working in ${drug.onset}s`, 'good']
}

/** What a dose is actually worth, which for an overdose is rather more. */
function doseEffect(d: Dose): Partial<Record<VitalKey, number>> {
    const drug = DRUGS[d.drug]
    if (!d.over || !drug.toxic?.effect) return drug.effect
    const out: Partial<Record<VitalKey, number>> = { ...drug.effect }
    for (const k in drug.toxic.effect) {
        const key = k as VitalKey
        out[key] = (out[key] ?? 0) + (drug.toxic.effect[key] ?? 0)
    }
    return out
}

/** Everything on board, coming up and going back down. */
function metabolise(p: Patient, dt: number): [string, LogKind] | null {
    let said: [string, LogKind] | null = null
    // Rate is assigned outright by an arrest or by your hands, so nothing a
    // drug does to it is in that number while either is true.
    const rateForced = p.cardiacArrest || p.cprActive

    for (const d of p.doses) {
        d.age += dt
        const drug = DRUGS[d.drug]
        const want = intensity(drug, d.age)
        const eff = doseEffect(d)

        const step = want - d.applied
        if (step !== 0) {
            for (const k in eff) {
                const key = k as VitalKey
                if (key === 'hr') continue
                p[key] = clamp(p[key] + (eff[key] ?? 0) * step, 0, VITAL_CAP[key])
            }
            d.applied = want
        }

        // An overdose bites once, as it comes fully on board, and what it does
        // is a coin toss rather than a certainty — which is the honest version
        // and the one that makes it worth not finding out.
        if (d.over && !d.bit && want >= 0.99) {
            d.bit = true
            const t = drug.toxic
            said = [t?.warn ?? `${drug.label} — too much`, 'bad']
            if (t?.rhythm && !p.cardiacArrest && Math.random() < t.rhythm.chance) {
                setRhythm(p, t.rhythm.to)
                said = [`${drug.label.toUpperCase()} OVERDOSE — ${RHYTHM_LABEL[t.rhythm.to]}`, 'bad']
            }
        }

        if (rateForced) { d.hrApplied = 0; continue }
        const hrStep = want - d.hrApplied
        if (hrStep !== 0) {
            p.hr = clamp(p.hr + (eff.hr ?? 0) * hrStep, 0, VITAL_CAP.hr)
            d.hrApplied = want
        }
    }

    // Applied first, dropped after: a dose that has run out unwinds itself on
    // the tick it expires, and only then stops being anybody's business.
    p.doses = p.doses.filter(d => d.age < DRUGS[d.drug].duration)
    return said
}

/**
 * Hang a bag, into a limb.
 *
 * The eight seconds are the line: finding the vein, spiking the bag, getting it
 * running. What is in the bag arrives afterwards, on the sim's clock, and needs
 * nothing further from you — which is the entire reason to reach for fluids
 * early and go and deal with the hole they are coming out of.
 */
function hang(p: Patient, fluid: FluidId, ml: number, id: PartId): [string, LogKind] {
    const pt = p.parts[id]

    /*
       Not past a tourniquet.

       Everything below the strap is out of the circulation — that is the whole
       job of a tourniquet — so a line sited there fills a limb the heart cannot
       reach and gives the casualty nothing. Site it somewhere the blood still
       goes, which on a casualty with a tourniquet on every limb means the neck
       or the marrow, and neither of those is in this menu.
    */
    if (pt.tourniquet) return [`Tourniquet on the ${pName(id)} — nothing will run past it`, 'bad']
    if (!pt.iv) return [`No IV access in the ${pName(id)} — cannulate first`, 'warn']
    // Three lines is as many as you have hands and cannulae for, and it stops
    // the answer to every casualty being another four bags of blood.
    if (p.infusions.length >= 3) return ['No free line — three already running', 'warn']

    const f = FLUIDS[fluid]
    p.infusions.push({ id: p.infusionSeq++, fluid, part: id, volume: ml, left: ml })
    return [`${f.label} ${ml} ml hung — ${pName(id)} · ${Math.round(ml / f.rate)}s to run through`, 'good']
}

/**
 * Take it out again.
 *
 * Which gives you back whatever it was holding off. An unconscious casualty's
 * tongue goes straight back where it was, and a supraglottic can bring the
 * stomach up with it on the way out — so pulling one is a decision rather than
 * an undo, and the airway reads unknown again afterwards either way.
 */
function pullAdjunct(p: Patient): [string, LogKind] {
    const was = p.adjunct
    p.adjunct = 'none'
    p.airwayChecked = true
    if (was === 'none') return ['Nothing sited', 'warn']

    if (!p.conscious && was === 'king' && Math.random() < 0.25) {
        p.airway = 'vomit'
        return [`${ADJUNCT_LABEL[was]} out — and it has brought the stomach up with it`, 'bad']
    }
    if (!p.conscious && p.airway === 'none') {
        p.airway = 'tongue'
        return [`${ADJUNCT_LABEL[was]} out — the tongue has gone straight back`, 'warn']
    }
    return [`${ADJUNCT_LABEL[was]} removed`, '']
}

function siteAdjunct(p: Patient, a: Adjunct): [string, LogKind] {
    if (p.adjunct === a) return [ADJUNCT_LABEL[a] + ' already sited', 'warn']
    p.adjunct = a
    p.airwayChecked = true
    // A supraglottic goes past the problem rather than holding it out of the
    // way, so it is the only one that answers vomit — and the only one that
    // keeps answering it.
    if (a === 'king') p.airway = 'none'
    return [`${ADJUNCT_LABEL[a]} sited — ${airwayOpen(p) ? 'air moving' : 'still obstructed'}`,
        airwayOpen(p) ? 'good' : 'warn']
}

/* ---------- the tables ---------------------------------------------------- */

export const ACTIONS: Record<Exclude<ToolId, 'triage'>, ActionRow[]> = {
    examine: [
        { sec: 'Diagnostics' },
        { id: 'pulse', label: 'Check Pulse', note: 'Stethoscope', dot: 'b', run: p => {
            if (p.cardiacArrest) {
                // Your own compressions, felt at the wrist. Not the same thing
                // as a pulse, and worth saying so.
                return p.cprActive
                    ? ['Checked pulse — a pulse with each compression, nothing between', 'bad']
                    : ['Checked pulse — no pulse detected', 'bad']
            }
            return [`Checked pulse — ${jitter(p.hr, 3)} bpm`, '']
        } },
        { id: 'bp', label: 'Check Blood Pressure', note: 'BP Cuff', dot: 'b', run: p => {
            const [sys, dia] = shownBp(p)
            return [`Blood pressure — ${sys}/${dia} mmHg`, sys < 100 ? 'warn' : '']
        } },
        { id: 'spo2', label: 'Check SpO₂ / Perfusion', note: 'Pulse Oximeter', dot: 'b', run: p => {
            const sat = shownSpo2(p)
            if (sat === null) return ['SpO₂ — the probe cannot find a pulse to read', 'bad']
            return [`SpO₂ — ${sat}% · cap refill ${p.blood < 70 ? '>3s' : '<2s'}`, sat < 95 ? 'warn' : '']
        } },
        { id: 'resp', label: 'Check Response', note: 'AVPU', dot: 'b', run: p =>
            [`Response — ${p.cardiacArrest ? 'UNRESPONSIVE' : p.pain > 70 ? 'responds to voice, agitated' : 'alert & oriented'}`,
                p.cardiacArrest ? 'bad' : ''] },

        { sec: 'Survey' },
        { id: 'part', label: 'Examine Selected Limb', needsPart: true, dot: 'g', run: (p, id) => {
            const pt = p.parts[id!]; pt.checked = true
            const w = pt.wounds.length
            return [`Examined ${pName(id!)} — ${w ? `${w} wound(s)` : 'no wounds'}${pt.fractured ? ', fracture felt' : ''}`,
                w ? 'warn' : 'good']
        } },
        { id: 'full', label: 'Full Body Survey', note: '~8s', dot: 'g', run: p => {
            Object.values(p.parts).forEach(x => { x.checked = true })
            return ['Full body survey complete — all regions assessed', 'good']
        } },
        { id: 'bt', label: 'Blood Type Test', note: 'Test Kit', dot: 'b', run: p => {
            p.bloodTypeKnown = true
            return ['Blood type identified — ' + p.bloodType, 'good']
        } },

        { sec: 'Monitoring' },
        {
            id: 'monon', label: 'Attach Vitals Monitor', note: 'cuff & SpO₂ probe',
            needsPart: true, dot: 'b', time: 5,
            // An arm, and one the blood still reaches: a cuff below a
            // tourniquet reads a limb rather than a casualty.
            showFor: (p, pt) => !p.monitorOn && onArm(p, pt) && !pt!.tourniquet,
            run: (p, id) => {
                p.monitorOn = id
                return ['Vitals monitor attached — ' + pName(id!) + ' · tracing', 'good']
            },
        },
        {
            id: 'monoff', label: 'Remove Vitals Monitor', needsPart: true, dot: 'y', time: 3,
            showFor: (p, pt) => !!pt && p.monitorOn === pt.id,
            run: p => {
                p.monitorOn = null
                return ['Vitals monitor removed — no live trace', 'warn']
            },
        },
    ],

    bandage: [
        { sec: 'Dressings' },
        { id: 'field',   label: BANDAGES.field.label,   bandage: 'field',   needsPart: true, showFor: woundOn, dot: 'g', run: (p, id) => dress(p, id!, 'field') },
        { id: 'packing', label: BANDAGES.packing.label, bandage: 'packing', needsPart: true, showFor: woundOn, dot: 'g', run: (p, id) => dress(p, id!, 'packing') },
        { id: 'elastic', label: BANDAGES.elastic.label, bandage: 'elastic', needsPart: true, showFor: woundOn, dot: 'g', run: (p, id) => dress(p, id!, 'elastic') },
        { id: 'quik',    label: BANDAGES.quik.label,    bandage: 'quik',    needsPart: true, showFor: woundOn, dot: 'g', run: (p, id) => dress(p, id!, 'quik') },

        { sec: 'Haemorrhage Control' },
        {
            id: 'tq', label: 'Apply Tourniquet (CAT)', needsPart: true, dot: 'r',
            // A strap on a limb that is not losing anything is a limb you have
            // taken out of the circulation for nothing.
            showFor: (_p, pt) => !!pt && LIMBS.has(pt.id) && !pt.tourniquet && isOpen(pt),
            run: (p, id) => {
            const pt = p.parts[id!]
            if (id === 'head' || id === 'torso') return ['Cannot apply a tourniquet to the ' + pName(id), 'bad']
            if (pt.tourniquet) return ['Tourniquet already in place on ' + pName(id!), 'warn']
            pt.tourniquet = true; p.tqCount++; p.pain = clamp(p.pain + 12, 0, 100)

            // A line already running into that limb is now running nowhere, and
            // the strap goes on regardless: stopping a bleed outranks a bag.
            // Otherwise the rule above would be a formality — hang first,
            // tourniquet second, and the fluid arrives anyway.
            const cut = p.infusions.filter(i => i.part === id)
            if (cut.length) {
                p.infusions = p.infusions.filter(i => i.part !== id)
                const lost = Math.ceil(cut.reduce((n, i) => n + i.left, 0))
                return [`Tourniquet applied — ${pName(id!)} · line cut off, ${lost} ml lost`, 'bad']
            }
            return ['Tourniquet applied — ' + pName(id!) + ' · time noted', 'warn']
            },
        },
        {
            id: 'tqoff', label: 'Remove Tourniquet', needsPart: true, dot: 'y',
            showFor: (_p, pt) => !!pt && pt.tourniquet,
            run: (p, id) => {
                const pt = p.parts[id!]
                pt.tourniquet = false; p.tqCount = Math.max(0, p.tqCount - 1)
                return ['Tourniquet released — ' + pName(id!), '']
            },
        },
        {
            id: 'seal', label: 'Chest Seal (Vented)', needsPart: true, dot: 'g',
            showFor: (p, pt) => onChest(p, pt) && p.chestWound && !p.sealed,
            run: p => {
                p.sealed = true
                if (!p.pneumo) p.pneumoIn = null
                return ['Chest seal applied — occlusive dressing over the wound', 'good']
            },
        },

        { sec: 'Fractures' },
        {
            id: 'splint', label: 'Apply Splint', needsPart: true, dot: 'g', showFor: brokenOn,
            run: (p, id) => {
                const pt = p.parts[id!]
                pt.splinted = true; p.pain = clamp(p.pain - 10, 0, 100)
                return ['Splint applied — ' + pName(id!) + ' immobilised', 'good']
            },
        },
        {
            id: 'realign', label: 'Realign Limb', needsPart: true, note: 'painful', dot: 'y', showFor: brokenOn,
            run: (p, id) => {
                p.pain = clamp(p.pain + 20, 0, 100)
                return ['Limb realigned — ' + pName(id!) + ' · casualty screaming', 'warn']
            },
        },
        {
            id: 'sling', label: 'Improvised Sling', needsPart: true, dot: 'g',
            showFor: (_p, pt) => !!pt && (pt.id === 'armL' || pt.id === 'armR') && pt.fractured,
            run: (_p, id) => ['Sling applied — ' + pName(id!) + ' supported', 'good'],
        },
    ],

    medication: [
        { sec: 'Analgesia · all three depress breathing' },
        { id: 'morph', label: DRUGS.morphine.label,   note: DRUGS.morphine.dose,   dot: 'y', run: p => give(p, 'morphine') },
        { id: 'nalb',  label: DRUGS.nalbuphine.label, note: DRUGS.nalbuphine.dose, dot: 'y', run: p => give(p, 'nalbuphine') },
        { id: 'fent',  label: DRUGS.fentanyl.label,   note: DRUGS.fentanyl.dose,   dot: 'y', run: p => give(p, 'fentanyl') },

        { sec: 'Cardiac / Resus' },
        // In an arrest adrenaline is not a pressor — it is what makes the next
        // two minutes of compressions worth doing, and it does none of that on
        // its own. You still have to be pushing on the chest.
        { id: 'epi',   label: DRUGS.epi.label,           note: DRUGS.epi.dose,           dot: 'r', run: p => give(p, 'epi') },
        { id: 'atro',  label: DRUGS.atropine.label,      note: DRUGS.atropine.dose,      dot: 'r', run: p => give(p, 'atropine') },
        { id: 'amio',  label: DRUGS.amiodarone.label,    note: DRUGS.amiodarone.dose,    dot: 'r', run: p => give(p, 'amiodarone') },
        { id: 'phen',  label: DRUGS.phenylephrine.label, note: DRUGS.phenylephrine.dose, dot: 'r', run: p => give(p, 'phenylephrine') },

        { sec: 'Adjuncts' },
        { id: 'txa',   label: DRUGS.txa.label,      note: DRUGS.txa.dose,      dot: 'b', run: p => give(p, 'txa') },
        { id: 'nalox', label: DRUGS.naloxone.label, note: 'reverses opioids',  dot: 'b', run: p => give(p, 'naloxone') },
        { id: 'carb',  label: DRUGS.caffeine.label, note: DRUGS.caffeine.dose, dot: 'b', run: p => give(p, 'caffeine') },
    ],

    airway: [
        { sec: 'Airway' },
        // Everything that goes in the mouth or over the face is a thing you do
        // to the head, and asks you to have selected it.
        {
            id: 'look', label: 'Check Airway', note: 'look, listen, feel',
            needsPart: true, showFor: onHead, dot: 'b', time: 3,
            run: p => {
                p.airwayChecked = true
                const found = OBSTRUCTION_LABEL[p.airway]
                return airwayOpen(p)
                    ? [`Airway checked — ${found.toLowerCase()}, air moving`, 'good']
                    : [`Airway checked — ${found.toUpperCase()}, NOT MOVING AIR`, 'bad']
            },
        },
        {
            id: 'tilt', label: 'Head Tilt / Chin Lift', note: 'hyper-extend',
            needsPart: true, showFor: onHead, dot: 'g', time: 3,
            run: p => {
                p.airwayChecked = true
                if (p.airway === 'none') return ['Airway is already clear', 'warn']
                // Exactly the manoeuvre for a tongue, and close to useless
                // against anything you would have to actually remove.
                const odds = p.airway === 'tongue' ? 0.82 : 0.18
                if (Math.random() < odds) {
                    p.airway = 'none'
                    return ['Head tilted, chin lifted — airway opens, air moving', 'good']
                }
                return ['Head tilted — still not moving air', 'bad']
            },
        },
        {
            id: 'turn', label: 'Turn Head & Finger Sweep', note: 'clear by hand',
            needsPart: true, dot: 'y', time: 4,
            showFor: (p, pt) => onHead(p, pt) && p.airway === 'vomit',
            run: p => {
                p.airwayChecked = true
                if (Math.random() < 0.55) {
                    p.airway = 'none'
                    return ['Head turned, mouth swept — airway clear', 'good']
                }
                return ['Swept — still obstructed, go again', 'bad']
            },
        },
        {
            id: 'suction', label: 'Manual Suction Pump', note: 'one use · always works',
            needsPart: true, dot: 'b', time: 5,
            showFor: (p, pt) => onHead(p, pt) && p.suction > 0 && p.airway !== 'none',
            run: p => {
                p.suction--
                p.airway = 'none'
                p.airwayChecked = true
                return ['Suctioned — airway clear · pump spent', 'good']
            },
        },
        {
            id: 'recov', label: 'Recovery Position', note: 'stays clear', dot: 'g', time: 5,
            showFor: p => !p.recovery && !p.cardiacArrest,
            run: p => {
                p.recovery = true
                p.airwayChecked = true
                return ['Casualty rolled — the airway will stay clear on its own', 'good']
            },
        },

        { sec: 'Adjuncts' },
        /*
           One in, one out. Each of these is a switch rather than a press,
           because a tube you have put in is a tube you can take out again —
           and only one can be in at a time, which the single `adjunct` field
           says better than three booleans ever would.

           Not into a mouth full of vomit, though: an NPA and a Guedel hold the
           tongue out of the way and do nothing whatever about what is already
           there. Clear it first. The King is exempt, because going past the
           problem is the entire reason to reach for one.
        */
        {
            id: 'npa', label: 'Nasopharyngeal Tube', needsPart: true, dot: 'g',
            labelFor: p => p.adjunct === 'npa' ? 'Remove Nasopharyngeal Tube' : 'Nasopharyngeal Tube',
            onFor: p => p.adjunct === 'npa',
            showFor: (p, pt) => onHead(p, pt) && (p.adjunct === 'npa' || p.airway !== 'vomit'),
            run: p => p.adjunct === 'npa' ? pullAdjunct(p) : siteAdjunct(p, 'npa'),
        },
        {
            id: 'opa', label: 'Guedel (OPA)', needsPart: true, dot: 'g',
            labelFor: p => p.adjunct === 'opa' ? 'Remove Guedel (OPA)' : 'Guedel (OPA)',
            onFor: p => p.adjunct === 'opa',
            showFor: (p, pt) => onHead(p, pt) && (p.adjunct === 'opa' || p.airway !== 'vomit'),
            run: p => p.adjunct === 'opa' ? pullAdjunct(p) : siteAdjunct(p, 'opa'),
        },
        {
            id: 'king', label: 'King LT Supraglottic', needsPart: true, dot: 'g', note: 'seals the airway',
            labelFor: p => p.adjunct === 'king' ? 'Remove King LT' : 'King LT Supraglottic',
            onFor: p => p.adjunct === 'king',
            showFor: onHead,
            run: p => p.adjunct === 'king' ? pullAdjunct(p) : siteAdjunct(p, 'king'),
        },

        { sec: 'Chest' },
        { id: 'decom', label: 'Needle Decompression', note: '14G · 2nd ICS MCL', needsPart: true, showFor: onChest, dot: 'r', run: p => {
            if (!p.pneumo) return ['Nothing to decompress — the chest is not tensioning', 'warn']
            p.pneumo = false
            p.spo2  = clamp(p.spo2 + 14, 0, 100)
            p.sysBp = clamp(p.sysBp + 16, 0, 200)
            p.rr    = clamp(p.rr - 6, 4, 46)
            // The needle lets the air out. It does not close the hole letting
            // it in, so an unsealed chest simply starts filling again.
            p.pneumoIn = p.sealed ? null : 45
            return [`Decompressed — rush of air${p.sealed ? '' : ' · seal the wound or it will tension again'}`,
                p.sealed ? 'good' : 'warn']
        } },
        {
            id: 'bvm', note: '12/min', needsPart: true, showFor: onHead, dot: 'g', time: 0,
            label: 'Start Bagging (BVM)',
            labelFor: p => p.bagging ? 'Stop Bagging (BVM)' : 'Start Bagging (BVM)',
            onFor: p => p.bagging,
            /*
               The answer to a casualty who is not breathing.

               A switch rather than a press, for the same reason compressions
               are: you do not bag somebody once. It moves air whether or not
               they are trying to, which is the only thing here that does — but
               only into an airway somebody has already opened.

               Unlike compressions it leaves you a hand. You can carry on
               working and everything takes twice as long, which is a choice
               worth having rather than a wall to stop at.
            */
            run: p => {
                if (p.bagging) { p.bagging = false; return ['Bagging stopped', 'warn'] }
                if (!airwayOpen(p)) return ['Bagging against an obstruction — nothing is going in', 'bad']
                p.bagging = true
                return ['Bagging at 12 per minute — chest rising', 'good']
            },
        },
        {
            id: 'oxy', note: '15 L NRB', needsPart: true, showFor: onHead, dot: 'g', time: 3,
            label: 'Oxygen Tank',
            labelFor: p => p.oxygen ? 'Oxygen Tank — turn off' : 'Oxygen Tank — turn on',
            onFor: p => p.oxygen,
            run: p => {
                p.oxygen = !p.oxygen
                if (!p.oxygen) return ['Oxygen off', 'warn']
                // A mask enriches what they are breathing. On somebody who is
                // not breathing it does very little, and very little is not
                // nothing — but it is not a substitute for the bag.
                return breathing(p)
                    ? ['O₂ at 15 L/min via non-rebreather', 'good']
                    : ['O₂ running — but nothing is moving it, get a bag on them', 'warn']
            },
        },
    ],

    advanced: [
        { sec: 'IV Access & Fluids' },
        {
            id: 'iv', label: 'IV Cannula 18G', needsPart: true, dot: 'b',
            // A vein you can reach and one the heart can reach: a cannula below
            // a tourniquet goes into a limb that is out of the circulation.
            showFor: (_p, pt) => !!pt && LIMBS.has(pt.id) && !pt.tourniquet && !pt.iv,
            run: (p, id) => {
                p.parts[id!].iv++
                return ['IV access established — ' + pName(id!), 'good']
            },
        },
        // The bags appear once there is somewhere to run them into, which is
        // what finally gives the cannula above a job.
        { id: 'blood',  label: 'Blood', note: 'O neg', dot: 'r', needsPart: true, showFor: hasLine, sizes: BAG_SIZES, run: (p, id, ml) => hang(p, 'blood', ml, id!) },
        { id: 'plasma', label: 'Plasma',      note: 'FFP',   dot: 'y', needsPart: true, showFor: hasLine, sizes: BAG_SIZES, run: (p, id, ml) => hang(p, 'plasma', ml, id!) },
        { id: 'saline', label: 'Saline 0.9%', note: 'crystalloid', dot: 'b', needsPart: true, showFor: hasLine, sizes: BAG_SIZES, run: (p, id, ml) => hang(p, 'saline', ml, id!) },

        { sec: 'Non-compressible Haemorrhage' },
        {
            id: 'reboa', label: 'REBOA — Inflate', note: 'zone I · femoral', dot: 'r',
            needsPart: true, time: 20,
            // Through a groin, for bleeding a tourniquet cannot reach. Offering
            // it for anything else would be offering it for the wrong reason.
            showFor: (p, pt) => !p.reboa && !!pt && (pt.id === 'legL' || pt.id === 'legR')
                && partBleeding(p.parts.torso) > 0,
            run: (p, id) => {
                p.reboa = { site: id!, up: 0 }
                p.sysBp = clamp(p.sysBp + 34, 0, 200)
                p.pain  = clamp(p.pain + 14, 0, 100)
                return [`REBOA inflated — ${pName(id!)} · everything below it is on the clock`, 'warn']
            },
        },
        {
            id: 'reboaDown', label: 'REBOA — Deflate', note: 'restores flow', dot: 'y', time: 8,
            showFor: p => !!p.reboa,
            run: p => {
                const up = p.reboa!.up
                p.reboa = null
                /*
                   Letting it down is its own event. Everything that has been
                   sitting without blood empties back into the circulation the
                   moment it flows again, and the longer it sat the worse that
                   is — which is why the balloon is a reason to hurry rather
                   than a reason to relax.
                */
                p.sysBp = clamp(p.sysBp - 30, 20, 200)
                p.spo2  = clamp(p.spo2 - (up > REBOA_WARN ? 8 : 3), 0, 100)
                if (up > REBOA_WARN && !p.cardiacArrest && Math.random() < 0.3) {
                    setRhythm(p, 'pea')
                    return ['REBOA down — reperfusion has arrested the casualty', 'bad']
                }
                return [up > REBOA_WARN
                    ? `REBOA down after ${Math.round(up)}s — reperfusion, pressure dropping`
                    : 'REBOA down — flow restored below the balloon', 'warn']
            },
        },

        { sec: 'Resuscitation' },
        {
            id: 'cpr', note: `${CPR_RATE}/min`, dot: 'r', time: 0, needsPart: true, showFor: onChest,
            label: 'Start Compressions',
            labelFor: p => p.cprActive ? 'Stop Compressions' : 'Start Compressions',
            onFor: p => p.cprActive,
            /*
               Instant, and then it keeps going.

               Compressions were a six-second action that resolved once and
               stopped, which is not what compressions are: you start them, you
               do not stop them, and everything else you do happens over the
               top. So the button is a switch and the sim does the pushing —
               which is also what lets you give the adrenaline and go back to
               it without the menu having to model your hands.
            */
            run: p => {
                if (!p.cardiacArrest) return ['CPR not indicated — pulse present', 'warn']
                if (p.cprActive) {
                    p.cprActive = false
                    p.hr = arrestHr(p.rhythm)
                    return ['Compressions stopped', 'warn']
                }
                p.cprActive = true
                // Both hands. Whatever else you were doing with them, you are
                // not doing it now.
                p.bagging = false
                if (p.recovery) {
                    // You cannot compress a chest that is facing the floor.
                    p.recovery = false
                    p.airwayChecked = false
                }
                return [`Compressions started — ${CPR_RATE} per minute`, 'good']
            },
        },
        // The pads go on the chest, so the chest is where the defibrillator is
        // — and it is nothing at all until they are on.
        {
            id: 'pads', label: 'Attach Defibrillator Pads', note: 'ant / lat',
            needsPart: true, dot: 'r', time: 6,
            showFor: (p, pt) => onChest(p, pt) && !p.padsOn,
            run: p => {
                p.padsOn = true
                return ['Pads sited — right anterior, left lateral', 'good']
            },
        },
        { id: 'analyse', label: 'Analyse Rhythm', note: 'stand clear', needsPart: true, sound: 'analyse', showFor: (p, pt) => onChest(p, pt) && p.padsOn, dot: 'r', run: p => {
            p.analysed = { rhythm: p.rhythm, advised: SHOCKABLE.has(p.rhythm) }
            const found = RHYTHM_LABEL[p.rhythm]
            return p.analysed.advised
                ? [`Analysis — ${found}. SHOCK ADVISED`, 'bad']
                : [`Analysis — ${found}. No shock advised`, 'warn']
        } },
        {
            id: 'shock', label: 'Deliver Shock', note: '200 J · no interlock',
            needsPart: true, showFor: (p, pt) => onChest(p, pt) && p.padsOn, dot: 'r', sound: 'charge',
            /*
               It will charge into anything.

               There is no interlock, and there should not be one: the analysis
               is how you find out whether this is a good idea, not a licence
               the machine issues. Skipping it and pressing the button anyway is
               a decision, and a decision has to be able to go badly or it was
               never one.
            */
            run: p => {
                const was = p.rhythm
                p.analysed = null
                const roll = Math.random()

                if (SHOCKABLE.has(was)) {
                    if (roll < 0.55) { rosc(p, was === 'vt' ? 78 : 70); return ['Shock delivered — sinus rhythm restored', 'good'] }
                    if (roll < 0.72) { setRhythm(p, 'asystole'); return ['Shock delivered — rhythm has gone to asystole', 'bad'] }
                    return ['Shock delivered — no change, resume compressions', 'bad']
                }

                if (was === 'asystole') {
                    return ['Shock delivered into asystole — there was nothing there to defibrillate', 'warn']
                }

                if (was === 'pea') {
                    // Organised complexes, no pulse. A shock does nothing for it
                    // and can flatten the little that was there.
                    if (roll < 0.18) { setRhythm(p, 'asystole'); return ['Shock into PEA — the rhythm has gone flat', 'bad'] }
                    return ['Shock into PEA — no effect. It was never shockable', 'warn']
                }

                /*
                   And this is the one. A heart that was beating, stopped by a
                   man who did not look first — R on T, and it is almost always
                   worse afterwards than it was before.
                */
                p.pain = clamp(p.pain + 22, 0, 100)
                if (roll < 0.45) { setRhythm(p, 'vf');       return ['SHOCKED A PERFUSING RHYTHM — casualty has gone into VF', 'bad'] }
                if (roll < 0.65) { setRhythm(p, 'asystole'); return ['SHOCKED A PERFUSING RHYTHM — the heart has stopped', 'bad'] }
                if (roll < 0.85) { setRhythm(p, 'vt');       return ['SHOCKED A PERFUSING RHYTHM — ventricular tachycardia', 'bad'] }
                return ['Shocked a perfusing rhythm and got away with it. Analyse first.', 'warn']
            },
        },
        { id: 'pak', label: 'Personal Aid Kit (PAK)', note: 'stabilise', dot: 'g', run: p => {
            // Everything open gets the right dressing for it, and every one of
            // them can still give way — a kit is a shortcut, not an exemption.
            let n = 0
            for (const pt of Object.values(p.parts)) {
                for (const w of pt.wounds) {
                    if (w.bandaged) continue
                    const b = bestBandage(w.t)
                    w.bandaged = true; w.dressing = b
                    w.failIn = Math.random() < reopenChance(w.t, b) ? dressingLife(w.t, b) : null
                    n++
                }
            }
            p.pain = clamp(p.pain - 25, 0, 100)
            return [`PAK used — ${n} wound(s) dressed · still need suturing`, 'good']
        } },
        { id: 'surg', label: 'Surgical Kit — Suture', needsPart: true, note: 'closes for good', dot: 'g',
            // Dressed first. You do not stitch something that is still filling
            // up, and it makes the order of the job the order of the menu.
            showFor: (_p, pt) => !!pt && pt.wounds.length > 0 && !isOpen(pt),
            run: (p, id) => {
                const pt = p.parts[id!]; const n = pt.wounds.length
                pt.wounds = []
                return [`Sutured ${n} wound(s) — ${pName(id!)} closed for good`, 'good']
            },
        },

        { sec: 'Environment' },
        { id: 'blanket', label: 'Emergency Blanket', dot: 'g', run: p => {
            p.temp = clamp(p.temp + 0.4, 30, 40)
            return ['Casualty wrapped — hypothermia prevention', 'good']
        } },
        { id: 'heat', label: 'Chemical Heat Pack', dot: 'g', run: p => {
            p.temp = clamp(p.temp + 0.3, 30, 40)
            return ['Heat packs sited — axilla & groin', 'good']
        } },
    ],

}

/* ---------- the tick ------------------------------------------------------ */

/**
 * One step of the sim: bleed out, let pain fade, arrest on severe volume loss.
 *
 * Mutates, like the treatments, and returns a line to log when something
 * changed on its own rather than because somebody did something.
 */
export function simulate(p: Patient, dt: number): [string, LogKind] | null {
    if (p.outcome !== 'active') return null

    /*
       What to say, if anything.

       At most one line comes out of a tick, and the later something is written
       here the more it mattered — the decisions at the bottom simply return and
       never reach this.
    */
    let event: [string, LogKind] | null = null

    /*
       Everything the balloon is upstream of, held back.

       Subtracted from the total rather than folded into `totalBleed`, for the
       same reason a tourniqueted limb keeps its colour: the wounds under it are
       exactly as open as they were, and the moment it comes down they will
       prove it.
    */
    const bleed = Math.max(0, totalBleed(p) - (p.reboa ? bleedBelowBalloon(p) * REBOA_OCCLUSION : 0))
    if (bleed > 0) {
        /*
           A stopped heart is not pushing anything out of the wound. It still
           seeps — pressure and gravity do not need a pulse — but nowhere near
           the rate it did, which is why a casualty in arrest can be worked on
           for minutes without emptying.
        */
        const rate = (p.cardiacArrest ? 0.38 : 1) * bleedFactor(p)
        p.blood = clamp(p.blood - bleed * dt * 0.12 * rate, 0, 100)
        if (!p.cardiacArrest) {
            // Compensatory tachycardia only ever adds. The floor of 40 this
            // used to carry was quietly topping the rate back up under a drug
            // that had lowered it, which is the same disagreement in miniature.
            p.hr    = clamp(p.hr + bleed * dt * 0.05, 0, 200)
            p.sysBp = clamp(p.sysBp - bleed * dt * 0.05, 30, 190)
        }
    }
    p.pain = clamp(p.pain - dt * 0.25, 0, 100)
    // Dressings giving way. A wound that reopens is one you have to find
    // again, which is the whole argument for suturing before you move on.
    let reopened = 0
    for (const pt of Object.values(p.parts)) {
        for (const w of pt.wounds) {
            if (!w.bandaged || w.failIn === null) continue
            w.failIn -= dt
            if (w.failIn > 0) continue
            w.bandaged = false; w.dressing = null; w.failIn = null
            reopened++
        }
    }

    /*
       Air, or the lack of it.

       A blocked airway kills over about four minutes, not forty seconds. That
       is long enough to be somewhere else when it starts and still get back —
       which is the situation worth practising. The warning at 80% lands after
       roughly a minute and a half and the alarm at 70% after two, so most of
       the run is spent being told about it.

       Coming back is quicker than going down, as it is in a real chest: open
       the airway and the numbers climb while you get on with something else.
    */
    // Respiratory effort gives out when they have been hypoxic long enough,
    // and comes back when they are not any more. Two thresholds, so a casualty
    // sitting on the line is not starting and stopping four times a second.
    if (p.spontaneous && p.spo2 <= APNOEA_AT) {
        p.spontaneous = false
        event = ['Casualty has stopped breathing — get a bag on them', 'bad']
    } else if (!p.spontaneous && p.spo2 >= APNOEA_OUT && p.rr > DEPRESSED_RR + 2) {
        p.spontaneous = true
        event = ['Casualty is breathing on their own again', 'good']
    }

    const open = airwayOpen(p)
    const vent = ventilating(p)
    if (!vent) {
        // Oxygen sitting on the face of somebody who is not moving any still
        // buys a little — it diffuses — and a little is all it buys.
        p.spo2 = clamp(p.spo2 - dt * (open && p.oxygen ? 0.13 : 0.2), 0, 100)
        // Trying and failing looks like effort. Not trying at all looks like
        // nothing, which is the reading that should frighten you.
        p.rr = breathing(p) ? clamp(p.rr + dt * 0.35, 0, 46) : 0
    } else if (!breathing(p)) {
        // Somebody else's hands doing the work.
        const ceiling = p.oxygen ? 99 : 96
        if (p.spo2 < ceiling) p.spo2 = clamp(p.spo2 + dt * (p.oxygen ? 0.7 : 0.5), 0, ceiling)
        p.rr = 12
    } else if (!p.pneumo) {
        const ceiling = p.oxygen ? 99 : 97
        if (p.spo2 < ceiling) p.spo2 = clamp(p.spo2 + dt * (p.oxygen ? 0.9 : 0.5), 0, ceiling)
    }

    // A chest filling with air that cannot get out.
    if (p.pneumoIn !== null && !p.pneumo) {
        p.pneumoIn -= dt
        if (p.pneumoIn <= 0) {
            p.pneumo = true
            p.pneumoIn = null
            p.spo2  = clamp(p.spo2 - 12, 0, 100)
            p.sysBp = clamp(p.sysBp - 20, 20, 200)
            return ['TENSION PNEUMOTHORAX — decompress the chest', 'bad']
        }
    }
    if (p.pneumo) {
        // Slightly slower than a shut airway, and on the same order: minutes.
        p.spo2  = clamp(p.spo2 - dt * 0.16, 0, 100)
        p.sysBp = clamp(p.sysBp - dt * 0.3, 20, 200)
        p.rr    = clamp(p.rr + dt * 0.2, 0, 46)
    }

    if (p.spo2 <= FATAL_SPO2) {
        kill(p, open ? 'Hypoxia' : 'Hypoxia — the airway was never opened')
        return ['CASUALTY HAS DIED OF HYPOXIA — no air was moving', 'bad']
    }

    if (p.reboa) {
        p.reboa.up += dt
        // Above the balloon the pressure is excellent. That is not the same
        // thing as a casualty doing well, and it is worth being suspicious of.
        p.sysBp = clamp(p.sysBp + dt * 1.6, 0, 200)
        if (p.reboa.up >= REBOA_FATAL) {
            kill(p, `Ischaemia — the balloon was up for ${Math.round(p.reboa.up)}s`)
            return ['BALLOON UP TOO LONG — casualty declared dead', 'bad']
        }
        if (p.reboa.up > REBOA_WARN) {
            // Nothing below it is getting blood, and it is starting to show.
            p.pain = clamp(p.pain + dt * 0.9, 0, 100)
            p.spo2 = clamp(p.spo2 - dt * 0.06, 0, 100)
        }
    }

    event = metabolise(p, dt) ?? event
    if (p.wake > 0) p.wake = Math.max(0, p.wake - dt)

    // Enough opioid and they stop trying to breathe. Naloxone is the way back;
    // a bag is the way through while it works.
    if (p.spontaneous && !p.cardiacArrest && p.rr <= DEPRESSED_RR) {
        p.spontaneous = false
        event = ['Respiratory depression — casualty has stopped breathing', 'bad']
    }

    /*
       A heart that has just restarted, working its way back up.

       It only ever pushes upwards. `Math.min(target, hr + step)` looked
       harmless and was not: adrenaline on board puts the rate above the target
       within seconds, the min clamped it back down to the target, and the drug
       ledger — which had no idea its contribution had just been thrown away —
       subtracted it again when the dose wore off. Which is why a casualty you
       got back with an ampoule and some compressions would crash into arrest
       two minutes later for no reason you could see.
    */
    if (p.hrTarget !== null) {
        if (p.hr < p.hrTarget) p.hr = Math.min(p.hrTarget, p.hr + dt * 2.2)
        else p.hrTarget = null
    }

    // Whatever is hanging, running in. Announced only when a bag empties —
    // a line quietly working is not news, a line that has stopped is.
    if (p.infusions.length) {
        const emptied: string[] = []
        for (const inf of p.infusions) {
            const f = FLUIDS[inf.fluid]
            const ml = Math.min(inf.left, f.rate * dt)
            inf.left -= ml
            // As a fraction of this casualty's own tank, which is why the same
            // bag goes further into a smaller man.
            const frac = ml / p.volume
            const gained = frac * 100 * f.retention
            p.blood = clamp(p.blood + gained, 0, 100)
            p.sysBp = clamp(p.sysBp + gained, 0, 200)
            p.diaBp = clamp(p.diaBp + gained * 0.6, 0, 140)
            // Volume is not blood. Crystalloid fills the pipes and carries
            // nothing, so the pressure you are pleased with is bought against
            // the saturation you are about to be unhappy about.
            if (f.dilute) p.spo2 = clamp(p.spo2 - frac * f.dilute, 0, 100)
            if (inf.left <= 0.001) emptied.push(`${f.label} ${inf.volume} ml`)
        }
        p.infusions = p.infusions.filter(i => i.left > 0.001)
        if (emptied.length) event = [`${emptied.join(', ')} — bag empty, line run through`, 'warn']
    }
    if (reopened) {
        event = [`${reopened} dressing${reopened === 1 ? ' has' : 's have'} given way — bleeding again`, 'bad']
    }

    if (p.cprActive && p.cardiacArrest) {
        // The rate on the monitor is your hands, not their heart.
        p.hr = clamp(jitter(CPR_RATE, 7), 96, 136)

        /*
           What compressions are actually for.

           Chances are per second and scaled by the tick, so the odds are the
           same however often the sim runs. Epinephrine multiplies all of them
           — that is the entire point of giving it, and the reason it is worth
           interrupting compressions for the ten seconds it costs.
        */
        // Compressions on their own almost never restart a heart, and that is
        // the honest number: they keep a brain alive long enough for something
        // else to. Adrenaline is that something else, and this is the size of
        // the difference it makes.
        const boost = onBoard(p, 'epi') ? 4.5 : 1
        const rolled = (perSecond: number) => Math.random() < perSecond * dt * boost

        if (p.rhythm === 'pea' && rolled(0.005)) {
            rosc(p, 66)
            return ['ROSC — output restored, rate coming back up', 'good']
        }
        if (p.rhythm === 'asystole' && rolled(0.0022)) {
            setRhythm(p, 'vf')
            p.cprActive = true
            return ['Rhythm change — coarse VF, shockable', 'warn']
        }
        if ((p.rhythm === 'vf' || p.rhythm === 'vt') && rolled(0.0012)) {
            rosc(p, 62)
            return ['ROSC — output restored on compressions alone', 'good']
        }
    }

    // Everything below decides the casualty, and outranks a bag running out.
    if (p.blood <= 0) {
        kill(p, 'Exsanguination — no circulating volume left')
        return ['CASUALTY HAS BLED OUT — declared dead', 'bad']
    }

    if (p.cardiacArrest) {
        p.downtime += dt * (p.cprActive ? CPR_DOWNTIME_RATE : 1)
        if (p.downtime >= DEATH_DOWNTIME) {
            kill(p, 'Five minutes without an output')
            return ['DOWNTIME EXCEEDED — casualty declared dead', 'bad']
        }
    }

    /*
       A rate that low is not a rate.

       Enough of something that slows the heart and it stops being one, which
       is both the honest end of that road and a floor under the number: there
       is no state in which a casualty is walking around at four beats a minute
       waiting for the drug to wear off.
    */
    if (!p.cardiacArrest && !p.cprActive && p.hr < 20) {
        setRhythm(p, 'pea')
        return ['CASUALTY IN CARDIAC ARREST — PEA, profound bradycardia', 'bad']
    }

    if (p.blood < 22 && !p.cardiacArrest) {
        // Bleeding out arrests as PEA — the heart is still trying, there is
        // simply nothing left in it to pump. Notably not shockable, which is
        // the lesson: the treatment for this is the haemorrhage, not the pads.
        setRhythm(p, 'pea')
        return ['CASUALTY IN CARDIAC ARREST — PEA, hypovolaemic', 'bad']
    }

    if (stabilityIssues(p).length === 0) {
        p.outcome = 'stable'
        return ['CASUALTY STABLE — ready for transport', 'good']
    }

    // Going under and coming round are things that happen to them rather than
    // things you do, so this is the sim's call and it outranks a bag emptying.
    const awake = isConscious(p)
    if (awake !== p.conscious) {
        p.conscious = awake
        if (awake) {
            // They hold their own airway again the moment they are back — and
            // nobody conscious stays where you put them. They roll off their
            // side themselves, which also takes away the thing that was
            // keeping the airway open for them.
            if (p.airway === 'tongue') p.airway = 'none'
            p.recovery = false
            event = ['Casualty is coming round', 'good']
        } else {
            event = [collapse(p), 'bad']
        }
    } else if (!p.conscious && !p.recovery && p.adjunct !== 'king' && p.airway !== 'vomit'
        && Math.random() < 0.008 * dt) {
        // Still under, and it can still happen. Rare per tick, near-certain
        // over the minutes an unprotected airway is left alone.
        p.airway = 'vomit'
        p.airwayChecked = false
        event = ['Casualty is vomiting — airway obstructed', 'bad']
    }

    return event
}

/**
 * What happens the moment they go under.
 *
 * The tongue goes back — that is what unconsciousness *is*, mechanically — and
 * often enough the stomach comes up with it. Both of them silently, unless you
 * happen to be looking, which is why the airway reads unknown again afterwards.
 */
function collapse(p: Patient): string {
    p.airwayChecked = false
    if (p.recovery || p.adjunct === 'king') return 'Casualty has lost consciousness'

    if (p.airway === 'none' && Math.random() < VOMIT_ON_COLLAPSE) {
        p.airway = 'vomit'
        return 'Casualty has vomited — airway obstructed'
    }
    if (p.airway === 'none') p.airway = 'tongue'
    return 'Casualty has lost consciousness'
}

function kill(p: Patient, cause: string) {
    /*
       Asystole, explicitly.

       Leaving the rhythm they died in on the screen is what had the monitor
       beeping over a corpse and — for anyone who arrested first — sounding the
       red alarm across the top of it. A stopped heart is a flat trace, the
       flatline tone, and no QRS beep, and every one of those falls out of the
       rhythm rather than needing the monitor to know what `outcome` means.
    */
    setRhythm(p, 'asystole')
    p.bagging = false
    p.oxygen = false
    p.sysBp = 0
    p.diaBp = 0
    p.spo2 = 0
    p.outcome = 'dead'
    p.cause = cause
}

/** What the monitor should be making a noise about. */
export function alarmFor(p: Patient): 'none' | 'urgent' | 'flatline' {
    // An alarm is the monitor's, and a monitor nobody attached has nothing to
    // alarm about.
    if (!p.monitorOn) return 'none'
    if (p.rhythm === 'asystole') return 'flatline'
    if (p.cardiacArrest) return 'urgent'
    // Desaturating. The closer to fatal, the less this is a background noise.
    if (p.spo2 <= 70) return 'urgent'
    return 'none'
}

