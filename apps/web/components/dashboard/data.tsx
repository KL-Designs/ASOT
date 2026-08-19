import React from 'react'
import Link from 'next/link'
import s from '@/styles/dashboard.module.css'

/* ============================================================================
   Data display: list rows, tables, identity cells, empty states, tabs.
   ========================================================================== */

export type RowState = 'none' | 'live' | 'warn' | 'alert'

const ROW_STATES: Record<RowState, string> = {
    none: '',
    live: s.isLive,
    warn: s.isWarn,
    alert: s.isAlert,
}

/**
 * One row of a list.
 *
 * State lives in a 3px left bar *and* a badge, so a scan down the left edge
 * tells you the condition of everything without reading a word. Actions align
 * right at their own width so they never jump between rows.
 *
 * Renders an `<a>` when given `href`, a `<button>` when given `onClick`, and a
 * plain `<div>` otherwise — a row that does nothing should not be focusable.
 */
export function ListRow({
    state = 'none', lead, title, meta, actions, href, onClick, className = '', children,
}: {
    state?: RowState
    /** Ahead of the title — a badge, a thumbnail, an icon. */
    lead?: React.ReactNode
    title?: React.ReactNode
    /** The mono line under the title. Wrap parts in <span>. */
    meta?: React.ReactNode
    actions?: React.ReactNode
    href?: string
    onClick?: () => void
    className?: string
    /** Replaces title/meta outright for a row that is not name-and-detail. */
    children?: React.ReactNode
}) {
    const classes = [s.lrow, ROW_STATES[state], className].filter(Boolean).join(' ')

    const inner = (
        <>
            <span className={s.lead} />
            {lead}
            {children ?? (
                <span className={s.main}>
                    {title && <span className={s.t}>{title}</span>}
                    {meta && <span className={s.m}>{meta}</span>}
                </span>
            )}
            {actions && <span className={s.acts}>{actions}</span>}
        </>
    )

    if (href) return <Link href={href as any} className={classes}>{inner}</Link>
    if (onClick) return <button type='button' className={classes} onClick={onClick}>{inner}</button>
    return <div className={classes}>{inner}</div>
}

export const Rows = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <div className={`${s.rows} ${className}`}>{children}</div>

/** A cover image, or the gradient placeholder when an operation has none. */
export const Thumb = ({ src, alt = '' }: { src?: string | null, alt?: string }) =>
    <span className={s.thumb}>{src ? <img src={src} alt={alt} loading='lazy' /> : null}</span>

/* ---------- table --------------------------------------------------------- */

/**
 * Sticky header, tabular figures right-aligned, rank as a badge rather than red
 * body text. Wrap in `TableScroll` — a table with more columns than the panel
 * is wide should scroll itself, not the page.
 */
export const Table = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <table className={`${s.dt} ${className}`}>{children}</table>

export const TableScroll = ({ children }: { children: React.ReactNode }) =>
    <div className={s.scrollX}>{children}</div>

/** Column helpers: right-aligned figures, no-wrap, and shrink-to-content. */
export const cell = { num: s.num, nowrap: s.nw, tight: s.tight, muted: s.muted }

/* ---------- identity ------------------------------------------------------ */

/**
 * A member in one cell: avatar, name, and what they are.
 *
 * Initials rather than a broken image when there is no avatar — a skeleton
 * account has no Discord profile to draw from, and that is a normal state.
 */
export function Identity({ name, sub, src, large = false }: {
    name: React.ReactNode
    sub?: React.ReactNode
    src?: string | null
    large?: boolean
}) {
    const initials = typeof name === 'string'
        ? name.replace(/[^\w\s]/g, '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
        : ''

    return (
        <span className={s.ident}>
            <span className={`${s.av} ${large ? s.avLg : ''}`}>
                {src ? <img src={src} alt='' /> : <span>{initials}</span>}
            </span>
            <span style={{ minWidth: 0 }}>
                <span className={s.n}>{name}</span>
                {sub && <span className={s.r}>{sub}</span>}
            </span>
        </span>
    )
}

/* ---------- empty state --------------------------------------------------- */

/**
 * Small, and offering the action that fills it.
 *
 * Favourites and Quick Links currently render as full-width boxes at the very
 * top of the dashboard whose only content is the news that they are empty.
 */
export function EmptyState({ icon, title, children, action, inline = false }: {
    icon?: React.ReactNode
    title: React.ReactNode
    children?: React.ReactNode
    action?: React.ReactNode
    /** Tighter, for an empty panel body rather than an empty page. */
    inline?: boolean
}) {
    return (
        <div className={`${s.empty} ${inline ? s.emptyInline : ''}`}>
            {icon && <div className={s.ic}>{icon}</div>}
            <div className={s.t}>{title}</div>
            {children && <p>{children}</p>}
            {action}
        </div>
    )
}

/* ---------- tabs ---------------------------------------------------------- */

export function Tabs({ tabs, active, onChange, className = '' }: {
    tabs: { key: string, label: React.ReactNode, count?: number | null }[]
    active: string
    onChange: (key: string) => void
    className?: string
}) {
    return (
        <div className={`${s.tabs} ${className}`} role='tablist'>
            {tabs.map(t => (
                <button
                    key={t.key}
                    type='button'
                    role='tab'
                    aria-selected={active === t.key}
                    className={`${s.tab} ${active === t.key ? s.tabOn : ''}`}
                    onClick={() => onChange(t.key)}
                >
                    {t.label}
                    {t.count != null && <span className={s.n}>{t.count}</span>}
                </button>
            ))}
        </div>
    )
}
