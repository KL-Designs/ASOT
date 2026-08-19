'use client'

import React from 'react'
import Link from 'next/link'
import { CheckBold, ChevronDown, Minus, Plus } from './icons'
import s from '@/styles/dashboard.module.css'

/* ============================================================================
   Controls: buttons, chips, switches, fields, steppers.

   Four button volumes plus a separate destructive track. The rule that makes
   the set work: **one primary per view**, and destructive stays outlined until
   hover. Today every REMOVE on the J7 members table is a filled red button
   repeated fourteen times down the page, which is how a destructive action ends
   up looking like the default one.
   ========================================================================== */

export type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'link' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
    primary: s.btnPrimary,
    ghost: s.btnGhost,
    subtle: s.btnSubtle,
    link: s.btnLink,
    danger: s.btnDanger,
}

type ButtonCommon = {
    variant?: ButtonVariant
    size?: 'sm' | 'md' | 'lg'
    /** Square, for a lone icon. Give it an `aria-label`. */
    icon?: boolean
    disabled?: boolean
    className?: string
    children?: React.ReactNode
}

type ButtonProps = ButtonCommon & (
    | ({ href: string, external?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonCommon | 'href'>)
    | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonCommon>)
)

export function Button({
    variant = 'ghost', size = 'md', icon = false, disabled = false, className = '', children, ...rest
}: ButtonProps) {
    const classes = [
        s.btn,
        VARIANTS[variant],
        size === 'sm' ? s.btnSm : size === 'lg' ? s.btnLg : '',
        icon ? s.btnIcon : '',
        disabled ? s.btnDisabled : '',
        className,
    ].filter(Boolean).join(' ')

    // A disabled link is not a thing HTML has — an <a> stays focusable and
    // still navigates on Enter — so the element changes rather than the styling.
    if (disabled) {
        const { href: _h, external: _e, ...safe } = rest as Record<string, unknown>
        return <button type='button' disabled className={classes} {...safe as React.ButtonHTMLAttributes<HTMLButtonElement>}>{children}</button>
    }

    if ('href' in rest && rest.href) {
        const { href, external, ...anchor } = rest as { href: string, external?: boolean } & React.AnchorHTMLAttributes<HTMLAnchorElement>
        if (external || anchor.download != null) return (
            <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={classes} {...anchor}>
                {children}
            </a>
        )
        return <Link href={href as any} className={classes} {...anchor}>{children}</Link>
    }

    return <button type='button' className={classes} {...rest as React.ButtonHTMLAttributes<HTMLButtonElement>}>{children}</button>
}

/* ---------- chip ---------------------------------------------------------- */

/**
 * A toggle that *is* the input.
 *
 * The billet form currently lists awards as a paragraph of running text acting
 * as a legend — "Unit Proficiency +10 Campaign Medallion +3 1 Year Service
 * +15…" — beside a separate set of fields. Here the legend and the control are
 * the same object, so there is nothing to cross-reference.
 */
export function Chip({ on = false, tone = 'info', readOnly = false, className = '', children, ...rest }: {
    on?: boolean
    /** What the "on" state means: neutral, an award, or a healthy flag. */
    tone?: 'info' | 'amber' | 'live'
    /**
     * Renders a span rather than a button. For a chip that reports rather than
     * toggles — the points an award already contributes, say. A button nobody
     * can press still takes focus, and that is a lie told with the keyboard.
     */
    readOnly?: boolean
    className?: string
    children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
    const toneClass = tone === 'amber' ? s.chipAmber : tone === 'live' ? s.chipLive : ''
    const classes = [s.chip, on ? s.chipOn : '', toneClass, className].filter(Boolean).join(' ')

    if (readOnly) return <span className={classes}>{on && <CheckBold />}{children}</span>

    return (
        <button
            type='button'
            aria-pressed={on}
            className={classes}
            {...rest}
        >
            {on && <CheckBold />}
            {children}
        </button>
    )
}

export const ChipRow = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <div className={`${s.chipRow} ${className}`}>{children}</div>

/* ---------- switch -------------------------------------------------------- */

/** For a setting that takes effect immediately — dev modes, feature flags. */
export function Switch({ on, onChange, label }: {
    on: boolean
    onChange: (next: boolean) => void
    /** Required: the track carries no text of its own. */
    label: string
}) {
    return (
        <button
            type='button'
            role='switch'
            aria-checked={on}
            aria-label={label}
            className={`${s.sw} ${on ? s.swOn : ''}`}
            onClick={() => onChange(!on)}
        >
            <i />
        </button>
    )
}

/* ---------- fields -------------------------------------------------------- */

export function Field({ label, hint, children, className = '' }: {
    label?: React.ReactNode
    hint?: React.ReactNode
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`${s.field} ${className}`}>
            {label && <label>{label}</label>}
            {children}
            {hint && <span className={s.hint}>{hint}</span>}
        </div>
    )
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    function Input({ className = '', ...rest }, ref) {
        return <input ref={ref} className={`${s.inp} ${className}`} {...rest} />
    })

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    function Textarea({ className = '', ...rest }, ref) {
        return <textarea ref={ref} className={`${s.inp} ${className}`} {...rest} />
    })

/** Native `<select>` under a drawn chevron — the platform picker is kept,
    which no custom dropdown matches on touch. */
export function Select({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <div className={`${s.sel} ${className}`}>
            <select className={s.inp} {...rest}>{children}</select>
            <span className={s.cv}><ChevronDown /></span>
        </div>
    )
}

/* ---------- stepper ------------------------------------------------------- */

/**
 * A counter you nudge.
 *
 * Replaces the unlabelled zero fields on the billet form. Those numbers are
 * small integers — attendance counts, training sessions — and a bare text box
 * containing "0" gives no hint which of the two it wants.
 */
export function Stepper({ value, onChange, min = 0, max, label }: {
    value: number
    onChange: (next: number) => void
    min?: number
    max?: number
    label: string
}) {
    const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, n))
    return (
        <div className={`${s.stepper} ${value === 0 ? s.stepperZero : ''}`}>
            <button type='button' onClick={() => onChange(clamp(value - 1))} aria-label={`Decrease ${label}`}><Minus /></button>
            <input
                value={value}
                inputMode='numeric'
                aria-label={label}
                onChange={e => onChange(clamp(parseInt(e.target.value, 10) || 0))}
            />
            <button type='button' onClick={() => onChange(clamp(value + 1))} aria-label={`Increase ${label}`}><Plus /></button>
        </div>
    )
}

/**
 * One line of the billet points form: what it is, how many, what it is worth.
 *
 * `locked` is for the rows the system counts itself — attendance is derived
 * from the operations record, so showing a stepper there would imply an edit
 * that isn't possible.
 */
export function PointsLine({ label, note, value, points, locked = false, multiplier }: {
    label: React.ReactNode
    note?: React.ReactNode
    /** The stepper's state. Omitted on a locked line. */
    value?: { count: number, onChange: (n: number) => void }
    /** The contribution, already computed. Null renders an em dash. */
    points: number | null
    locked?: boolean
    /** e.g. "×2" — shown instead of a stepper on auto-counted lines. */
    multiplier?: string
}) {
    return (
        <div className={`${s.pline} ${locked ? s.plineLocked : ''}`}>
            <span className={s.l}>
                {label}
                {note && <small>{note}</small>}
            </span>
            {multiplier && <span className={s.hint}>{multiplier}</span>}
            {value && <Stepper value={value.count} onChange={value.onChange} label={typeof label === 'string' ? label : 'count'} />}
            <span className={`${s.v} ${points ? s.pos : ''}`}>{points ? `+${points}` : '—'}</span>
        </div>
    )
}
