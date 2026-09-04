'use client'

import type { PhaseId, Ribbon } from '@/lib/operations/phases'
import { fmtCountdown } from '@/lib/operations/schedule'
import s from './ribbon.module.css'

interface Props {
    ribbon: Ribbon
    selected: PhaseId
    onSelect: (id: PhaseId) => void
    now: Date
}

/**
 * The five phases as a selector strip under the ribbon.
 *
 * The ribbon's segments are already clickable, but they are 26px tall and some
 * are 13% of the width — fine as a diagram, poor as a control. The strip gives
 * every phase the same generous target and a one-line summary, so the whole
 * timeline stays one click away no matter which phase is open. That is what
 * answers the obvious objection to an inspector-based layout: you read one
 * phase at a time, but you never have to hunt for the others.
 */
export default function PhaseStrip({ ribbon, selected, onSelect, now }: Props) {
    const { phases, gates, window, problems } = ribbon

    const done = gates.filter(g => g.state === 'done').length
    const overdue = gates.filter(g => g.state === 'overdue').length

    function summary(id: PhaseId): string {
        switch (id) {
            case 'pre_production':
                if (!gates.length) return 'no date set'
                return overdue
                    ? `${done} of ${gates.length} · ${overdue} overdue`
                    : `${done} of ${gates.length} complete`
            case 'lead_up': {
                const p = phases.find(x => x.id === 'lead_up')
                if (!p?.endsAt) return '—'
                const left = fmtCountdown(p.endsAt, now)
                return left ? `${left} until sign-ups` : 'passed'
            }
            case 'rsvp_window':
                if (problems.some(p => p.id === 'rsvp_inverted')) return 'inverted'
                if (window.mode === 'unset') return 'no open scheduled'
                if (!window.opensAt) return '—'
                return fmtCountdown(window.opensAt, now)
                    ? `opens in ${fmtCountdown(window.opensAt, now)}`
                    : window.closesAt && fmtCountdown(window.closesAt, now)
                        ? `closes in ${fmtCountdown(window.closesAt, now)}`
                        : 'closed'
            case 'final_hour': {
                const p = phases.find(x => x.id === 'final_hour')
                return p?.durationMs ? `${Math.round(p.durationMs / 60_000)} min window` : '—'
            }
            case 'op_confirmation': {
                const p = phases.find(x => x.id === 'op_confirmation')
                if (!p?.startsAt) return '—'
                return p.state === 'future' ? 'not started'
                    : p.state === 'current' ? 'running' : 'finished'
            }
        }
    }

    return (
        <div className={s.strip}>
            {phases.map(p => (
                <button
                    key={p.id}
                    type="button"
                    className={`${s.stripTab} ${p.id === selected ? s.on : ''} ${p.invalid ? s.err : ''}`}
                    aria-pressed={p.id === selected}
                    onClick={() => onSelect(p.id)}
                >
                    {p.label}
                    <small>{summary(p.id)}</small>
                </button>
            ))}
        </div>
    )
}
