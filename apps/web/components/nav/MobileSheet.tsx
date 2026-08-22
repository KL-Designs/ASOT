'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ExpandLess, ExpandMore } from '@mui/icons-material'

import Avatar from '@/components/member/avatar'
import { NAV_ITEMS, isItemActive, type NavItem } from './nav-data'
import { memberLabel } from './member-label'
import s from '@/styles/navbar.module.css'

/**
 * The small-screen sheet.
 *
 * The action pair (donate + primary) sits above the links rather than below
 * them — first thing the thumb reaches, and in the same left-to-right order as
 * desktop so muscle memory carries over. The account row pins to the bottom for
 * the same reason, and doubles as the sign-in/out affordance.
 */
export default function MobileSheet({
    pathname,
    user,
    actions,
    onNavigate,
}: {
    pathname: string
    user: User | null
    /** The DONATE + ENLIST/DASHBOARD pair, rendered by the navbar so the two
        surfaces can't style the same buttons differently. */
    actions: React.ReactNode
    onNavigate: () => void
}) {
    async function handleLogout() {
        await fetch('/api/logout', { method: 'POST' })
        window.location.href = '/'
    }

    // Rank + bare name — the nickname already leads with the rank, so pairing
    // the two would print it twice. See member-label.ts.
    const label = user ? memberLabel(user) : null

    return (
        <div className={s.sheet}>
            <div className={s.macts}>{actions}</div>

            <div className={s.grp}>▸ Primary</div>
            {NAV_ITEMS.map(item => (
                <MobileRow key={item.name} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}

            <div className={s.mfoot}>
                {user && label ? (
                    <>
                        <span className={s.avatar}><Avatar user={user} borderRadius='2px' /></span>
                        <span className={s.who}>
                            {label.rankAbbr ? `${label.rankAbbr} ${label.name}` : label.name}
                            <span>{label.callsign || 'ASOT'}</span>
                        </span>
                        <button type='button' className={s.sign} onClick={handleLogout}>Sign out</button>
                    </>
                ) : (
                    <>
                        <span className={s.who}>
                            Not signed in
                            <span>Members only area</span>
                        </span>
                        <Link href='/login' className={s.sign} onClick={onNavigate}>Sign in</Link>
                    </>
                )}
            </div>
        </div>
    )
}

/** A top-level row; parents expand in place rather than pushing a second panel. */
function MobileRow({ item, pathname, onNavigate }: { item: NavItem, pathname: string, onNavigate: () => void }) {
    const active = isItemActive(item, pathname)
    const [expanded, setExpanded] = useState(false)

    if (!item.children) return (
        <Link href={item.href as any} onClick={onNavigate} className={`${s.mrow} ${active ? s.on : ''}`}>
            <span className={s.ic}>{item.icon}</span>
            <span className={s.tt}>{item.name}</span>
        </Link>
    )

    return (
        <div>
            <button
                type='button'
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                className={`${s.mrow} ${active ? s.on : ''}`}
            >
                <span className={s.ic}>{item.icon}</span>
                <span className={s.tt}>{item.name}</span>
                {expanded ? <ExpandLess className={s.ic} /> : <ExpandMore className={s.ic} />}
            </button>

            {expanded && (
                <div className={s.msub}>
                    {item.children.map(child => (
                        <Link
                            key={child.href}
                            href={child.href as any}
                            onClick={onNavigate}
                            className={`${s.mrow} ${pathname === child.href ? s.on : ''}`}
                        >
                            <span className={s.ic}>{child.icon}</span>
                            <span className={s.tt}>{child.name}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
