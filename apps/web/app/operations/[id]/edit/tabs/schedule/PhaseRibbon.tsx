'use client'

import { fmtDuration, phaseOffsets, type PhaseId, type Ribbon } from '@/lib/operations/phases'
import s from './ribbon.module.css'

interface Props {
    ribbon: Ribbon
    selected: PhaseId
    onSelect: (id: PhaseId) => void
    /** Same clock `buildRibbon` was given, so the flag and the line agree. */
    now: Date
}

/**
 * The operation's whole life as one horizontal ribbon.
 *
 * Replaces the three separate diagrams the Schedule tab used to draw — the
 * pre-production node rail, the five RSVP columns and the six stage segments —
 * which were three idioms at three scales for one continuous line, and never
 * said so.
 *
 * Two rules govern what goes where, and they encode a real distinction rather
 * than a layout preference: **transitions sit above the ribbon** (they are the
 * boundaries between phases, and they are the moments that own controls),
 * **milestones hang below it** (they happen inside a phase and change nothing
 * about its shape). That also happens to fix the label collisions the old
 * timeline had, where RSVP closes and the op start were 8% apart and fighting
 * for the same 96px.
 *
 * Width is allocated, not scaled — see PHASE_WIDTHS. Every segment prints its
 * own real duration, which is why no "spacing is not linear" disclaimer is
 * needed: nothing here claims to be linear.
 *
 * This component owns no schedule logic at all. Every number it renders comes
 * from `buildRibbon`, so the ordering rules are tested without a browser.
 */
export default function PhaseRibbon({ ribbon, selected, onSelect, now }: Props) {
    const { phases, boundaries, milestones, nowPct } = ribbon
    const offsets = phaseOffsets(phases)

    const fmtBoundary = (at: Date | null) =>
        at
            ? at.toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit', hour12: false,
            })
            : '—'

    return (
        <div className={s.ribbon}>
            {boundaries.map((b, i) => {
                const edge = i === 0 ? s.first : i === boundaries.length - 1 ? s.last : ''
                const tone = b.kind === 'anchor' ? s.anchor
                    : b.state === 'invalid' ? s.invalid
                    : b.state === 'overdue' ? s.overdue
                    : ''
                return (
                    <div key={b.id} className={`${s.boundary} ${edge} ${tone}`} style={{ left: `${b.atPct}%` }}>
                        <div className={s.bKey}>{b.label}</div>
                        <div className={s.bDate}>{fmtBoundary(b.at)}</div>
                    </div>
                )
            })}

            {boundaries.map(b => {
                const tone = b.kind === 'anchor' ? s.anchor
                    : b.state === 'invalid' ? s.invalid
                    : b.state === 'overdue' ? s.overdue
                    : ''
                return <div key={`t-${b.id}`} className={`${s.tick} ${tone}`} style={{ left: `${b.atPct}%` }} />
            })}

            {phases.map((p, i) => {
                const tone = [
                    p.invalid ? s.invalid : '',
                    p.state === 'spent' ? s.spent : '',
                    p.state === 'current' ? s.current : '',
                    p.id === selected ? s.selected : '',
                ].filter(Boolean).join(' ')
                return (
                    <button
                        key={p.id}
                        type="button"
                        className={`${s.segment} ${tone}`}
                        style={{ left: `${offsets[i]}%`, width: `${p.widthPct}%` }}
                        aria-pressed={p.id === selected}
                        onClick={() => onSelect(p.id)}
                    >
                        <span className={s.segName}>{p.invalid ? '✕ Inverted' : p.label}</span>
                        <span className={s.segDur}>
                            {p.durationMs === null && p.id === 'rsvp_window' ? 'manual' : fmtDuration(p.durationMs)}
                        </span>
                    </button>
                )
            })}

            {/* Backwards arrows over an inverted phase: the span runs right to
                left, and saying so is clearer than leaving the hatch to imply it. */}
            {phases.map((p, i) => p.invalid && (
                <div key={`b-${p.id}`} className={s.backwards} style={{ left: `${offsets[i]}%`, width: `${p.widthPct}%` }}>
                    ◄ ◄ ◄
                </div>
            ))}

            {milestones.map(m => {
                const idx = phases.findIndex(p => p.id === m.phaseId)
                const left = offsets[idx] + (m.offsetPct / 100) * phases[idx].widthPct
                return (
                    <div
                        key={m.id}
                        className={`${s.milestone} ${m.state === 'ghost' ? s.ghost : ''}`}
                        style={{ left: `${left}%` }}
                    >
                        <i className={`${s.mDot} ${m.state === 'overdue' ? s.overdue : m.state === 'done' ? s.done : m.state === 'ghost' ? s.ghost : ''}`} />
                        <div className={s.mKey}>{m.label}</div>
                        <div className={s.mDetail}>{m.detail}</div>
                    </div>
                )
            })}

            <div className={s.now} style={{ left: `${nowPct}%` }}>
                <span className={s.nowFlag}>
                    NOW · {now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }).toUpperCase()}
                </span>
            </div>
        </div>
    )
}
