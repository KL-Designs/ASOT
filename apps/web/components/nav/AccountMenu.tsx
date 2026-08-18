'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { KeyboardArrowDown, Person, MilitaryTech, Tune, Dashboard as DashboardIcon, Logout } from '@mui/icons-material'

import Avatar from '@/components/member/avatar'
import { rankNameFromAbbr } from '@/lib/military/ranks'
import type { PromotionProgress } from '@/app/api/me/promotion-progress/route'
import s from '@/styles/navbar.module.css'

/**
 * The account chip and its dropdown.
 *
 * Holding the member-area links here is what lets DASHBOARD stay a single clean
 * jump in the bar rather than a menu of its own.
 *
 * Both the ORBAT position and the promotion progress are fetched lazily on
 * first open, not on mount: the navbar renders on every page, and neither
 * number is visible until the menu is opened.
 */
export default function AccountMenu({ user }: { user: User }) {
    const [open, setOpen] = useState(false)
    const [orbatEntry, setOrbatEntry] = useState<{ role: string, section: string } | null | undefined>(undefined)
    const [promotion, setPromotion] = useState<PromotionProgress | null | undefined>(undefined)
    const [isImpersonating, setIsImpersonating] = useState(false)
    const wrap = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setIsImpersonating(document.cookie.split(';').some(c => c.trim().startsWith('is_impersonating=')))
    }, [])

    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('pointerdown', onDown)
        return () => document.removeEventListener('pointerdown', onDown)
    }, [])

    function handleToggle() {
        const next = !open
        setOpen(next)
        if (!next) return

        if (orbatEntry === undefined) {
            fetch('/api/me/orbat')
                .then(r => r.json())
                .then(data => setOrbatEntry(data ?? null))
                .catch(() => setOrbatEntry(null))
        }
        if (promotion === undefined) {
            fetch('/api/me/promotion-progress')
                .then(r => r.ok ? r.json() : null)
                .then(data => setPromotion(data?.error ? null : data))
                .catch(() => setPromotion(null))
        }
    }

    async function handleLogout() {
        await fetch('/api/logout', { method: 'POST' })
        window.location.href = '/'
    }

    async function handleReturnToMyAccount() {
        await fetch('/api/admin/impersonate/return', { method: 'POST' })
        window.location.href = '/me'
    }

    const isMember = !!(user as any).isMember
    const strippedNickname = user.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const displayName = strippedNickname || user.globalName || user.username
    const rankAbbr = user.milpac?.currentRank || null
    const rank = rankAbbr ? rankNameFromAbbr(rankAbbr) : null
    const callsign = user.milpac?.callsign || orbatEntry?.section || null

    // `who` is the two-line label on the chip itself: rank over posting.
    const chipTop = rankAbbr ? `${rankAbbr} ${displayName}` : displayName
    const chipSub = callsign || orbatEntry?.role || 'ASOT'

    const progress = promotion?.progress

    /* The member's Discord accent colour, threaded through the chip and the
       panel as one variable: avatar edge, panel top rule, rank line and the
       progress bar all pick it up. Falls back to the unit red, which is what
       every member without a custom accent gets. */
    const accent = user.hexAccentColor
        ? `#${user.hexAccentColor.replace('#', '')}`
        : 'var(--red)'

    return (
        <div
            ref={wrap}
            className={`${s.acctWrap} ${open ? s.isOpen : ''}`}
            style={{ '--acct-accent': accent } as React.CSSProperties}
        >
            <button
                type='button'
                onClick={handleToggle}
                aria-expanded={open}
                aria-haspopup='menu'
                title={displayName}
                className={`${s.acct} ${open ? s.isOpen : ''}`}
            >
                <span className={s.avatar}><Avatar user={user} borderRadius='2px' /></span>
                <span className={s.who}>
                    {chipTop}
                    <span>{chipSub}</span>
                </span>
                <KeyboardArrowDown className={s.chev} />
            </button>

            <div className={s.acctDd} role='menu'>
                <div className={s.card}>
                    <div className={s.hd}>
                        <div className={s.r}>
                            {rank && <span className={s.rank}>{rank} </span>}{displayName}
                        </div>
                        <div className={s.u}>
                            {[callsign, orbatEntry?.role].filter(Boolean).join(' · ')
                                || (orbatEntry === undefined ? '…' : 'No ORBAT posting')}
                        </div>

                        {/* The same three-call computation the milpac file runs — see
                            /api/me/promotion-progress. At max rank, or on a
                            billet-assigned rank, there is no bar to draw. */}
                        {progress && !progress.atMax && !progress.billetOnly && (
                            <>
                                <div className={s.track}><i style={{ width: `${progress.pct}%` }} /></div>
                                <div className={s.pts}>
                                    {progress.current} / {progress.required} pts to {progress.nextRank}
                                </div>
                            </>
                        )}
                        {progress?.atMax && <div className={s.pts}>Highest rank attained</div>}
                        {progress && !progress.atMax && progress.billetOnly && (
                            <div className={s.pts}>{progress.nextRank} is billet-assigned</div>
                        )}
                    </div>

                    <Link href='/me' className={s.item} onClick={() => setOpen(false)} role='menuitem'>
                        <Person />Profile
                    </Link>
                    <Link href={`/milpacs/${user.username}` as any} className={s.item} onClick={() => setOpen(false)} role='menuitem'>
                        <MilitaryTech />My Milpac
                    </Link>
                    <Link href='/optionals' className={s.item} onClick={() => setOpen(false)} role='menuitem'>
                        <Tune />Optionals
                    </Link>

                    {isMember && (
                        <>
                            <div className={s.rule} />
                            <Link href='/dashboard' className={s.item} onClick={() => setOpen(false)} role='menuitem'>
                                <DashboardIcon />Dashboard
                            </Link>
                        </>
                    )}

                    {isImpersonating && (
                        <>
                            <div className={s.rule} />
                            <button type='button' onClick={handleReturnToMyAccount} className={`${s.item} ${s.warn}`} role='menuitem'>
                                <Person />Return to my account
                            </button>
                        </>
                    )}

                    <div className={s.rule} />
                    <Link href='/preferences' className={s.item} onClick={() => setOpen(false)} role='menuitem'>
                        <Tune />Preferences
                    </Link>
                    <button type='button' onClick={handleLogout} className={`${s.item} ${s.out}`} role='menuitem'>
                        <Logout />Sign out
                    </button>
                </div>
            </div>
        </div>
    )
}
