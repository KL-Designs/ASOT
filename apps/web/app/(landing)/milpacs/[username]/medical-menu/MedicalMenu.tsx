'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    ACTIONS, TOOLS, TOOL_SEPS, actionTime, alarmFor, simulate, visibleRows,
    type Action, type ActionRow, type LogKind, type ToolId,
} from './actions'
import { Monitor } from './audio'
import {
    ADJUNCT_LABEL, BANDAGES, CPR_RATE, DEATH_DOWNTIME, DIFFICULTIES, FALLBACK_CASUALTY, FATAL_SPO2, FLUIDS,
    OBSTRUCTION_LABEL, PARTS, RHYTHM_LABEL, WOUND_TYPES,
    airwayOpen, bestBandage, bleedFactor, bloodWord, breathing, chatter, clamp, handover, jitter, newPatient,
    nextWound, painWord, partBleeding, partSeverity, pName,
    stabilityIssues, stampFrom, totalBleed,
    type Casualty, type Difficulty, type PartId, type Patient, type Rhythm, type Triage,
} from './model'
import { TOOL_ICONS } from './icons'
import s from './medical-menu.module.css'

/* ============================================================================
   HZN-MED — the medical menu.

   A parody of the ARMA 3 ACE + KAT interface for practising treatment: pick a
   limb off the body diagram, work the toolbar, watch the vitals answer. The
   casualty bleeds in real time and will arrest if you leave them to it.

   The patient is held as ordinary React state and every treatment runs against
   a `structuredClone` of it. That is what lets the action table in ./actions.ts
   stay written as plain mutation — the way the game's own model reads — without
   any of it escaping into shared state.
   ========================================================================== */

interface LogLine { id: number, stamp: string, text: string, kind: LogKind }

const SEV_FILL: Record<string, string> = {
    '-1': '#8fd0f5',  // treated
    '0': '#e6e9ec',
    '1': '#f0d47e',
    '2': '#e08a3c',
    '3': '#d2352c',
}

/*
   Right-side geometry only; the left is the same path mirrored. Edit one side.

   The head is deliberately larger than life. This is a diagram you click, and
   at the size the panel renders it a realistically-proportioned head is a
   target too small to hit and too small to carry the casualty's face.

   The legs were one slab with a seam down it: both inner edges met on the
   centre line, so the pair read as a single shape and picking the near one was
   a coin toss. They are tapered and parted now, and the feet sit under the
   ankle rather than beside it.
*/
const BODY_GEOM = {
    head: (
        <>
            <ellipse cx='150' cy='54' rx='35' ry='41' />
            <rect x='138' y='86' width='24' height='24' rx='7' />
        </>
    ),
    torso: (
        <path d='M106,112 C98,124 96,146 98,166 C100,192 102,214 104,236
                 C106,264 110,288 112,308 L188,308 C190,288 194,264 196,236
                 C198,214 200,192 202,166 C204,146 202,124 194,112
                 C180,102 166,100 150,100 C134,100 120,102 106,112 Z' />
    ),
    arm: (
        <>
            <path d='M105,114 C88,120 79,134 77,154 L68,224 C64,256 62,282 61,308
                     L86,312 C90,282 94,256 98,226 L107,164 Z' />
            <ellipse cx='73' cy='324' rx='14' ry='18' />
        </>
    ),
    leg: (
        <>
            <path d='M112,306 C108,356 112,406 116,450
                     C118,494 120,544 120,584 L140,584
                     C141,544 142,496 144,450 C147,406 150,356 147,306 Z' />
            <ellipse cx='128' cy='594' rx='18' ry='11' />
        </>
    ),
}

/*
   Where the bleeding / fracture / tourniquet markers sit on each part.

   The head's is off to the temple rather than dead centre: centre is where the
   casualty's face now is, and a pulsing red disc over the middle of it hid the
   one thing the avatar was added to show.
*/
const ANCHORS: Record<PartId, [number, number]> = {
    head: [176, 32], torso: [150, 212], armR: [78, 252], armL: [222, 252],
    legR: [127, 462], legL: [173, 462],
}

/*
   Where the bone sits inside each part, and how long it is.

   Drawn along the limb rather than at the marker anchor: a fracture is a
   property of the whole bone, and a badge off to one side read as another
   status pip next to the bleeding one.
*/
const BONES: Record<PartId, { x: number, y: number, len: number, angle: number }> = {
    head:  { x: 150, y: 56,  len: 34,  angle: 0 },
    torso: { x: 150, y: 205, len: 86,  angle: 0 },
    // The arms hang outwards, so their bones lean with them: a positive
    // rotation takes the lower end to the left, which is the near arm's line.
    armR:  { x: 84,  y: 214, len: 96,  angle: 9 },
    armL:  { x: 216, y: 214, len: 96,  angle: -9 },
    legR:  { x: 128, y: 444, len: 140, angle: 0 },
    legL:  { x: 172, y: 444, len: 140, angle: 0 },
}

/**
 * A bone inside a limb: red while it is broken, blue once it is splinted.
 *
 * It leaves entirely when the part has nothing left wrong with it — a limb you
 * have finished with should look finished, and the diagram is read at a glance
 * rather than audited.
 */
function Bone({ at, splinted }: {
    at: { x: number, y: number, len: number, angle: number }
    splinted: boolean
}) {
    const colour = splinted ? '#8fd0f5' : '#d2352c'
    const half = at.len / 2
    const knob = Math.max(3, at.len * 0.055)
    const shaft = Math.max(2.4, at.len * 0.045)
    const end = half - knob * 0.7

    return (
        <g transform={`translate(${at.x},${at.y}) rotate(${at.angle})`} opacity={0.92}>
            <g fill={colour} stroke='rgba(0,0,0,.5)' strokeWidth={0.8}>
                <rect x={-shaft} y={-end} width={shaft * 2} height={end * 2} rx={shaft} />
                {[-1, 1].map(sy => [-1, 1].map(sx => (
                    <circle key={`${sx}${sy}`} cx={sx * knob * 0.75} cy={sy * end} r={knob} />
                )))}
            </g>

            {splinted ? (
                // Two bars alongside — the splint holding it.
                [-1, 1].map(sx => (
                    <rect
                        key={sx}
                        x={sx * (shaft + 3.4) - 1.4} y={-half * 0.62}
                        width={2.8} height={half * 1.24} rx={1.2}
                        fill='#8fd0f5' opacity={0.75}
                    />
                ))
            ) : (
                // The break itself. A clean gap reads as a join; the zigzag is
                // what makes it read as snapped.
                <>
                    <rect x={-shaft * 1.5} y={-1.6} width={shaft * 3} height={3.2} fill='#0b0d0c' />
                    <path
                        d={`M${-shaft * 1.5},-2 L${-shaft * 0.4},1.4 L${shaft * 0.4},-1.8 L${shaft * 1.5},2`}
                        fill='none' stroke='#0b0d0c' strokeWidth={1.6} strokeLinejoin='round'
                    />
                </>
            )}
        </g>
    )
}

/*
   How hard the severity colour is washed over the casualty's face.

   Zero for a healthy head, so you simply see who it is. Everything else keeps
   enough of the wash to read as injured at a glance — the diagram's whole job
   is to be legible without reading it, and a photograph would swallow that if
   the tint went transparent.
*/
/* Where the monitor's cuff sits on each upper arm. Mirrored, like the arm. */
const MONITOR_BAND: Partial<Record<PartId, number>> = { armR: 71, armL: 191 }

const HEAD_WASH: Record<string, number> = { '-1': .55, '0': 0, '1': .58, '2': .68, '3': .76 }

const DOT_CLASS = { g: s.dotG, y: s.dotY, r: s.dotR, b: s.dotB }
const LOG_CLASS: Record<LogKind, string> = { '': '', good: s.loglineGood, warn: s.loglineWarn, bad: s.loglineBad }

/* ========================================================================== */

export default function MedicalMenu({ roster, onClose }: {
    /** Candidate casualties, pulled from the ORBAT by the server. */
    roster: Casualty[]
    onClose: () => void
}) {
    const [difficulty, setDifficulty] = useState<Difficulty>('moderate')
    const [muted, setMuted] = useState(false)

    // One monitor for the life of the menu. Created here rather than at module
    // scope so two menus could never share an audio context, and torn down on
    // close so an alarm cannot outlive the casualty sounding it.
    const monitor = useRef<Monitor | null>(null)
    if (!monitor.current) monitor.current = new Monitor()
    useEffect(() => {
        const m = monitor.current!
        // The click that opened the menu is the gesture browsers want.
        m.unlock()
        return () => m.close()
    }, [])
    useEffect(() => { monitor.current!.setMuted(muted) }, [muted])

    /*
       The treatment underway, if any.

       One at a time, on purpose: the casualty carries on bleeding while you
       work, so *what you reach for first* is the decision this menu is asking
       you to make. Everything else is disabled until it finishes or you abort.
    */
    const [busy, setBusy] = useState<{ label: string, seconds: number } | null>(null)
    const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (busyTimer.current) clearTimeout(busyTimer.current) }, [])

    // Chosen once per open, in the initialiser rather than an effect: picking
    // in an effect would render the fallback first and swap the name out from
    // under you a frame later.
    const [patient, setPatient] = useState<Patient>(() => newPatient(drawCasualty(roster), 'moderate'))
    const [sel, setSel] = useState<PartId | null>(null)
    const [hover, setHover] = useState<PartId | null>(null)
    const [tool, setTool] = useState<ToolId>('examine')
    const [log, setLog] = useState<LogLine[]>([])
    const [toasts, setToasts] = useState<{ id: number, text: string }[]>([])
    const [clock, setClock] = useState('00:00:00')
    /** Seconds since this casualty arrived. Frozen the moment they are decided. */
    const [elapsed, setElapsed] = useState(0)
    const startedAt = useRef(Date.now())
    const [note, setNote] = useState('')

    // The mission clock starts 37 minutes in — you are not the first responder.
    const t0 = useRef(Date.now() - 1000 * 60 * 37)
    const nextId = useRef(0)

    /*
       The authoritative patient, so the sim loop and a treatment cannot each
       fork from the same render.

       Both paths clone this rather than the state variable: the loop ticks
       every 250ms, and reading a closed-over `patient` would mean a treatment
       clicked mid-tick silently discarded whatever the casualty had bled since
       the last render.
    */
    const live = useRef<Patient>(patient)
    const commit = useCallback((next: Patient) => {
        live.current = next
        setPatient(next)
    }, [])

    const pushLog = useCallback((text: string, kind: LogKind = '') => {
        const line: LogLine = { id: nextId.current++, stamp: stampFrom(t0.current), text, kind }
        setLog(prev => [line, ...prev].slice(0, 200))
    }, [])

    const pushToast = useCallback((text: string) => {
        const id = nextId.current++
        setToasts(prev => [...prev, { id, text }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2600)
    }, [])

    /*
       The retch.

       Watched here rather than announced by the sim: whether a sound plays is
       the menu's business, and the model has no idea a speaker exists. It is
       the only warning that the airway has just shut, so it plays whether or
       not you were looking at the head.
    */
    const vomiting = patient.airway === 'vomit'
    const wasVomiting = useRef(vomiting)
    useEffect(() => {
        if (vomiting && !wasVomiting.current) monitor.current?.vomit()
        wasVomiting.current = vomiting
    }, [vomiting])

    /*
       Decided, and therefore finished.

       Everything the menu does on a timer checks this: the mission clock, the
       trace, the alarm, the treatment in your hands. A casualty who has been
       called should not still be bleeding on the board, and a monitor should
       not still be making noise over them — the run stops dead, and the board
       is where you choose to take another one.
    */
    const over = patient.outcome !== 'active'

    /* ---------- the monitor's alarm --------------------------------------- */
    // Silence once they are called. An alarm nobody can act on is just noise.
    const alarm = over ? 'none' : alarmFor(patient)
    useEffect(() => { monitor.current!.setAlarm(alarm) }, [alarm])

    // A treatment half-finished on a casualty who has been called does not
    // finish. Without this the timer fires and the log reports a dressing
    // applied to somebody who is already on the board.
    useEffect(() => {
        if (!over) return
        if (busyTimer.current) clearTimeout(busyTimer.current)
        busyTimer.current = null
        monitor.current?.stopAnalyse()
        setBusy(null)
    }, [over])

    // Announce a rhythm change in the log — it is the one thing that can happen
    // to a casualty without anybody having done it.
    const rhythm = patient.rhythm
    const lastRhythm = useRef<Rhythm>(rhythm)
    useEffect(() => {
        if (lastRhythm.current === rhythm) return
        lastRhythm.current = rhythm
        pushLog(`Monitor — ${RHYTHM_LABEL[rhythm]}`, rhythm === 'sinus' ? 'good' : 'bad')
    }, [rhythm, pushLog])

    /* ---------- boot ------------------------------------------------------ */
    // Guarded: StrictMode runs effects twice in development, and without this
    // the handover you are given is printed to the log twice over.
    const booted = useRef(false)
    useEffect(() => {
        if (booted.current) return
        booted.current = true
        handover(live.current).forEach(l => pushLog(l.text, l.kind))
    }, [pushLog])

    /* ---------- a fresh casualty ------------------------------------------ */
    function resetPatient(d: Difficulty) {
        // Whatever was underway was being done to the last casualty.
        if (busyTimer.current) clearTimeout(busyTimer.current)
        busyTimer.current = null
        setBusy(null)

        const next = newPatient(drawCasualty(roster), d)
        startedAt.current = Date.now()
        setElapsed(0)
        commit(next)
        setDifficulty(d)
        setSel(null)
        setToasts([])
        // The log belongs to the casualty who has just left the table.
        setLog([])
        setTimeout(() => handover(next).forEach(l => pushLog(l.text, l.kind)), 0)
    }

    // Held in a ref so the keydown listener below can abort the treatment
    // without being torn down and rebound every time one starts. Synced in an
    // effect rather than assigned during render — events fire after commit, so
    // the handler always sees the current one.
    const cancelRef = useRef<() => boolean>(() => false)
    useEffect(() => {
        cancelRef.current = () => {
            if (!busy) return false
            cancelAction()
            return true
        }
    })

    /* ---------- modal chrome: escape, scroll lock ------------------------- */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null
            if (el?.tagName === 'INPUT') return

            if (e.key === 'Escape') {
                // Escape unwinds one step at a time — abort the treatment, then
                // drop the selected limb, and only close once there is nothing
                // left to let go of. One stray key should never throw away a
                // casualty you were half-way through.
                if (cancelRef.current()) return
                setSel(prev => {
                    if (prev === null) onClose()
                    return null
                })
                return
            }
            const n = parseInt(e.key, 10)
            if (n >= 1 && n <= TOOLS.length) setTool(TOOLS[n - 1].id)
        }
        document.addEventListener('keydown', onKey)
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = previous
        }
    }, [onClose])

    /* ---------- sim loop --------------------------------------------------- */
    useEffect(() => {
        let last = Date.now()
        const id = setInterval(() => {
            const now = Date.now()
            const dt = (now - last) / 1000
            last = now

            // Both clocks stop when the casualty is called. Nothing below this
            // line should be running while a board is up.
            if (live.current.outcome !== 'active') return
            setClock(stampFrom(t0.current, now))
            setElapsed((now - startedAt.current) / 1000)

            const next = structuredClone(live.current)
            const event = simulate(next, dt)
            commit(next)
            // The sim only speaks up when something happened on its own, and
            // it is no longer only ever an arrest — it is also bleeding out,
            // running the downtime clock out, and getting there.
            if (event) {
                pushLog(event[0], event[1])
                pushToast(event[0])
            }
        }, 250)
        return () => clearInterval(id)
    }, [commit, pushLog, pushToast])

    /* ---------- running a treatment --------------------------------------- */

    /** Applies the treatment. Called when the timer runs out, not on click. */
    function applyAction(a: Action, ml = 0): Patient {
        const next = structuredClone(live.current)
        const [msg, kind] = a.run(next, sel, ml)
        if (sel && a.needsPart) next.parts[sel].checked = true
        commit(next)
        if (msg) { pushLog(msg, kind); pushToast(msg) }
        return next
    }

    function startAction(a: Action, ml = 0) {
        if (busy || patient.outcome !== 'active') return
        const seconds = actionTime(tool, a)
        // The size is part of what you are doing, so it belongs in what the
        // progress bar and the log say you are doing.
        const label = ml ? `${a.label} ${ml} ml` : a.label
        if (seconds <= 0) { applyAction(a, ml); return }

        setBusy({ label, seconds })
        pushLog(`${label} — started`, '')
        // The charge runs for the length of the action, so the tone finishing
        // *is* the cue that the thing is about to happen.
        if (a.sound === 'charge') monitor.current!.charge(seconds)
        if (a.sound === 'analyse') monitor.current!.analysing(seconds)
        busyTimer.current = setTimeout(() => {
            busyTimer.current = null
            setBusy(null)
            if (a.sound === 'charge') monitor.current!.shock()
            const next = applyAction(a, ml)
            // The verdict is the result, so it can only be played once there
            // is one — shockable and not-shockable must never sound alike.
            if (a.sound === 'analyse') monitor.current!.verdict(!!next.analysed?.advised)
        }, seconds * 1000)
    }

    function cancelAction() {
        if (!busy) return
        if (busyTimer.current) clearTimeout(busyTimer.current)
        busyTimer.current = null
        pushLog(`${busy.label} — interrupted`, 'warn')
        monitor.current?.stopAnalyse()
        setBusy(null)
    }

    function setTriage(t: Triage) {
        const next = structuredClone(live.current)
        next.triage = t
        next.triageEntries.unshift({ stamp: stampFrom(t0.current), text: 'Triage set — ' + t.toUpperCase() })
        commit(next)
        pushLog('Triage tag applied — ' + t.toUpperCase(), t === 'immediate' ? 'bad' : 'warn')
    }

    function addCardNote(text: string) {
        const next = structuredClone(live.current)
        next.triageEntries.unshift({ stamp: stampFrom(t0.current), text })
        commit(next)
    }

    function patch(fields: Partial<Patient>) {
        commit({ ...structuredClone(live.current), ...fields })
    }

    /* ---------- derived ---------------------------------------------------- */
    /*
       Only what is indicated, for what is selected.

       A dressing offered for a limb with nothing open on it is noise, and
       noise is what you read past while somebody bleeds. Sections whose rows
       all dropped out go with them.
    */
    const selPart = sel ? patient.parts[sel] : null
    const rows = tool === 'triage' ? [] : visibleRows(ACTIONS[tool], patient, selPart)

    /*
       The wound a dressing would go on, and what to reach for.

       `nextWound` picks the worst one open, and `dress` treats that same one —
       so the recommendation is about the wound you are actually about to
       close rather than a general opinion about the limb.
    */
    const woundUp = selPart ? nextWound(selPart) : null
    const bestPick = woundUp ? bestBandage(woundUp.t) : null
    const airOpen = airwayOpen(patient)
    const breathes = breathing(patient)


    const issues = stabilityIssues(patient)
    const bleeding = totalBleed(patient) > 0
    const [bw, bcls] = bloodWord(patient.blood)
    const pw = painWord(patient.pain)
    const selLabel = sel ? pName(sel) : hover ? pName(hover) : 'None'

    const body = (
        <div className={s.scrim} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className={s.root} role='dialog' aria-modal='true' aria-label='HZN-MED medical menu'>

                <div className={s.scene} aria-hidden>
                    <div className={s.sky} /><div className={s.ground} /><div className={s.medic} />
                    <div className={s.blood} /><div className={s.haze} /><div className={s.grain} />
                    <div className={s.blur} /><div className={s.vig} />
                </div>

                <div className={s.menu}>

                    <div className={s.titlebar}>
                        <h1>Medical Menu</h1>
                        <span className={s.tag}>HZN-MED</span>
                        <span className={`${s.tag} ${s.tagAlt}`}>TRAINING</span>
                        <span className={s.spacer} />

                        <label className={s.diff}>
                            <span>CASUALTY</span>
                            <select
                                value={difficulty}
                                aria-label='Difficulty'
                                onChange={e => resetPatient(e.target.value as Difficulty)}
                            >
                                {DIFFICULTIES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                            </select>
                        </label>
                        <button type='button' className={s.newbtn} onClick={() => resetPatient(difficulty)}>
                            New casualty
                        </button>
                        <button
                            type='button'
                            className={s.newbtn}
                            aria-pressed={muted}
                            title={muted ? 'Unmute the monitor' : 'Mute the monitor'}
                            onClick={() => setMuted(m => !m)}
                        >
                            {muted ? 'Sound off' : 'Sound on'}
                        </button>

                        <span className={s.meta}>MISSION {clock}</span>
                        <span className={s.meta}>MEDIC · <b>DOC-1 KODA</b></span>
                        <button type='button' className={s.xbtn} title='Close' aria-label='Close' onClick={onClose}>✕</button>
                    </div>

                    <div className={s.grid}>

                        {/* ---- examine & treatment ---- */}
                        <div className={s.col}>
                            <div className={s.colhead}>EXAMINE &amp; TREATMENT</div>
                            <div className={s.toolbar}>
                                {TOOLS.map((t, i) => {
                                    const Icon = TOOL_ICONS[t.id]
                                    return (
                                        <React.Fragment key={t.id}>
                                            <button
                                                type='button'
                                                className={`${s.tool} ${tool === t.id ? s.toolOn : ''}`}
                                                title={`${t.label}  [${i + 1}]`}
                                                aria-pressed={tool === t.id}
                                                onClick={() => setTool(t.id)}
                                            >
                                                <Icon />
                                                <span className={s.kbd}>{i + 1}</span>
                                            </button>
                                            {TOOL_SEPS.has(t.id) && <span className={s.toolsep} />}
                                        </React.Fragment>
                                    )
                                })}
                            </div>

                            {busy && (
                                <div className={s.progress}>
                                    <span className={s.progressLabel}>{busy.label}</span>
                                    <button type='button' className={s.progressX} onClick={cancelAction}>Abort</button>
                                    {/* Driven by the animation's own duration rather
                                        than a ticking state value — nothing else on
                                        screen needs to know how far along it is. */}
                                    <i style={{ animationDuration: `${busy.seconds}s` }} />
                                </div>
                            )}

                            <div className={s.panel}>
                                {tool === 'bandage' && woundUp && (
                                    <div className={s.advice}>
                                        Next: <b>{WOUND_TYPES[woundUp.t].name}</b> — reach for{' '}
                                        <b>{BANDAGES[bestPick!].short}</b>
                                    </div>
                                )}
                                {tool === 'triage' ? (
                                    <TriageCard
                                        patient={patient}
                                        note={note}
                                        setNote={setNote}
                                        onTriage={setTriage}
                                        onNote={addCardNote}
                                        onPatch={patch}
                                    />
                                ) : (
                                    rows.length === 0 ? (
                                        <div className={s.nothing}>
                                            {sel
                                                ? `Nothing indicated for the ${pName(sel)}.`
                                                : 'Select a body part to see what it needs.'}
                                        </div>
                                    ) : rows.map((row, i) =>
                                        row.sec !== undefined
                                            ? <div key={`s${i}`} className={s.sectlabel}>{row.sec}</div>
                                            : row.sizes ? (
                                                /* A bag is a choice of size, so the row
                                                   is the shelf and each button is what
                                                   you take off it. */
                                                <div key={row.id} className={`${s.trow} ${s.trowSizes}`}>
                                                    <span className={`${s.dot} ${row.dot ? DOT_CLASS[row.dot] : ''}`} />
                                                    <span>{row.label}</span>
                                                    <span className={s.qty}>
                                                        {row.needsPart && !sel
                                                            ? 'SELECT A LIMB'
                                                            : [row.note, `${actionTime(tool, row)}s to hook up`].filter(Boolean).join(' · ')}
                                                    </span>
                                                    <div className={s.sizes}>
                                                        {row.sizes.map(ml => (
                                                            <button
                                                                key={ml}
                                                                type='button'
                                                                className={s.sizebtn}
                                                                disabled={!!busy || patient.outcome !== 'active' || (row.needsPart && !sel)}
                                                                onClick={() => startAction(row, ml)}
                                                            >
                                                                {ml} ml
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    key={row.id}
                                                    type='button'
                                                    className={[
                                                        s.trow,
                                                        row.onFor?.(patient) ? s.trowOn : '',
                                                        row.bandage && row.bandage === bestPick ? s.trowBest : '',
                                                    ].filter(Boolean).join(' ')}
                                                    disabled={!!busy || patient.outcome !== 'active' || (row.needsPart && !sel)}
                                                    onClick={() => startAction(row)}
                                                >
                                                    <span className={`${s.dot} ${row.dot ? DOT_CLASS[row.dot] : ''}`} />
                                                    <span>{row.labelFor ? row.labelFor(patient) : row.label}</span>
                                                    {row.bandage && row.bandage === bestPick && <span className={s.bestTag}>BEST</span>}
                                                    <span className={s.qty}>
                                                        {row.needsPart && !sel
                                                            ? 'SELECT A LIMB'
                                                            : [row.note, actionTime(tool, row) > 0 && `${actionTime(tool, row)}s`]
                                                                .filter(Boolean).join(' · ')}
                                                    </span>
                                                </button>
                                            ))
                                )}
                            </div>
                        </div>

                        {/* ---- patient ---- */}
                        <div className={s.col}>
                            <div className={s.colhead}>
                                {patient.rank && <span className={s.rank}>{patient.rank}</span>}
                                {patient.name}
                                <span className={s.sub}>
                                    {[patient.callsign && `"${patient.callsign}"`, patient.unit]
                                        .filter(Boolean).join(' · ')}
                                </span>
                            </div>

                            <div className={s.bodywrap}>
                                <svg className={s.bodySvg} viewBox='0 0 300 640' preserveAspectRatio='xMidYMid meet'>
                                    <defs>
                                        <clipPath id='hznHead'>
                                            <ellipse cx='150' cy='54' rx='35' ry='41' />
                                        </clipPath>
                                        <filter id='hznGlow'>
                                            <feGaussianBlur stdDeviation='3' result='b' />
                                            <feMerge><feMergeNode in='b' /><feMergeNode in='SourceGraphic' /></feMerge>
                                        </filter>
                                    </defs>

                                    <g strokeWidth='1.2'>
                                        {([
                                            ['torso', BODY_GEOM.torso, undefined],
                                            ['head', BODY_GEOM.head, undefined],
                                            ['armR', BODY_GEOM.arm, undefined],
                                            ['armL', BODY_GEOM.arm, 'translate(300,0) scale(-1,1)'],
                                            ['legR', BODY_GEOM.leg, undefined],
                                            ['legL', BODY_GEOM.leg, 'translate(300,0) scale(-1,1)'],
                                        ] as [PartId, React.ReactNode, string | undefined][]).map(([id, shape, transform]) => {
                                            const on = sel === id
                                            const sev = String(partSeverity(patient.parts[id]))
                                            return (
                                                <g
                                                    key={id}
                                                    className={s.part}
                                                    transform={transform}
                                                    filter={on ? 'url(#hznGlow)' : undefined}
                                                    fill={SEV_FILL[sev]}
                                                    stroke={on ? '#ffffff' : 'rgba(0,0,0,.55)'}
                                                    strokeWidth={on ? 3.4 : 1.2}
                                                    onClick={() => setSel(prev => (prev === id ? null : id))}
                                                    onMouseEnter={() => setHover(id)}
                                                    onMouseLeave={() => setHover(null)}
                                                >
                                                    {shape}
                                                    {/* The casualty's own face, clipped into the
                                                        head, with the severity colour washed back
                                                        over it so an injured head still reads as
                                                        one at a glance. */}
                                                    {id === 'head' && patient.avatar && (
                                                        <>
                                                            <image
                                                                href={patient.avatar}
                                                                x={115} y={13} width={70} height={82}
                                                                preserveAspectRatio='xMidYMid slice'
                                                                clipPath='url(#hznHead)'
                                                            />
                                                            {HEAD_WASH[sev] > 0 && (
                                                                <ellipse
                                                                    cx='150' cy='54' rx='35' ry='41'
                                                                    fill={SEV_FILL[sev]}
                                                                    opacity={HEAD_WASH[sev]}
                                                                    stroke='none'
                                                                />
                                                            )}
                                                        </>
                                                    )}
                                                </g>
                                            )
                                        })}
                                    </g>

                                    {/* Bleeding, tourniquets, fractures and IV sites. */}
                                    <g pointerEvents='none'>
                                        {PARTS.map(({ id }) => {
                                            const pt = patient.parts[id]
                                            const [x, y] = ANCHORS[id]
                                            const tqY = id.startsWith('arm') ? y - 40 : y - 70
                                            return (
                                                <React.Fragment key={id}>
                                                    {partBleeding(pt) > 0 && (
                                                        <circle cx={x} cy={y} r={6} fill='#c8241c' opacity='.85'>
                                                            <animate attributeName='r' values='4;9;4' dur='1.4s' repeatCount='indefinite' />
                                                            <animate attributeName='opacity' values='.9;.15;.9' dur='1.4s' repeatCount='indefinite' />
                                                        </circle>
                                                    )}
                                                    {/* Gone once the part is done with: splinted,
                                                        and nothing still bleeding out of it. */}
                                                    {pt.fractured && !(pt.splinted && partSeverity(pt) <= 0) && (
                                                        <Bone at={BONES[id]} splinted={pt.splinted} />
                                                    )}
                                                    {pt.tourniquet && (
                                                        <g>
                                                            <rect x={x - 22} y={tqY} width='44' height='9' rx='2' fill='#1c1c1c' stroke='#d9a441' strokeWidth='1.4' />
                                                            <text x={x} y={tqY - 4} textAnchor='middle' fill='#d9a441' fontSize='10'>TQ</text>
                                                        </g>
                                                    )}
                                                    {pt.iv > 0 && <circle cx={x - 16} cy={y + 10} r='4' fill='#56a8e0' />}
                                                </React.Fragment>
                                            )
                                        })}
                                        {/* The hole, and whether anything is over it. */}
                                        {patient.chestWound && (
                                            <g>
                                                <circle className={s.chestHole} cx='170' cy='166' r='6.5' fill='#d2352c' />
                                                {patient.sealed && (
                                                    <rect x='157' y='153' width='26' height='26' rx='2'
                                                        fill='rgba(143,208,245,.14)' stroke='#8fd0f5' strokeWidth='1.6' />
                                                )}
                                            </g>
                                        )}
                                        {patient.pneumo && (
                                            <g>
                                                <circle className={s.pneumoRing} cx='170' cy='170' r='27'
                                                    fill='none' stroke='#e03b31' strokeWidth='2' strokeDasharray='5 5' />
                                                <text x='170' y='134' textAnchor='middle' fill='#e03b31'
                                                    fontSize='10' fontWeight='700' letterSpacing='1.6'>TENSION</text>
                                            </g>
                                        )}

                                        {/* Somebody squeezing a bag over the face. */}
                                        {patient.bagging && (
                                            <g>
                                                <ellipse className={s.bagSqueeze} cx='150' cy='58' rx='26' ry='20'
                                                    fill='rgba(86,168,224,.16)' stroke='#56a8e0' strokeWidth='1.8' />
                                                <text x='150' y='24' textAnchor='middle' fill='#56a8e0'
                                                    fontSize='9.5' fontWeight='700' letterSpacing='1.6'>BVM</text>
                                            </g>
                                        )}

                                        {/* An airway that somebody is holding open. */}
                                        {(patient.adjunct !== 'none' || !airOpen) && (
                                            <g>
                                                <rect x='138' y='86' width='24' height='10' rx='2'
                                                    fill={airOpen ? '#12181d' : '#2a1210'}
                                                    stroke={airOpen ? '#56a8e0' : '#e03b31'} strokeWidth='1.4' />
                                                {!airOpen && (
                                                    <text x='150' y='118' textAnchor='middle' fill='#e03b31'
                                                        fontSize='9.5' fontWeight='700' letterSpacing='1.4'>NO AIR</text>
                                                )}
                                            </g>
                                        )}

                                        {/* The cuff, where you put it. */}
                                        {patient.monitorOn && MONITOR_BAND[patient.monitorOn] && (
                                            <g>
                                                <rect
                                                    x={MONITOR_BAND[patient.monitorOn]!} y='146' width='38' height='15' rx='3'
                                                    fill='#12181d' stroke='#56a8e0' strokeWidth='1.5' />
                                                <circle
                                                    className={s.cuffLed}
                                                    cx={MONITOR_BAND[patient.monitorOn]! + 31} cy='153.5' r='2.6' fill='#56a8e0' />
                                            </g>
                                        )}

                                        {/* Pads: right anterior, left lateral. */}
                                        {patient.padsOn && (
                                            <g>
                                                <path d='M129,160 L171,208' stroke='#d9a441' strokeWidth='1' opacity='.45' fill='none' />
                                                <rect x='114' y='138' width='30' height='22' rx='3'
                                                    fill='#241d12' stroke='#d9a441' strokeWidth='1.5' />
                                                <rect x='156' y='206' width='30' height='22' rx='3'
                                                    fill='#241d12' stroke='#d9a441' strokeWidth='1.5' />
                                            </g>
                                        )}

                                        {/* Hands on the chest. It beats at the rate
                                            you are being asked to compress at, so the
                                            animation is the metronome. */}
                                        {patient.cprActive && (
                                            <g>
                                                <circle className={s.cprRing} cx='150' cy='186' r='31'
                                                    fill='rgba(224,59,49,.16)' stroke='#e03b31' strokeWidth='2' />
                                                <path className={s.cprHands}
                                                    d='M139,176 h22 v10 h-22 z M142,186 h16 v9 h-16 z'
                                                    fill='#e03b31' opacity='.92' />
                                                <text x='150' y='216' textAnchor='middle' fill='#e03b31'
                                                    fontSize='12' fontWeight='700' letterSpacing='2.5'>CPR</text>
                                            </g>
                                        )}

                                        <Chatter patient={patient} />
                                    </g>
                                </svg>
                            </div>

                            <div className={`${s.selbar} ${sel ? '' : s.selbarNone}`}>{selLabel}</div>

                            <div className={s.legend}>
                                {/* Colour is bleeding and nothing else — fractures
                                    are the bone drawn inside the limb. */}
                                <span><i style={{ background: '#e6e9ec' }} />No bleed</span>
                                <span><i style={{ background: '#f0d47e' }} />Light</span>
                                <span><i style={{ background: '#e08a3c' }} />Moderate</span>
                                <span><i style={{ background: '#d2352c' }} />Severe</span>
                                <span><i style={{ background: '#8fd0f5' }} />Dressed</span>
                                <span><i style={{ background: '#d2352c', borderRadius: '50%' }} />Fracture</span>
                            </div>
                        </div>

                        {/* ---- overview ---- */}
                        <div className={`${s.col} ${s.colOverview}`}>
                            <div className={s.colhead}>OVERVIEW</div>
                            <div className={s.panel}>
                                {patient.cardiacArrest && (
                                    <div className={`${s.ovline} ${s.ovlineRed}`}>
                                        CARDIAC ARREST — {patient.monitorOn ? RHYTHM_LABEL[patient.rhythm] : 'no monitor attached'}
                                    </div>
                                )}
                                {patient.rhythm === 'stemi' && patient.monitorOn && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>{RHYTHM_LABEL.stemi}</div>
                                )}
                                {patient.outcome === 'active' && !breathes && !patient.bagging && (
                                    <div className={`${s.ovline} ${s.ovlineRed} ${s.flash}`}>
                                        NOT BREATHING — {airOpen ? 'get a bag on them' : 'open the airway, then bag'}
                                    </div>
                                )}
                                {patient.outcome === 'active' && patient.spo2 <= 80 && (
                                    <div className={`${s.ovline} ${s.ovlineRed} ${patient.spo2 <= 64 ? s.flash : ''}`}>
                                        SpO₂ {Math.round(patient.spo2)}% — FATAL BELOW {FATAL_SPO2}%
                                        {!airOpen && ' · AIRWAY BLOCKED'}
                                    </div>
                                )}
                                {patient.pneumo && (
                                    <div className={`${s.ovline} ${s.ovlineRed} ${s.flash}`}>
                                        TENSION PNEUMOTHORAX — needs a needle
                                    </div>
                                )}
                                {patient.chestWound && !patient.sealed && !patient.pneumo && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>Open chest wound — unsealed</div>
                                )}
                                {!patient.monitorOn && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>
                                        No vitals monitor — attach one to an arm
                                    </div>
                                )}
                                {!patient.padsOn && patient.cardiacArrest && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>
                                        No defibrillator pads — site them on the chest
                                    </div>
                                )}
                                {/* Whether they are with you. First, because it changes
                                    what every other line on this panel means. */}
                                <div className={`${s.ovline} ${patient.conscious ? s.ovlineGreen : s.ovlineYel}`}>
                                    {patient.conscious
                                        ? 'Conscious · responding'
                                        : patient.cardiacArrest
                                            ? 'Unresponsive · no output'
                                            : patient.wake > 0
                                                ? 'Unconscious · post-arrest'
                                                : 'Unconscious · not responding'}
                                </div>
                                {patient.epi > 0 && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>
                                        Epinephrine on board · {Math.ceil(patient.epi)}s
                                    </div>
                                )}
                                {patient.analysed && patient.analysed.rhythm === patient.rhythm && (
                                    <div className={`${s.ovline} ${patient.analysed.advised ? s.ovlineRed : s.ovlineDim}`}>
                                        {patient.analysed.advised ? 'Shock advised' : 'No shock advised'}
                                    </div>
                                )}
                                {bleeding && <div className={`${s.ovline} ${s.ovlineRed}`}>Bleeding</div>}
                                {/* Sat under the bleeding it is holding back, because
                                    that is the only thing it is doing. */}
                                {patient.pressor > 0 && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>
                                        Phenylephrine ×{Math.ceil(patient.pressor)} · bleeding at {Math.round(bleedFactor(patient) * 100)}%
                                    </div>
                                )}
                                {bw && <div className={`${s.ovline} ${bcls === 'red' ? s.ovlineRed : s.ovlineYel}`}>{bw}</div>}
                                {pw && <div className={s.ovline}>{pw}</div>}
                                {patient.tqCount > 0 && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>{patient.tqCount}× Tourniquet applied</div>
                                )}
                                {!bleeding && !bw && !pw && !patient.cardiacArrest && (
                                    <div className={`${s.ovline} ${s.ovlineDim}`}>No apparent injuries.</div>
                                )}

                                {patient.cardiacArrest && patient.outcome === 'active' && (
                                    <div className={s.downtime}>
                                        <span>
                                            DOWNTIME {mmss(patient.downtime)} / {mmss(DEATH_DOWNTIME)}
                                            {patient.cprActive && <b> · CPR SLOWING</b>}
                                        </span>
                                        <i style={{ width: `${Math.min(100, patient.downtime / DEATH_DOWNTIME * 100)}%` }} />
                                    </div>
                                )}

                                <Vitals patient={patient} />
                                <Ecg patient={patient} monitor={monitor} />
                                <div className={s.bloodbar}><i style={{ width: `${patient.blood}%` }} /></div>

                                {/* Lines running. Sited under the volume bar because
                                    that is the bar they are filling, and left up while
                                    you are on any other tool — the whole point of an
                                    infusion is that you walked away from it. */}
                                {patient.infusions.map(inf => {
                                    const f = FLUIDS[inf.fluid]
                                    return (
                                        <div key={inf.id} className={s.infusion}>
                                            <span className={s.infusionDrip} style={{ background: f.colour }} />
                                            <span>{f.label} {inf.volume} ml · {pName(inf.part)}</span>
                                            <b>{Math.ceil(inf.left)} ml</b>
                                            <i style={{ width: `${inf.left / inf.volume * 100}%`, background: f.colour }} />
                                        </div>
                                    )
                                })}

                                {PARTS.map(({ id, name }) => {
                                    const pt = patient.parts[id]
                                    if (!pt.wounds.length && !pt.fractured && !pt.tourniquet && !pt.iv) return null
                                    return (
                                        <div key={id} className={s.ovpart}>
                                            <h4>{name}</h4>
                                            {pt.fractured && (
                                                <div className={`${s.ovline} ${pt.splinted ? s.ovlineDim : s.ovlineRed}`}>
                                                    {pt.splinted ? 'Fractured (splinted)' : 'Fractured'}
                                                </div>
                                            )}
                                            {pt.wounds.map(w => (
                                                <div key={w.id} className={`${s.ovsub} ${w.bandaged ? s.ovsubB : ''}`}>
                                                    {WOUND_TYPES[w.t].name}
                                                    {w.bandaged && w.dressing && (
                                                        <span className={w.failIn !== null ? s.slipping : undefined}>
                                                            {' · '}{BANDAGES[w.dressing].short}
                                                            {w.failIn !== null ? ` ${Math.ceil(w.failIn)}s` : ' · holding'}
                                                        </span>
                                                    )}
                                                    {!w.bandaged && <span className={s.slipping}>{' · open'}</span>}
                                                </div>
                                            ))}
                                            {pt.tourniquet && <div className={s.ovsub} style={{ color: 'var(--yellow)' }}>Tourniquet applied</div>}
                                            {pt.iv > 0 && <div className={s.ovsub} style={{ color: 'var(--blue)' }}>{pt.iv}× IV access</div>}
                                            {!pt.checked && <div className={`${s.ovsub} ${s.ovsubB}`} style={{ fontSize: 12.5 }}>not yet examined</div>}
                                        </div>
                                    )
                                })}

                                {patient.meds.length > 0 && (
                                    <div className={s.ovpart}>
                                        <h4>Medication</h4>
                                        <div className={s.chips}>
                                            {Object.entries(patient.meds.reduce<Record<string, number>>((acc, m) => {
                                                acc[m] = (acc[m] ?? 0) + 1
                                                return acc
                                            }, {})).map(([m, n]) => (
                                                <span key={m} className={`${s.chip} ${s.chipY}`}>{n}× {m}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className={s.ovpart}>
                                    <h4>Airway</h4>
                                    {/* What is in it is something you find out by
                                        looking. What you put in it, you know. */}
                                    {patient.airwayChecked ? (
                                        <div
                                            className={s.ovsub}
                                            style={{ color: airOpen ? 'var(--green)' : 'var(--red)', fontWeight: airOpen ? 400 : 700 }}
                                        >
                                            {OBSTRUCTION_LABEL[patient.airway]}
                                            {airOpen ? '' : ' — NOT MOVING AIR'}
                                        </div>
                                    ) : (
                                        <div className={`${s.ovsub} ${s.ovsubB}`}>Unknown — check it</div>
                                    )}
                                    {/* Not gated on having checked: a chest either
                                        rises or it does not, and you can see that
                                        from where you are standing. */}
                                    <div
                                        className={s.ovsub}
                                        style={{ color: breathes ? 'var(--green)' : 'var(--red)', fontWeight: breathes ? 400 : 700 }}
                                    >
                                        {breathes
                                            ? 'Breathing on their own'
                                            : patient.bagging
                                                ? 'NOT BREATHING — bagged at 12/min'
                                                : 'NOT BREATHING'}
                                    </div>
                                    {patient.oxygen && (
                                        <div className={s.ovsub} style={{ color: 'var(--blue)' }}>Oxygen running · 15 L NRB</div>
                                    )}
                                    {patient.adjunct !== 'none' && (
                                        <div className={s.ovsub} style={{ color: 'var(--blue)' }}>
                                            {ADJUNCT_LABEL[patient.adjunct]} sited
                                        </div>
                                    )}
                                    {patient.recovery && (
                                        <div className={s.ovsub} style={{ color: 'var(--green)' }}>In the recovery position</div>
                                    )}
                                    {patient.suction === 0 && (
                                        <div className={`${s.ovsub} ${s.ovsubB}`}>Suction pump spent</div>
                                    )}
                                </div>

                                {/* What still stands between this casualty and a
                                    handover. Listed rather than reduced to a
                                    light, so you are not guessing which box is
                                    unticked. */}
                                <div className={s.ovpart}>
                                    <h4>To stabilise</h4>
                                    {issues.length === 0
                                        ? <div className={s.ovsub} style={{ color: 'var(--green)' }}>Nothing outstanding.</div>
                                        : issues.map(i => <div key={i} className={s.ovsub}>· {i}</div>)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ---- docks ---- */}
                    <div className={s.docks}>
                        <div className={s.dock}>
                            <h3>ACTIVITY LOG</h3>
                            <div className={s.dockScroll}>
                            <div className={s.dockbody}>
                                {log.length === 0
                                    ? <div className={s.hint}>No activity recorded.</div>
                                    : log.map(l => (
                                        <div key={l.id} className={`${s.logline} ${LOG_CLASS[l.kind]}`}>
                                            <span className={s.t}>{l.stamp}</span><b>{l.text}</b>
                                        </div>
                                    ))}
                            </div>
                            </div>
                        </div>
                        <div className={`${s.dock} ${s.dockQuick}`}>
                            <h3>QUICK VIEW</h3>
                            <div className={s.dockbody}><QuickView patient={patient} /></div>
                        </div>
                    </div>
                </div>

                {patient.outcome !== 'active' && (
                    <div className={`${s.board} ${patient.outcome === 'stable' ? s.boardWin : s.boardLose}`}>
                        <div className={s.boardCard}>
                            <div className={s.boardTag}>
                                {patient.outcome === 'stable' ? 'Casualty stable' : 'Casualty deceased'}
                            </div>
                            <div className={s.boardName}>{patient.name}</div>
                            <div className={s.boardTime}>{mmss(elapsed)}</div>
                            <div className={s.boardSub}>
                                {patient.outcome === 'stable'
                                    ? 'Handed over for transport'
                                    : patient.cause}
                            </div>
                            <div className={s.boardBtns}>
                                <button type='button' className={s.boardGo} onClick={() => resetPatient(difficulty)}>
                                    Next casualty
                                </button>
                                <button type='button' className={s.boardOut} onClick={onClose}>Close</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className={s.toastwrap}>
                    {toasts.map(t => <div key={t.id} className={s.toast}>{t.text}</div>)}
                </div>
            </div>
        </div>
    )

    // Portalled to the document so the milpac page's own stacking contexts and
    // `overflow-x: hidden` cannot clip or trap it.
    return createPortal(body, document.body)
}

/** m:ss, for the clocks that count a casualty rather than a mission. */
function mmss(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Somebody off the roster, or the stand-in when the ORBAT gave us nobody. */
function drawCasualty(roster: Casualty[]): Casualty {
    if (!roster.length) return FALLBACK_CASUALTY
    return roster[Math.floor(Math.random() * roster.length)]
}

/* ---------- vitals -------------------------------------------------------- */

function Vitals({ patient: p }: { patient: Patient }) {
    const cell = (k: React.ReactNode, v: React.ReactNode, u: string, cls: string) => (
        <div className={`${s.vit} ${cls}`}>
            <div className={s.k}>{k}</div>
            <div className={s.v}>{v} <small>{u}</small></div>
        </div>
    )
    /*
       Four of these six are the monitor's, and without one on the casualty
       they are not numbers you have — they are numbers a machine would have
       told you. Temperature and volume stay: neither comes off a vitals
       monitor, and the second is the estimate you are working from.
    */
    const off = !p.monitorOn
    return (
        <div className={s.vitals}>
            {cell('HR', off ? '—' : p.cardiacArrest ? '0' : jitter(p.hr, 2), off ? '' : 'bpm',
                off ? s.vitOff : p.hr > 120 || p.hr < 50 || p.cardiacArrest ? s.vitCrit : p.hr > 100 ? s.vitWarn : '')}
            {cell('BP', off ? '—' : p.cardiacArrest ? '0/0' : `${jitter(p.sysBp, 3)}/${jitter(p.diaBp, 2)}`, off ? '' : 'mmHg',
                off ? s.vitOff : p.sysBp < 90 ? s.vitCrit : p.sysBp < 105 ? s.vitWarn : '')}
            {cell('SpO₂', off ? '—' : p.cardiacArrest ? '--' : jitter(p.spo2, 1), off ? '' : '%',
                off ? s.vitOff
                    : p.spo2 <= 64 ? `${s.vitCrit} ${s.flash}`
                        : p.spo2 < 90 ? s.vitCrit : p.spo2 < 95 ? s.vitWarn : '')}
            {cell('RR', off ? '—' : p.cardiacArrest ? '0' : jitter(p.rr, 1), off ? '' : '/min',
                off ? s.vitOff : p.rr > 24 || p.rr < 8 ? s.vitWarn : '')}
            {cell('TEMP', p.temp.toFixed(1), '°C', p.temp < 35.5 ? s.vitWarn : '')}
            {cell('BLOOD', Math.round(p.blood), '%',
                p.blood < 55 ? s.vitCrit : p.blood < 75 ? s.vitWarn : '')}
        </div>
    )
}

/* ---------- ECG ----------------------------------------------------------- */

/**
 * What the casualty is telling you, if they are in any state to tell you.
 *
 * On its own timer rather than the sim's: they speak every few seconds, not
 * four times a second, and what they say is drawn fresh from how they are when
 * they say it. Going under stops them mid-sentence, which is the point — a
 * casualty who has gone quiet has told you something.
 */
function Chatter({ patient }: { patient: Patient }) {
    const live = useRef(patient)
    live.current = patient
    const [line, setLine] = useState<string | null>(null)

    useEffect(() => {
        const speak = () => {
            const p = live.current
            if (!p.conscious || p.outcome !== 'active') { setLine(null); return }
            const lines = chatter(p)
            setLine(lines[Math.floor(Math.random() * lines.length)])
        }
        speak()
        const id = setInterval(speak, 7000)
        return () => clearInterval(id)
    }, [])

    // Not on the interval: going under should shut them up immediately.
    const quiet = !patient.conscious || patient.outcome !== 'active'
    useEffect(() => { if (quiet) setLine(null) }, [quiet])

    if (!line || quiet) return null
    return <SpeechBubble text={line} />
}

/** Drawn in the body's own coordinates so it stays with the head at any size. */
function SpeechBubble({ text }: { text: string }) {
    const lines = wrapText(text, 18)
    const h = 12 + lines.length * 13
    return (
        <g className={s.bubble}>
            <path d={`M188,${h - 8} L172,${h + 14} L204,${h - 2} Z`} fill='rgba(10,12,11,.95)' />
            <rect x='186' y='4' width='112' height={h} rx='5'
                fill='rgba(10,12,11,.95)' stroke='#d9a441' strokeWidth='1.1' />
            {lines.map((l, i) => (
                <text key={i} x='192' y={4 + 16 + i * 13} fontSize='10.5' fill='#e6e9ec'>{l}</text>
            ))}
        </g>
    )
}

/** Naive word wrap. SVG text has no box to flow inside, so we make one. */
function wrapText(text: string, cols: number): string[] {
    const out: string[] = []
    let line = ''
    for (const w of text.split(' ')) {
        if (line && (line + ' ' + w).length > cols) { out.push(line); line = w }
        else line = line ? line + ' ' + w : w
    }
    if (line) out.push(line)
    return out.slice(0, 3)
}

/**
 * Lead II.
 *
 * One waveform function per rhythm, sampled across the canvas at a phase that
 * advances every frame. Drawn on its own animation frame rather than from React
 * state — it repaints at 60fps and nothing else on screen needs to know.
 *
 * The beep is fired from here too, at the moment the R wave crosses. Scheduling
 * it separately on a heart-rate interval would have been simpler and would have
 * drifted out of step with the trace within a few beats, which on a monitor is
 * the one thing you would notice.
 *
 * `beatPhase` is how far into the current beat we are, accumulated. It used to
 * be derived — `floor(phase / beatWidth)` — which is not a count of beats but a
 * ratio, and rescaling it re-dates every beat already played: a change in heart
 * rate would jump the index and fire a beep on top of the one just sounded.
 * Slow drift made the beeps stumble; the step changes (an arrest slamming the
 * rate to 0, a ROSC putting it back) made them audibly double.
 */
function Ecg({ patient, monitor }: { patient: Patient, monitor: React.RefObject<Monitor | null> }) {
    const ref = useRef<HTMLCanvasElement>(null)
    const live = useRef(patient)
    live.current = patient

    useEffect(() => {
        let frame = 0
        let phase = 0
        let beatPhase = 0
        let last = performance.now()

        const draw = (now: number) => {
            frame = requestAnimationFrame(draw)
            // A decided casualty's trace stands still. It stays on screen — the
            // last thing the monitor saw is worth looking at — but nothing
            // moves and nothing beeps.
            const advance = live.current.outcome === 'active' ? (now - last) * 0.09 : 0
            phase += advance
            last = now

            const c = ref.current
            if (!c) return
            const ctx = c.getContext('2d')
            if (!ctx) return
            const W = c.width, H = c.height
            const p = live.current

            ctx.clearRect(0, 0, W, H)
            ctx.strokeStyle = 'rgba(255,255,255,.07)'
            ctx.lineWidth = 1
            for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
            for (let y = 0; y < H; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

            // Nothing on the casualty, nothing on the screen. The grid is the
            // machine being switched on; the trace is it being connected.
            if (!p.monitorOn) {
                ctx.fillStyle = 'rgba(255,255,255,.35)'
                ctx.font = '11px sans-serif'
                ctx.fillText('NO SIGNAL — ATTACH VITALS MONITOR', 8, H / 2)
                return
            }

            const trace = traceOf(p)
            ctx.strokeStyle = TRACE_COLOUR[trace]
            ctx.lineWidth = 2
            ctx.beginPath()
            const mid = H * 0.58
            const beatW = beatWidth(p)

            // Where the beep lands and where the R wave is drawn are the same
            // number, so the two can never disagree.
            beatPhase += advance
            let beat = false
            if (beatPhase >= beatW) {
                beatPhase %= beatW
                beat = true
            }

            for (let x = 0; x < W; x++) {
                const t = ((x + beatPhase) % beatW) / beatW
                const y = sample(trace, t, x + phase) + (Math.random() - 0.5) * 0.02
                const py = mid - y * (H * 0.42)
                if (x === 0) ctx.moveTo(0, py); else ctx.lineTo(x, py)
            }
            ctx.stroke()

            // One beep per R wave, and only for rhythms that produce one.
            if (beat && AUDIBLE.has(trace)) monitor.current?.beat(p.spo2)

            ctx.fillStyle = 'rgba(255,255,255,.5)'
            ctx.font = '11px sans-serif'
            ctx.fillText(traceLabel(p), 8, 14)
        }

        frame = requestAnimationFrame(draw)
        return () => cancelAnimationFrame(frame)
    }, [monitor])

    return <canvas ref={ref} className={s.ecg} width={600} height={112} />
}

/**
 * What the trace is showing, which is not always the rhythm.
 *
 * Compressions put a waveform on the screen that belongs to your hands rather
 * than their heart, and it is the thing you are looking at while you do them.
 */
type Trace = Rhythm | 'cpr'

function traceOf(p: Patient): Trace {
    return p.cprActive && p.cardiacArrest ? 'cpr' : p.rhythm
}

const TRACE_COLOUR: Record<Trace, string> = {
    cpr: '#e08a3c',
    sinus: '#5cbf62',
    stemi: '#e8c343',
    vt: '#e03b31',
    vf: '#e03b31',
    pea: '#e8c343',
    asystole: '#e03b31',
}

/** Rhythms that make a noise. VF has no organised beat to beep on. */
const AUDIBLE: ReadonlySet<Trace> = new Set<Trace>(['sinus', 'stemi', 'pea', 'cpr'])

function beatWidth(p: Patient): number {
    if (p.cprActive && p.cardiacArrest) return clamp(9000 / CPR_RATE, 40, 260)
    if (p.rhythm === 'vf') return 44
    if (p.rhythm === 'vt') return 52
    if (p.rhythm === 'asystole') return 200
    return clamp(9000 / Math.max(p.hr, 30), 62, 260)
}

function traceLabel(p: Patient): string {
    if (p.cprActive && p.cardiacArrest) return 'CPR — COMPRESSION ARTEFACT'
    if (p.rhythm === 'asystole') return 'ASYSTOLE'
    if (p.rhythm === 'vf') return 'VF — SHOCKABLE'
    if (p.rhythm === 'vt') return 'VT — SHOCKABLE'
    if (p.rhythm === 'pea') return 'PEA — NO PULSE'
    if (p.rhythm === 'stemi') return 'ST ELEVATION'
    return 'LEAD II'
}

/**
 * The waveform, as a height in roughly -0.4 to 1.0 at a point through the beat.
 *
 * `x` is the absolute position along the trace, which only the disorganised
 * rhythms need: fibrillation has no beat to be a fraction of, so it is sampled
 * from position instead.
 */
function sample(r: Trace, t: number, x: number): number {
    switch (r) {
        case 'cpr':
            // Not a rhythm — the chest moving. Broad, blunt and far too
            // regular to be a heart, which is exactly how it reads on a real
            // monitor and exactly why you stop to check underneath it.
            return t < 0.55
                ? Math.sin(t / 0.55 * Math.PI) * 0.62
                : Math.sin(x * 0.3) * 0.03

        case 'asystole':
            // Not perfectly flat. A real flatline still has the patient in it.
            return Math.sin(x * 0.08) * 0.012

        case 'vf':
            // Chaotic and coarse: several detuned waves beating against each
            // other so no two screens-full look alike.
            return (Math.sin(x * 0.22) * 0.34 + Math.sin(x * 0.51 + 1.1) * 0.22
                + Math.sin(x * 0.13 + 2.3) * 0.18) * (0.85 + Math.sin(x * 0.03) * 0.3)

        case 'vt': {
            // Wide, regular, monomorphic — the sine-wave look.
            const a = Math.sin(t * Math.PI * 2)
            return a * 0.72
        }

        case 'pea':
            // Organised and unremarkable. That is the whole trap: it looks like
            // a rhythm you could leave alone.
            return qrs(t) * 0.8

        case 'stemi': {
            // Tombstones: the ST segment lifts into a broad dome that runs
            // straight out of the R wave instead of coming back to baseline.
            const base = qrs(t)
            if (t >= 0.23 && t < 0.62) {
                const u = (t - 0.23) / 0.39
                return 0.30 + Math.sin(u * Math.PI) * 0.42
            }
            return base
        }

        default:
            return qrs(t)
    }
}

/** A textbook PQRST complex over one beat. */
function qrs(t: number): number {
    if (t < 0.10) return Math.sin(t / 0.10 * Math.PI) * 0.14              // P
    if (t < 0.16) return 0
    if (t < 0.19) return -0.12 * ((t - 0.16) / 0.03)                      // Q
    if (t < 0.23) return 1.0 * ((t - 0.19) / 0.04) - 0.12                 // R
    if (t < 0.27) return 0.88 - 1.25 * ((t - 0.23) / 0.04)                // S
    if (t < 0.32) return -0.37 + 0.37 * ((t - 0.27) / 0.05)
    if (t < 0.55) return Math.sin((t - 0.32) / 0.23 * Math.PI) * 0.26     // T
    return 0
}

/* ---------- triage card --------------------------------------------------- */

const TRI_CLASS: Record<Exclude<Triage, 'none'>, string> = {
    minor: s.triMinor, delayed: s.triDelayed, immediate: s.triImmediate, deceased: s.triDeceased,
}

function TriageCard({ patient: p, note, setNote, onTriage, onNote, onPatch }: {
    patient: Patient
    note: string
    setNote: (v: string) => void
    onTriage: (t: Triage) => void
    onNote: (text: string) => void
    onPatch: (fields: Partial<Patient>) => void
}) {
    return (
        <>
            <div className={s.sectlabel}>Triage Category</div>
            <div className={s.triagerow}>
                {(['minor', 'delayed', 'immediate', 'deceased'] as const).map(k => (
                    <button
                        key={k}
                        type='button'
                        className={`${s.tri} ${TRI_CLASS[k]} ${p.triage === k ? s.triOn : ''}`}
                        aria-pressed={p.triage === k}
                        onClick={() => onTriage(k)}
                    >
                        {k.toUpperCase()}
                    </button>
                ))}
            </div>

            <div className={s.sectlabel}>Card Details</div>
            <div className={s.cardfield}>
                <label htmlFor='hzn-rank'>RANK</label>
                <input id='hzn-rank' value={p.rank} onChange={e => onPatch({ rank: e.target.value })} placeholder='—' />
            </div>
            <div className={s.cardfield}>
                <label htmlFor='hzn-name'>NAME</label>
                <input id='hzn-name' value={p.name} onChange={e => onPatch({ name: e.target.value })} />
            </div>
            <div className={s.cardfield}>
                <label htmlFor='hzn-cs'>CALLSIGN</label>
                <input id='hzn-cs' value={p.callsign} onChange={e => onPatch({ callsign: e.target.value })} placeholder='none' />
            </div>
            <div className={s.cardfield}>
                <label htmlFor='hzn-unit'>ELEMENT</label>
                <input id='hzn-unit' readOnly value={p.unit} />
            </div>
            <div className={s.cardfield}>
                <label htmlFor='hzn-bt'>BLOOD TYPE</label>
                <input id='hzn-bt' readOnly value={p.bloodTypeKnown ? p.bloodType : 'UNKNOWN — run test'} />
            </div>
            <div className={s.cardfield}>
                <label htmlFor='hzn-note'>NOTE</label>
                <input
                    id='hzn-note'
                    value={note}
                    placeholder='add a note, press Enter'
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && note.trim()) { onNote(note.trim()); setNote('') }
                    }}
                />
            </div>

            <div className={s.sectlabel}>Card Entries</div>
            {p.triageEntries.length === 0
                ? <div className={s.hint}>No entries on this triage card.</div>
                : p.triageEntries.map((e, i) => (
                    <div key={i} className={s.logline}><span className={s.t}>{e.stamp}</span><b>{e.text}</b></div>
                ))}
        </>
    )
}

/* ---------- quick view ---------------------------------------------------- */

function QuickView({ patient: p }: { patient: Patient }) {
    const bleeding = totalBleed(p) > 0
    const wounds = Object.values(p.parts).reduce((a, pt) => a + pt.wounds.length, 0)
    const open = Object.values(p.parts).reduce((a, pt) => a + pt.wounds.filter(w => !w.bandaged).length, 0)
    const fx = Object.values(p.parts).filter(pt => pt.fractured).length
    const triCls = { minor: s.chipG, delayed: s.chipY, immediate: s.chipR, deceased: '', none: s.chipB }[p.triage]

    return (
        <div className={s.qvgrid}>
            <div className={s.qv}>
                <div className={s.k}>STATUS</div>
                <div className={s.v} style={{ color: p.cardiacArrest ? 'var(--red)' : bleeding ? 'var(--yellow)' : 'var(--green)' }}>
                    {p.cardiacArrest ? 'ARREST' : bleeding ? 'BLEEDING' : 'STABLE'}
                </div>
            </div>
            <div className={s.qv}><div className={s.k}>BLOOD VOL</div><div className={s.v}>{Math.round(p.blood)}%</div></div>
            <div className={s.qv}><div className={s.k}>PAIN</div><div className={s.v}>{Math.round(p.pain)}%</div></div>
            <div className={s.qv}><div className={s.k}>WOUNDS</div><div className={s.v}>{open} open / {wounds}</div></div>
            <div className={s.qv}><div className={s.k}>FRACTURES</div><div className={s.v}>{fx}</div></div>
            <div className={s.qv}><div className={s.k}>TOURNIQUETS</div><div className={s.v}>{p.tqCount}</div></div>
            <div className={`${s.qv} ${s.qvfull}`}>
                <div className={s.k}>TRIAGE / BLOOD TYPE / AIRWAY</div>
                <div className={s.chips}>
                    <span className={`${s.chip} ${triCls}`}>{p.triage === 'none' ? 'UNTAGGED' : p.triage.toUpperCase()}</span>
                    <span className={`${s.chip} ${s.chipB}`}>{p.bloodTypeKnown ? p.bloodType : 'BLOOD TYPE UNKNOWN'}</span>
                    <span className={`${s.chip} ${p.cardiacArrest ? s.chipR : p.rhythm === 'stemi' ? s.chipY : s.chipG}`}>
                        {RHYTHM_LABEL[p.rhythm].toUpperCase()}
                    </span>
                    <span className={`${s.chip} ${!p.airwayChecked ? s.chipB : airwayOpen(p) ? s.chipG : s.chipR}`}>
                        {!p.airwayChecked ? 'AIRWAY UNKNOWN' : airwayOpen(p) ? 'AIRWAY CLEAR' : 'AIRWAY BLOCKED'}
                    </span>
                    {p.meds.length > 0 && <span className={`${s.chip} ${s.chipY}`}>{p.meds.length}× MEDS GIVEN</span>}
                </div>
            </div>
        </div>
    )
}
