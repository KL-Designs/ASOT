import type { CSSProperties } from 'react'

/**
 * The control vocabulary the schedule inspectors share.
 *
 * These were duplicated verbatim across RsvpWindowPanel and PreProductionPanel
 * — same mono caps, same 1px hairline, same `var(--r)` — and drifted by a
 * pixel or two between them. One definition, imported by every inspector.
 */

export const btn: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    border: '1px solid var(--line-2)', background: 'var(--s2)',
    borderRadius: 'var(--r)', padding: '6px 11px',
    fontFamily: 'var(--mono)', fontSize: 10.5,
    letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--ink-2)', cursor: 'pointer',
}

export function btnTone(tone: 'acc' | 'good' | 'crit' | 'ghost'): CSSProperties {
    if (tone === 'ghost') return { ...btn, borderStyle: 'dashed', color: 'var(--ink-3)' }
    const c = tone === 'acc' ? 'var(--acc)' : tone === 'good' ? 'var(--good)' : 'var(--crit)'
    return { ...btn, borderColor: c, color: c }
}

/** The selected half of a two-way pill pair. */
export function pill(active: boolean): CSSProperties {
    return {
        ...btn,
        flex: '1 1 0',
        background: active ? 'rgba(var(--acc-rgb), 0.18)' : 'var(--s2)',
        color: active ? 'var(--ink)' : 'var(--ink-2)',
    }
}

export const label: CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700,
    letterSpacing: '0.17em', textTransform: 'uppercase', color: 'var(--ink-3)',
}

export const selectStyle: CSSProperties = {
    ...btn, width: '100%', justifyContent: 'flex-start', appearance: 'none',
}

export const field: CSSProperties = {
    width: '100%', background: 'var(--s2)', border: '1px solid var(--line-2)',
    borderRadius: 'var(--r)', color: 'var(--ink)', fontSize: '0.8rem',
    padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
}

export const pickerSx = {
    width: '100%',
    '& .MuiInputBase-root': {
        background: 'var(--s2)',
        borderRadius: 'var(--r)',
        fontFamily: 'var(--mono)',
        fontSize: 13,
    },
    '& .MuiOutlinedInput-notchedOutline': { border: '1px solid var(--line-2)' },
    '& .MuiInputBase-input': { color: 'var(--ink-2)', padding: '6px 10px' },
    '& .MuiSvgIcon-root': { color: 'var(--ink-3)', fontSize: 16 },
}

/** Same picker, outlined in the critical tone — for a value that is out of order. */
export const pickerSxInvalid = {
    ...pickerSx,
    '& .MuiOutlinedInput-notchedOutline': { border: '1px solid var(--crit)' },
    '& .MuiInputBase-input': { color: 'var(--crit)', padding: '6px 10px' },
}

export function chip(tone?: 'warn' | 'crit' | 'good' | 'acc'): CSSProperties {
    const c = tone === 'warn' ? 'var(--warn)'
        : tone === 'crit' ? 'var(--crit)'
        : tone === 'good' ? 'var(--good)'
        : tone === 'acc' ? 'var(--acc)'
        : 'var(--ink-3)'
    return {
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.13em', textTransform: 'uppercase',
        padding: '2px 7px', borderRadius: 2,
        border: `1px solid ${tone ? c : 'var(--line-2)'}`, color: c,
        whiteSpace: 'nowrap',
    }
}
