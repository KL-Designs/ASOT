import React from 'react'
import s from '@/styles/dashboard.module.css'

/* ============================================================================
   Surfaces and page scaffolding.

   The headline change of the dashboard redesign lives in `Panel`: containers
   are a hairline on a surface scale, not a red outline. A panel takes a
   coloured edge only when its own *state* warrants one, and then as an inset
   bar rather than a full border — so the flag reads as a flag instead of
   turning the container into the alert.
   ========================================================================== */

export type PanelTone = 'default' | 'alert' | 'live' | 'warn'

const TONES: Record<PanelTone, string> = {
    default: '',
    alert: s.panelAlert,
    live: s.panelLive,
    warn: s.panelWarn,
}

export function Panel({ tone = 'default', sunken = false, className = '', children, ...rest }: {
    tone?: PanelTone
    /** For a panel that should sit *below* the page rather than on it. */
    sunken?: boolean
    className?: string
    children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={[s.panel, TONES[tone], sunken ? s.panelSunken : '', className].filter(Boolean).join(' ')} {...rest}>
            {children}
        </div>
    )
}

/**
 * `right` is pinned to the far end of the header, which is where every action,
 * count and status badge on the dashboard belongs — the alternative is each
 * screen inventing its own `margin-left: auto`.
 */
export function PanelHeader({ title, sub, before, right, children, className = '' }: {
    title?: React.ReactNode
    sub?: React.ReactNode
    /** Ahead of the title — a status badge that qualifies the whole panel. */
    before?: React.ReactNode
    right?: React.ReactNode
    children?: React.ReactNode
    className?: string
}) {
    return (
        <div className={`${s.panelH} ${className}`}>
            {before}
            {title && <span className={s.t}>{title}</span>}
            {sub && <span className={s.sub}>{sub}</span>}
            {children}
            {right && <span className={s.r}>{right}</span>}
        </div>
    )
}

export function PanelBody({ flush = false, className = '', children, ...rest }: {
    /** For a body that holds rows or a table, which bring their own padding. */
    flush?: boolean
    className?: string
    children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={[s.panelB, flush ? s.panelBFlush : '', className].filter(Boolean).join(' ')} {...rest}>
            {children}
        </div>
    )
}

export function PanelFooter({ right, children, className = '' }: {
    right?: React.ReactNode
    children?: React.ReactNode
    className?: string
}) {
    return (
        <div className={`${s.panelF} ${className}`}>
            {children}
            {right && <span className={s.r}>{right}</span>}
        </div>
    )
}

/**
 * The `// SECTION` rule.
 *
 * The dashboard already leads its blocks with `// FAVOURITES` in mono; this
 * keeps that voice and makes it legible — the slashes become a red tick, the
 * label gets contrast, and the rule runs out to whatever sits on the right.
 */
export function SectionLabel({ children, right }: {
    children: React.ReactNode
    right?: React.ReactNode
}) {
    return (
        <div className={s.seclabel}>
            <span className={s.k}>{children}</span>
            <span className={s.line} />
            {right && <span className={s.r}>{right}</span>}
        </div>
    )
}

export function PageHead({ kicker, title, right, children }: {
    kicker?: React.ReactNode
    title: React.ReactNode
    right?: React.ReactNode
    /** Replaces the kicker/title pair outright — for a head with an avatar. */
    children?: React.ReactNode
}) {
    return (
        <div className={s.pagehead}>
            {children ?? (
                <div>
                    {kicker && <div className={s.k}>{kicker}</div>}
                    <h2>{title}</h2>
                </div>
            )}
            {right && <div className={s.r}>{right}</div>}
        </div>
    )
}

/* ---------- grids --------------------------------------------------------- */

/** Main column against a right rail. Collapses to one column under 1240px. */
export const Grid2 = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <div className={`${s.grid2} ${className}`}>{children}</div>

export const Grid3 = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <div className={`${s.grid3} ${className}`}>{children}</div>

/** A column of panels at the standard gap. */
export const Stack = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <div className={`${s.stack} ${className}`}>{children}</div>
