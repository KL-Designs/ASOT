'use client'

import s from './board.module.css'

/**
 * What the coloured edge on each row means.
 *
 * The board leans on colour harder than it otherwise would: rows with someone
 * in them drop their status badge so the member's name has room, which makes
 * the left edge the only thing carrying the state. That is a fair trade only
 * if the key is on screen, so this is not collapsible and not a tooltip.
 *
 * Colours here are fixed, never the operation's accent: --acc is whatever theme
 * colour somebody picked for this operation, so a legend built on it would say
 * "attending" in red on one operation and blue on the next.
 *
 * Grouped by what the reader actually needs to tell apart, not one entry per
 * state — `declined` and `released` share an edge colour and are distinguished
 * by the badge on the empty row, which is where there is room to say it.
 */
const KEYS: { color: string; label: string; meaning: string }[] = [
    { color: 'var(--good, #7fae5c)',       label: 'Attending', meaning: 'confirmed, in their own position' },
    { color: 'var(--ressy, #5f8fc4)',      label: 'Reservist', meaning: 'filling in from another section' },
    { color: 'rgba(212, 160, 58, 0.6)',    label: 'No reply',  meaning: 'reserved for them until sign-ups close' },
    { color: 'rgba(192, 90, 72, 0.45)',    label: 'Vacated',   meaning: 'declined, or playing elsewhere' },
    { color: 'var(--line-2)',              label: 'Open',      meaning: 'never filled' },
]

export default function Legend() {
    return (
        <div className={s.legend}>
            {KEYS.map(k => (
                <span key={k.label} className={s.legendKey} title={k.meaning}>
                    <i style={{ background: k.color }} />
                    <b>{k.label}</b>
                    <span>{k.meaning}</span>
                </span>
            ))}
        </div>
    )
}
