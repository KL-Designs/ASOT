import React from 'react'
import Link from 'next/link'
import s from '@/styles/dashboard.module.css'

/* ============================================================================
   Tool cards, tiered by consequence.

   This is the highest-value fix on the J4 tools screen. Today DISCHARGE MEMBER
   and CPU PROFILE are identical rectangles sitting side by side, and there is
   nothing between them to slow your hand down.

   Three tiers:
     standard  neutral edge, no lasting consequence
     caution   amber edge — changes system behaviour, carries a state badge
     danger    red edge — pair it with a typed confirmation, always
     safe      the reversible counterpart to a danger tool (reinstate, restore)

   Grouping matters as much as the colour: destructive tools belong under their
   own `SectionLabel`, not mixed in with the everyday ones.
   ========================================================================== */

export type ToolTier = 'standard' | 'caution' | 'danger' | 'safe'

const TIERS: Record<ToolTier, string> = {
    standard: '',
    caution: s.toolCaution,
    danger: s.toolDanger,
    safe: s.toolSafe,
}

export function ToolCard({
    tier = 'standard', icon, title, description, footer, flag, href, onClick, disabled = false,
}: {
    tier?: ToolTier
    icon?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    /** Bottom row — a consequence badge, a status, "Read only". */
    footer?: React.ReactNode
    /** Top-right — a Switch, for a tool that is a setting rather than an action. */
    flag?: React.ReactNode
    href?: string
    onClick?: () => void
    disabled?: boolean
}) {
    const classes = [s.tool, TIERS[tier], disabled ? s.btnDisabled : ''].filter(Boolean).join(' ')

    const inner = (
        <>
            {flag && <span className={s.flag}>{flag}</span>}
            {icon && <span className={s.ic}>{icon}</span>}
            <span className={s.t}>{title}</span>
            {description && <span className={s.d}>{description}</span>}
            {footer && <span className={s.foot}>{footer}</span>}
        </>
    )

    // A card whose whole job is to host a switch is not itself clickable —
    // making it so would give the tile two different meanings for one click.
    if (!href && !onClick) return <div className={classes}>{inner}</div>
    if (href) return <Link href={href as any} className={classes}>{inner}</Link>
    return <button type='button' className={classes} onClick={onClick}>{inner}</button>
}

export const ToolGrid = ({ children, className = '' }: { children: React.ReactNode, className?: string }) =>
    <div className={`${s.tools} ${className}`}>{children}</div>
