import {
    RHYTHM_LABEL, SHOCKABLE, clamp, jitter, pName, setRhythm, totalBleed,
    type Patient, type PartId, type Rhythm,
} from './model'

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
    | 'airway' | 'advanced' | 'splint' | 'drag' | 'transfer'

export const TOOLS: { id: ToolId, label: string }[] = [
    { id: 'triage',     label: 'Triage Card' },
    { id: 'examine',    label: 'Examine' },
    { id: 'bandage',    label: 'Bandages' },
    { id: 'medication', label: 'Medication' },
    { id: 'airway',     label: 'Airway & Chest' },
    { id: 'advanced',   label: 'Advanced Treatment' },
    { id: 'splint',     label: 'Splints & Fractures' },
    { id: 'drag',       label: 'Drag / Carry' },
    { id: 'transfer',   label: 'Handover / Transfer' },
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
    airway: 4, advanced: 6, splint: 6, drag: 4, transfer: 3,
}

const ACTION_TIME: Record<string, number> = {
    full: 8, bt: 4,
    packing: 4, quik: 4, tq: 5, tqoff: 3, seal: 5,
    decom: 5, bvm: 2, oxy: 3,
    iv: 5, blood500: 9, plasma: 8, saline: 8, cpr: 6, analyse: 6, shock: 4, pak: 10, surg: 15,
    realign: 4, sling: 4, blanket: 3, heat: 3,
    stretch: 6, veh: 6, bag: 8,
    medevac: 4, handover: 5,
}

/** Seconds this action takes, however it was specified. */
export function actionTime(tool: ToolId, a: Action): number {
    return a.time ?? ACTION_TIME[a.id] ?? TOOL_TIME[tool]
}

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
    /** A cue for the UI to play — the defibrillator is the only thing with one. */
    sound?: 'charge' | 'shock'
    run: (p: Patient, partId: PartId | null) => [string, LogKind]
    sec?: undefined
}

export type ActionRow = Action | ActionSection

/* ---------- shared treatment effects -------------------------------------- */

/** Return of spontaneous circulation: a rhythm, and the vitals to go with it. */
function rosc(p: Patient, hr: number) {
    setRhythm(p, 'sinus')
    p.hr = hr
    p.sysBp = clamp(Math.max(p.sysBp, 92), 0, 200)
    p.diaBp = clamp(Math.max(p.diaBp, 54), 0, 140)
    p.spo2 = clamp(Math.max(p.spo2, 88), 0, 100)
    p.cprActive = false
}

function bandage(p: Patient, id: PartId, kind: string, power: number): [string, LogKind] {
    const pt = p.parts[id]
    const open = pt.wounds.filter(w => !w.bandaged)
    if (!open.length) return ['No open wounds on the ' + pName(id), 'warn']
    let left = power
    for (const w of open) { if (left <= 0) break; w.bandaged = true; left-- }
    const done = power - Math.max(0, left)
    p.pain = clamp(p.pain - 4, 0, 100)
    return [`${kind} applied — ${pName(id)} · ${Math.min(done, open.length)} wound(s) dressed`, 'good']
}

function med(p: Patient, name: string, eff: Partial<Record<keyof Patient, number>>): [string, LogKind] {
    // Three doses is the ceiling. Refusing is the safety behaviour worth having.
    if (p.meds.filter(m => m === name).length >= 3) return [name + ' — max dose reached, refused', 'bad']
    p.meds.push(name)
    for (const k in eff) {
        const key = k as 'pain' | 'hr' | 'sysBp' | 'diaBp' | 'rr' | 'spo2'
        p[key] = clamp(p[key] + (eff[key] ?? 0), 0, key === 'pain' ? 100 : 250)
    }
    return [`${name} administered`, 'good']
}

function fluid(p: Patient, name: string, gain: number): [string, LogKind] {
    p.blood = clamp(p.blood + gain, 0, 100)
    p.sysBp = clamp(p.sysBp + gain, 0, 200)
    p.diaBp = clamp(p.diaBp + Math.round(gain * 0.6), 0, 140)
    return [`${name} transfused — volume ${Math.round(p.blood)}%`, 'good']
}

function airway(p: Patient, kind: string): [string, LogKind] {
    if (p.airway === kind) return [kind + ' already sited', 'warn']
    p.airway = kind
    p.spo2 = clamp(p.spo2 + 4, 0, 100)
    return [kind + ' inserted — airway patent', 'good']
}

/* ---------- the tables ---------------------------------------------------- */

export const ACTIONS: Record<Exclude<ToolId, 'triage'>, ActionRow[]> = {
    examine: [
        { sec: 'Diagnostics' },
        { id: 'pulse', label: 'Check Pulse', note: 'Stethoscope', dot: 'b', run: p => {
            const v = p.cardiacArrest ? 'no pulse detected' : `${jitter(p.hr, 3)} bpm`
            return ['Checked pulse — ' + v, p.cardiacArrest ? 'bad' : '']
        } },
        { id: 'bp', label: 'Check Blood Pressure', note: 'BP Cuff', dot: 'b', run: p => {
            const bp = p.cardiacArrest ? '0/0' : `${jitter(p.sysBp, 4)}/${jitter(p.diaBp, 3)}`
            return ['Blood pressure — ' + bp + ' mmHg', p.sysBp < 100 ? 'warn' : '']
        } },
        { id: 'spo2', label: 'Check SpO₂ / Perfusion', note: 'Pulse Oximeter', dot: 'b', run: p =>
            [`SpO₂ — ${jitter(p.spo2, 1)}% · cap refill ${p.blood < 70 ? '>3s' : '<2s'}`, p.spo2 < 95 ? 'warn' : ''] },
        { id: 'resp', label: 'Check Response', note: 'AVPU', dot: 'b', run: p =>
            [`Response — ${p.cardiacArrest ? 'UNRESPONSIVE' : p.pain > 70 ? 'responds to voice, agitated' : 'alert & oriented'}`,
                p.cardiacArrest ? 'bad' : ''] },

        { sec: 'Survey' },
        { id: 'part', label: 'Examine Selected Limb', needsPart: true, dot: 'g', run: (p, id) => {
            const pt = p.parts[id!]; pt.checked = true
            const w = pt.wounds.reduce((a, b) => a + b.n, 0)
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
    ],

    bandage: [
        { sec: 'Dressings' },
        { id: 'field',   label: 'Field Dressing',   needsPart: true, dot: 'g', run: (p, id) => bandage(p, id!, 'Field Dressing', 1) },
        { id: 'elastic', label: 'Elastic Bandage',  needsPart: true, dot: 'g', run: (p, id) => bandage(p, id!, 'Elastic Bandage', 1) },
        { id: 'packing', label: 'Packing Bandage',  needsPart: true, dot: 'g', run: (p, id) => bandage(p, id!, 'Packing Bandage', 2) },
        { id: 'quik',    label: 'QuikClot',         needsPart: true, dot: 'g', run: (p, id) => bandage(p, id!, 'QuikClot', 3) },

        { sec: 'Haemorrhage Control' },
        { id: 'tq', label: 'Apply Tourniquet (CAT)', needsPart: true, dot: 'r', run: (p, id) => {
            const pt = p.parts[id!]
            if (id === 'head' || id === 'torso') return ['Cannot apply a tourniquet to the ' + pName(id), 'bad']
            if (pt.tourniquet) return ['Tourniquet already in place on ' + pName(id!), 'warn']
            pt.tourniquet = true; p.tqCount++; p.pain = clamp(p.pain + 12, 0, 100)
            return ['Tourniquet applied — ' + pName(id!) + ' · time noted', 'warn']
        } },
        { id: 'tqoff', label: 'Remove Tourniquet', needsPart: true, dot: 'y', run: (p, id) => {
            const pt = p.parts[id!]
            if (!pt.tourniquet) return ['No tourniquet on ' + pName(id!), 'warn']
            pt.tourniquet = false; p.tqCount = Math.max(0, p.tqCount - 1)
            return ['Tourniquet released — ' + pName(id!), '']
        } },
        { id: 'seal', label: 'Chest Seal (Vented)', dot: 'g', run: () =>
            ['Chest seal applied — occlusive dressing sited', 'good'] },
    ],

    medication: [
        { sec: 'Analgesia' },
        { id: 'morph', label: 'Morphine',          note: '10 mg IV', dot: 'y', run: p => med(p, 'Morphine',   { pain: -45, hr: -8, rr: -3 }) },
        { id: 'nalb',  label: 'Nalbuphine',        note: '10 mg IM', dot: 'y', run: p => med(p, 'Nalbuphine', { pain: -32, hr: -4 }) },
        { id: 'fent',  label: 'Fentanyl Lozenge',  note: '800 µg',   dot: 'y', run: p => med(p, 'Fentanyl',   { pain: -38, rr: -2 }) },

        { sec: 'Cardiac / Resus' },
        { id: 'epi', label: 'Epinephrine', note: '1 mg', dot: 'r', run: p => {
            const out = med(p, 'Epinephrine', p.cardiacArrest ? {} : { hr: +22, sysBp: +18, diaBp: +8 })
            // In an arrest it is not a pressor, it is a coin flip on coarsening
            // asystole into something the defibrillator can work with.
            if (out[1] === 'good' && p.rhythm === 'asystole' && Math.random() < 0.35) {
                setRhythm(p, 'vf')
                return ['Epinephrine administered — rhythm coarsened to VF', 'warn']
            }
            return out
        } },
        { id: 'atro',  label: 'Atropine',      note: '0.5 mg', dot: 'r', run: p => med(p, 'Atropine',      { hr: +16 }) },
        { id: 'amio',  label: 'Amiodarone',    note: '300 mg', dot: 'r', run: p => med(p, 'Amiodarone',    { hr: -14 }) },
        { id: 'phen',  label: 'Phenylephrine', note: '100 µg', dot: 'r', run: p => med(p, 'Phenylephrine', { sysBp: +14, diaBp: +9, hr: -6 }) },

        { sec: 'Adjuncts' },
        { id: 'txa',   label: 'TXA',          note: '1 g slow IV', dot: 'b', run: p => med(p, 'TXA', {}) },
        { id: 'nalox', label: 'Naloxone',     note: '0.4 mg',      dot: 'b', run: p => med(p, 'Naloxone', { rr: +5, pain: +18 }) },
        { id: 'carb',  label: 'Caffeine Gum', note: 'morale',      dot: 'b', run: p => med(p, 'Caffeine Gum', { hr: +4 }) },
    ],

    airway: [
        { sec: 'Airway' },
        { id: 'npa',   label: 'Nasopharyngeal Tube',   dot: 'g', run: p => airway(p, 'NPA') },
        { id: 'opa',   label: 'Guedel (OPA)',          dot: 'g', run: p => airway(p, 'OPA') },
        { id: 'king',  label: 'King LT Supraglottic',  dot: 'g', run: p => airway(p, 'King LT') },
        { id: 'recov', label: 'Recovery Position',     dot: 'g', run: () => ['Casualty placed in recovery position', 'good'] },

        { sec: 'Chest' },
        { id: 'decom', label: 'Chest Decompression', note: '14G needle', dot: 'r', run: p => {
            p.spo2 = clamp(p.spo2 + 7, 0, 100); p.rr = clamp(p.rr - 4, 4, 40)
            return ['Needle decompression — 2nd ICS MCL · rush of air', 'good']
        } },
        { id: 'bvm', label: 'Bag-Valve Mask', note: '12/min', dot: 'g', run: p => {
            p.spo2 = clamp(p.spo2 + 5, 0, 100)
            return ['Ventilating with BVM — 12/min', 'good']
        } },
        { id: 'oxy', label: 'Oxygen Tank', note: '15 L NRB', dot: 'g', run: p => {
            p.spo2 = clamp(p.spo2 + 6, 0, 100)
            return ['O₂ via non-rebreather at 15 L/min', 'good']
        } },
    ],

    advanced: [
        { sec: 'IV Access & Fluids' },
        { id: 'iv', label: 'IV Cannula 18G', needsPart: true, dot: 'b', run: (p, id) => {
            p.parts[id!].iv++
            return ['IV access established — ' + pName(id!), 'good']
        } },
        { id: 'blood500', label: 'Whole Blood 500 ml',  dot: 'r', run: p => fluid(p, 'Whole Blood 500 ml', 9) },
        { id: 'plasma',   label: 'Plasma 500 ml',       dot: 'y', run: p => fluid(p, 'Plasma 500 ml', 6) },
        { id: 'saline',   label: 'Saline 0.9% 1000 ml', dot: 'b', run: p => fluid(p, 'Saline 1000 ml', 4) },

        { sec: 'Resuscitation' },
        { id: 'cpr', label: 'Perform CPR', note: '30:2', dot: 'r', run: p => {
            if (!p.cardiacArrest) return ['CPR not indicated — pulse present', 'warn']
            p.cprActive = true
            // Compressions are perfusion, not a cure. They buy time, they can
            // coarsen a fibrillating heart back into something worth shocking,
            // and just occasionally they get an output back on their own.
            const roll = Math.random()
            if (p.rhythm === 'pea' && roll < 0.3) { rosc(p, 62); return ['ROSC — output restored after CPR', 'good'] }
            if (p.rhythm === 'asystole' && roll < 0.12) { setRhythm(p, 'vf'); p.cprActive = true; return ['Rhythm change — coarse VF on the monitor', 'warn'] }
            if (p.rhythm === 'vf' && roll < 0.08) { rosc(p, 58); return ['ROSC — output restored after CPR', 'good'] }
            return ['CPR in progress — no ROSC, continuing compressions', 'bad']
        } },
        { id: 'analyse', label: 'Analyse Rhythm', note: 'stand clear', dot: 'r', run: p => {
            p.analysed = { rhythm: p.rhythm, advised: SHOCKABLE.has(p.rhythm) }
            const found = RHYTHM_LABEL[p.rhythm]
            return p.analysed.advised
                ? [`Analysis — ${found}. SHOCK ADVISED`, 'bad']
                : [`Analysis — ${found}. No shock advised`, 'warn']
        } },
        { id: 'shock', label: 'Deliver Shock', note: '200 J', dot: 'r', sound: 'charge', run: p => {
            // The analysis is the interlock, and it is keyed to the rhythm it
            // was taken from: a heart that has moved since is a heart the
            // reading no longer describes.
            if (!p.analysed) return ['Defibrillator will not charge — analyse the rhythm first', 'warn']
            if (p.analysed.rhythm !== p.rhythm) return ['Rhythm has changed since analysis — re-analyse', 'warn']
            if (!p.analysed.advised) return ['Defibrillator will not charge — no shockable rhythm', 'warn']

            p.analysed = null
            const roll = Math.random()
            if (roll < 0.55) { rosc(p, p.rhythm === 'vt' ? 78 : 70); return ['Shock delivered — sinus rhythm restored', 'good'] }
            if (roll < 0.72) { setRhythm(p, 'asystole'); return ['Shock delivered — rhythm has gone to asystole', 'bad'] }
            return ['Shock delivered — no change, resume compressions', 'bad']
        } },
        { id: 'pak', label: 'Personal Aid Kit (PAK)', note: 'stabilise', dot: 'g', run: p => {
            Object.values(p.parts).forEach(pt => pt.wounds.forEach(w => { w.bandaged = true }))
            p.pain = clamp(p.pain - 25, 0, 100)
            return ['PAK used — all wounds dressed, casualty stabilised', 'good']
        } },
        { id: 'surg', label: 'Surgical Kit — Stitch', needsPart: true, note: '~15s', dot: 'g', run: (p, id) => {
            const pt = p.parts[id!]; const n = pt.wounds.length
            if (!n) return ['No wounds to suture on ' + pName(id!), 'warn']
            pt.wounds = []
            return [`Sutured ${n} wound site(s) — ${pName(id!)}`, 'good']
        } },
    ],

    splint: [
        { sec: 'Fractures' },
        { id: 'splint', label: 'Apply Splint', needsPart: true, dot: 'g', run: (p, id) => {
            const pt = p.parts[id!]
            if (!pt.fractured) return ['No fracture detected in the ' + pName(id!), 'warn']
            if (pt.splinted) return [pName(id!) + ' is already splinted', 'warn']
            pt.splinted = true; p.pain = clamp(p.pain - 10, 0, 100)
            return ['Splint applied — ' + pName(id!) + ' immobilised', 'good']
        } },
        { id: 'realign', label: 'Realign Limb', needsPart: true, note: 'painful', dot: 'y', run: (p, id) => {
            const pt = p.parts[id!]
            if (!pt.fractured) return ['Nothing to realign — ' + pName(id!), 'warn']
            p.pain = clamp(p.pain + 20, 0, 100)
            return ['Limb realigned — ' + pName(id!) + ' · casualty screaming', 'warn']
        } },
        { id: 'sling', label: 'Improvised Sling', needsPart: true, dot: 'g', run: (p, id) =>
            (id === 'armL' || id === 'armR')
                ? ['Sling applied — ' + pName(id) + ' supported', 'good']
                : ['A sling will not help the ' + pName(id!), 'warn'] },

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

    drag: [
        { sec: 'Movement' },
        { id: 'drag',    label: 'Drag Casualty',      dot: 'y', run: () => ['Dragging casualty to cover', ''] },
        { id: 'carry',   label: 'Fireman Carry',      dot: 'y', run: () => ['Casualty lifted — fireman carry', ''] },
        { id: 'stretch', label: 'Load onto Stretcher', dot: 'g', run: () => ['Casualty secured to stretcher', 'good'] },
        { id: 'veh',     label: 'Load into Vehicle',   dot: 'g', run: () => ['Casualty loaded — 9-line pending', 'good'] },

        { sec: 'Final' },
        { id: 'bag', label: 'Place in Body Bag', dot: 'r', run: p => {
            if (p.triage !== 'deceased') return ['Casualty is not confirmed deceased', 'warn']
            return ['Remains bagged and tagged — KIA', 'bad']
        } },
    ],

    transfer: [
        { sec: 'Handover' },
        { id: 'medevac',  label: 'Request MEDEVAC (9-Line)', dot: 'r', run: () => ['9-Line transmitted — ETA 6 min, LZ CHARLIE', 'good'] },
        { id: 'casrep',   label: 'Send CASREP',              dot: 'y', run: () => ['CASREP sent to HQ NET', ''] },
        { id: 'handover', label: 'Handover to Role 1',       dot: 'g', run: () => ['Handover given — MIST report passed', 'good'] },

        { sec: 'Command' },
        { id: 'swap', label: 'Transfer Patient to Another Medic', dot: 'b', run: () => ['Patient care transferred to DOC-2', ''] },
        { id: 'stabilise', label: 'Mark as Stable for Transport', dot: 'g', run: p => {
            const ok = p.blood > 70 && !p.cardiacArrest
            return [ok ? 'Casualty marked STABLE for transport' : 'Refused — casualty is not stable enough', ok ? 'good' : 'bad']
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
    const bleed = totalBleed(p)
    if (bleed > 0 && !p.cardiacArrest) {
        p.blood = clamp(p.blood - bleed * dt * 0.12, 0, 100)
        p.hr    = clamp(p.hr + bleed * dt * 0.05, 40, 190)
        p.sysBp = clamp(p.sysBp - bleed * dt * 0.05, 30, 190)
    }
    p.pain = clamp(p.pain - dt * 0.25, 0, 100)

    if (p.blood < 22 && !p.cardiacArrest) {
        // Bleeding out arrests as PEA — the heart is still trying, there is
        // simply nothing left in it to pump. Notably not shockable, which is
        // the lesson: the treatment for this is the haemorrhage, not the pads.
        setRhythm(p, 'pea')
        return ['CASUALTY IN CARDIAC ARREST — PEA, hypovolaemic', 'bad']
    }
    return null
}

/** What the monitor should be making a noise about. */
export function alarmFor(p: Patient): 'none' | 'urgent' | 'flatline' {
    if (p.rhythm === 'asystole') return 'flatline'
    if (p.cardiacArrest) return 'urgent'
    return 'none'
}

