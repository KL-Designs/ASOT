'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    ACTIONS, TOOLS, TOOL_SEPS, actionTime, simulate,
    type Action, type ActionRow, type LogKind, type ToolId,
} from './actions'
import {
    DIFFICULTIES, FALLBACK_CASUALTY, PARTS, WOUND_TYPES,
    bloodWord, clamp, handover, jitter, newPatient, painWord, partBleeding, partSeverity, pName,
    stampFrom, totalBleed,
    type Casualty, type Difficulty, type PartId, type Patient, type Triage,
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
            setClock(stampFrom(t0.current, now))

            const next = structuredClone(live.current)
            const event = simulate(next, dt)
            commit(next)
            if (event) {
                pushLog(event[0], event[1])
                pushToast('CARDIAC ARREST')
            }
        }, 250)
        return () => clearInterval(id)
    }, [commit, pushLog, pushToast])

    /* ---------- running a treatment --------------------------------------- */

    /** Applies the treatment. Called when the timer runs out, not on click. */
    function applyAction(a: Action) {
        const next = structuredClone(live.current)
        const [msg, kind] = a.run(next, sel)
        if (sel && a.needsPart) next.parts[sel].checked = true
        commit(next)
        if (msg) { pushLog(msg, kind); pushToast(msg) }
    }

    function startAction(a: Action) {
        if (busy) return
        const seconds = actionTime(tool, a)
        if (seconds <= 0) { applyAction(a); return }

        setBusy({ label: a.label, seconds })
        pushLog(`${a.label} — started`, '')
        busyTimer.current = setTimeout(() => {
            busyTimer.current = null
            setBusy(null)
            applyAction(a)
        }, seconds * 1000)
    }

    function cancelAction() {
        if (!busy) return
        if (busyTimer.current) clearTimeout(busyTimer.current)
        busyTimer.current = null
        pushLog(`${busy.label} — interrupted`, 'warn')
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
                                    (ACTIONS[tool] as ActionRow[]).map((row, i) =>
                                        row.sec !== undefined
                                            ? <div key={`s${i}`} className={s.sectlabel}>{row.sec}</div>
                                            : (
                                                <button
                                                    key={row.id}
                                                    type='button'
                                                    className={s.trow}
                                                    disabled={!!busy || (row.needsPart && !sel)}
                                                    onClick={() => startAction(row)}
                                                >
                                                    <span className={`${s.dot} ${row.dot ? DOT_CLASS[row.dot] : ''}`} />
                                                    <span>{row.label}</span>
                                                    <span className={s.qty}>
                                                        {row.needsPart && !sel
                                                            ? 'SELECT A LIMB'
                                                            : [row.note, `${actionTime(tool, row)}s`].filter(Boolean).join(' · ')}
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
                                <span><i style={{ background: '#8fd0f5' }} />Controlled</span>
                                <span><i style={{ background: '#d2352c', borderRadius: '50%' }} />Fracture</span>
                            </div>
                        </div>

                        {/* ---- overview ---- */}
                        <div className={`${s.col} ${s.colOverview}`}>
                            <div className={s.colhead}>OVERVIEW</div>
                            <div className={s.panel}>
                                {patient.cardiacArrest && <div className={`${s.ovline} ${s.ovlineRed}`}>CARDIAC ARREST</div>}
                                {bleeding && <div className={`${s.ovline} ${s.ovlineRed}`}>Bleeding</div>}
                                {bw && <div className={`${s.ovline} ${bcls === 'red' ? s.ovlineRed : s.ovlineYel}`}>{bw}</div>}
                                {pw && <div className={s.ovline}>{pw}</div>}
                                {patient.tqCount > 0 && (
                                    <div className={`${s.ovline} ${s.ovlineYel}`}>{patient.tqCount}× Tourniquet applied</div>
                                )}
                                {!bleeding && !bw && !pw && !patient.cardiacArrest && (
                                    <div className={`${s.ovline} ${s.ovlineDim}`}>No apparent injuries.</div>
                                )}

                                <Vitals patient={patient} />
                                <Ecg patient={patient} />
                                <div className={s.bloodbar}><i style={{ width: `${patient.blood}%` }} /></div>

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
                                            {pt.wounds.map((w, i) => (
                                                <div key={i} className={`${s.ovsub} ${w.bandaged ? s.ovsubB : ''}`}>
                                                    {w.bandaged ? '[B] ' : ''}{w.n}× {WOUND_TYPES[w.t].name}
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

                                {patient.airway !== 'clear' && (
                                    <div className={s.ovpart}>
                                        <h4>Airway</h4>
                                        <div className={s.ovsub}>{patient.airway} in situ</div>
                                    </div>
                                )}
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
    return (
        <div className={s.vitals}>
            {cell('HR', p.cardiacArrest ? '0' : jitter(p.hr, 2), 'bpm',
                p.hr > 120 || p.hr < 50 || p.cardiacArrest ? s.vitCrit : p.hr > 100 ? s.vitWarn : '')}
            {cell('BP', p.cardiacArrest ? '0/0' : `${jitter(p.sysBp, 3)}/${jitter(p.diaBp, 2)}`, 'mmHg',
                p.sysBp < 90 ? s.vitCrit : p.sysBp < 105 ? s.vitWarn : '')}
            {cell('SpO₂', p.cardiacArrest ? '--' : jitter(p.spo2, 1), '%',
                p.spo2 < 90 ? s.vitCrit : p.spo2 < 95 ? s.vitWarn : '')}
            {cell('RR', p.cardiacArrest ? '0' : jitter(p.rr, 1), '/min',
                p.rr > 24 || p.rr < 8 ? s.vitWarn : '')}
            {cell('TEMP', p.temp.toFixed(1), '°C', p.temp < 35.5 ? s.vitWarn : '')}
            {cell('BLOOD', Math.round(p.blood), '%',
                p.blood < 55 ? s.vitCrit : p.blood < 75 ? s.vitWarn : '')}
        </div>
    )
}

/* ---------- ECG ----------------------------------------------------------- */

/**
 * Lead II, drawn from the heart rate.
 *
 * The trace runs on its own animation frame rather than React state — it
 * repaints at 60fps and nothing else on screen needs to know about it.
 */
function Ecg({ patient }: { patient: Patient }) {
    const ref = useRef<HTMLCanvasElement>(null)
    const live = useRef(patient)
    live.current = patient

    useEffect(() => {
        let frame = 0
        let phase = 0
        let last = performance.now()

        const draw = (now: number) => {
            frame = requestAnimationFrame(draw)
            phase += (now - last) * 0.09
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

            ctx.strokeStyle = p.cardiacArrest ? '#e03b31' : (p.hr > 120 ? '#e8c343' : '#5cbf62')
            ctx.lineWidth = 2
            ctx.beginPath()
            const mid = H * 0.58

            if (p.cardiacArrest && !p.cprActive) {
                ctx.moveTo(0, mid); ctx.lineTo(W, mid)   // flatline
            } else {
                const beatW = clamp(9000 / Math.max(p.hr, 30), 62, 260)
                for (let x = 0; x < W; x++) {
                    const t = ((x + phase) % beatW) / beatW
                    let y = 0
                    if (t < 0.10) y = Math.sin(t / 0.10 * Math.PI) * 0.14              // P
                    else if (t < 0.16) y = 0
                    else if (t < 0.19) y = -0.12 * ((t - 0.16) / 0.03)                 // Q
                    else if (t < 0.23) y = 1.0 * ((t - 0.19) / 0.04) - 0.12            // R
                    else if (t < 0.27) y = 0.88 - 1.25 * ((t - 0.23) / 0.04)           // S
                    else if (t < 0.32) y = -0.37 + 0.37 * ((t - 0.27) / 0.05)
                    else if (t < 0.55) y = Math.sin((t - 0.32) / 0.23 * Math.PI) * 0.26 // T
                    y += (Math.random() - 0.5) * 0.02
                    const py = mid - y * (H * 0.42)
                    if (x === 0) ctx.moveTo(0, py); else ctx.lineTo(x, py)
                }
            }
            ctx.stroke()

            ctx.fillStyle = 'rgba(255,255,255,.5)'
            ctx.font = '11px sans-serif'
            ctx.fillText(p.cardiacArrest ? (p.cprActive ? 'CPR — COMPRESSIONS' : 'ASYSTOLE') : 'LEAD II', 8, 14)
        }

        frame = requestAnimationFrame(draw)
        return () => cancelAnimationFrame(frame)
    }, [])

    return <canvas ref={ref} className={s.ecg} width={600} height={112} />
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
    const wounds = Object.values(p.parts).reduce((a, pt) => a + pt.wounds.reduce((b, w) => b + w.n, 0), 0)
    const open = Object.values(p.parts).reduce((a, pt) => a + pt.wounds.filter(w => !w.bandaged).reduce((b, w) => b + w.n, 0), 0)
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
                    <span className={s.chip}>{p.airway === 'clear' ? 'AIRWAY CLEAR' : p.airway.toUpperCase() + ' SITED'}</span>
                    {p.meds.length > 0 && <span className={`${s.chip} ${s.chipY}`}>{p.meds.length}× MEDS GIVEN</span>}
                </div>
            </div>
        </div>
    )
}
