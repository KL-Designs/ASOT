import React from 'react'
import Pulse from '@/components/ui/Pulse'
import s from '@/styles/dashboard.module.css'

/* ============================================================================
   Status: badges, meters, stat tiles.

   One vocabulary for every state in the app:

     live   green      healthy, active, online
     warn   amber      upcoming, warning, dev-mode engaged
     alert  red        needs action, or destructive
     info   blue-grey  neutral or informational
     muted  grey       inactive, archived, absent

   Ranks currently print in red at ~12px in the members and department tables,
   which is the least readable combination available on a near-black page. They
   become badges, tiered by colour, so a roster can be scanned by rank without
   reading every line.
   ========================================================================== */

export type Tone = 'live' | 'warn' | 'alert' | 'info' | 'muted'

const TONES: Record<Tone, string> = {
    live: s.badgeLive,
    warn: s.badgeWarn,
    alert: s.badgeAlert,
    info: s.badgeInfo,
    muted: s.badgeMuted,
}

export function Badge({ tone = 'muted', dot = false, live = false, small = false, className = '', children }: {
    tone?: Tone
    /** A static dot in the badge's own colour. */
    dot?: boolean
    /** A pinging dot — for something happening *now*, not merely current. */
    live?: boolean
    small?: boolean
    className?: string
    children: React.ReactNode
}) {
    return (
        <span className={[s.badge, TONES[tone], small ? s.badgeSm : '', className].filter(Boolean).join(' ')}>
            {live ? <Pulse tone={tone === 'warn' ? 'amber' : tone === 'live' ? 'live' : 'idle'} /> : dot ? <i className={s.bdot} /> : null}
            {children}
        </span>
    )
}

/* ---------- meter --------------------------------------------------------- */

/**
 * Progress toward a target.
 *
 * The most ASOT-specific component in the kit — one shape covers promotion
 * points, operation sign-on and course completion. The figure leads and the bar
 * follows, because a bar alone cannot be read precisely and "290 / 451" is the
 * thing a member is actually after.
 */
export function Meter({ value, target, unit, remaining, ticks, className = '' }: {
    value: number
    target: number
    /** e.g. "billet points", "signed on". Printed after the target. */
    unit?: React.ReactNode
    /** Right-aligned callout — "129 to go", "Medic · 3 needed". */
    remaining?: React.ReactNode
    /** Small labels under the bar. Two reads as from/to; more reads as a scale. */
    ticks?: React.ReactNode[]
    className?: string
}) {
    // A target of zero is a real state (an operation with no platoons assigned
    // yet) and must not divide.
    const pct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0

    return (
        <div className={`${s.meter} ${className}`} style={{ ['--pct' as string]: `${pct}%` }}>
            <div className={s.meterTop}>
                <span className={s.now}>{value.toLocaleString('en-AU')}</span>
                <span className={s.goal}>/ {target.toLocaleString('en-AU')}{unit ? <> {unit}</> : null}</span>
                {remaining && <span className={s.to}>{remaining}</span>}
            </div>
            <div className={s.track}><i /></div>
            {ticks && ticks.length > 0 && (
                <div className={s.ticks}>{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
            )}
        </div>
    )
}

/* ---------- stat tiles ---------------------------------------------------- */

/** Hairline-separated, so a row reads as one instrument rather than three cards. */
export const Stats = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <div className={`${s.stats} ${className}`}>{children}</div>

export function Stat({ label, value, unit, delta, trend, accent = false, small = false }: {
    label: React.ReactNode
    value: React.ReactNode
    /** Rendered smaller and tight against the value — "%", "pts". */
    unit?: React.ReactNode
    /** Optional line under the figure. Say the period, not just the number. */
    delta?: React.ReactNode
    /** Colours the delta. Omit when a change is neither good nor bad. */
    trend?: 'up' | 'down'
    accent?: boolean
    /** For a value that is a date or a word rather than a figure. */
    small?: boolean
}) {
    return (
        <div className={[s.stat, accent ? s.statAccent : '', small ? s.statSmall : ''].filter(Boolean).join(' ')}>
            <div className={s.l}>{label}</div>
            <div className={s.v}>{value}{unit && <span className={s.u}>{unit}</span>}</div>
            {delta && (
                <div className={`${s.d} ${trend === 'up' ? s.statUp : trend === 'down' ? s.statDown : ''}`}>{delta}</div>
            )}
        </div>
    )
}
