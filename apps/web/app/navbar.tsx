'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

import {
    Search, KeyboardArrowDown, KeyboardArrowUp,
    Dashboard as DashboardIcon, AccountCircle,
} from '@mui/icons-material'

import { CrateIcon } from '@/components/ui/icons'
import Button from '@/components/ui/Button'
import { useEnlistTransition, EnlistFadeOverlay } from '@/components/enlist-transition'

import NotificationBell from '@/app/dashboard/_components/NotificationBell'
import AccountMenu from '@/components/nav/AccountMenu'
import MobileSheet from '@/components/nav/MobileSheet'
import Topo from '@/components/ui/Topo'
import StatusRail from '@/components/nav/StatusRail'
import { useNavStatus, formatOpTime } from '@/components/nav/useNavStatus'
import { NAV_ITEMS, isItemActive, type NavItem } from '@/components/nav/nav-data'

import s from '@/styles/navbar.module.css'
import Logo from '@/public/logo.png'

/* ============================================================================
   ASOT — Command Strip navigation

   Three horizontal bands: a status rail carrying the next operation and live
   presence, the bar itself, and (below 1200px) a sheet.

   The right-hand cluster deliberately runs at four different volumes — solid
   primary, amber ghost, hairline account chip, borderless icon buttons — and
   only one element is ever solid-filled: whichever is the primary action for
   the current auth state. If everything is loud, nothing is.

   Layout and interaction live in styles/navbar.module.css; this file is
   structure, state and data.
   ========================================================================== */

export default function Navbar() {
    const pathname = usePathname()

    const [user, setUser] = useState<User | null>(null)
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false)

    const root = useRef<HTMLElement>(null)
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const status = useNavStatus()
    const isMember = !!(user as any)?.isMember
    const { fading: enlistFading, enlist } = useEnlistTransition()

    useEffect(() => {
        fetch('/api/me')
            .then(res => res.json())
            .then(json => { if (!json.error) setUser(json) })
            .catch(() => { })
    }, [])

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10)
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // A click outside, a route change or Escape all close everything.
    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) setOpenMenu(null)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setOpenMenu(null); setSheetOpen(false) }
        }
        document.addEventListener('pointerdown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [])

    useEffect(() => { setOpenMenu(null); setSheetOpen(false) }, [pathname])

    // A short close delay so the cursor can cross the gap from the label down
    // into the panel without the panel vanishing underneath it.
    const enterItem = (name: string) => { clearTimeout(closeTimer.current); setOpenMenu(name) }
    const leaveItem = () => { closeTimer.current = setTimeout(() => setOpenMenu(null), 120) }

    /* The two action buttons. Built here rather than in each surface so the bar
       and the mobile sheet can never style the same button differently. */
    const donateButton = (
        <Button variant='amber' href='/donate' aria-label='Donate'
            className={`${s.navAct} ${s.actDonate}`}>
            <CrateIcon />
            <span className={s.lbl}>Donate</span>
        </Button>
    )
    const primaryButton = isMember
        ? (
            <Button variant='dark' href='/dashboard' className={`${s.navAct} ${s.actPrimary}`}>
                <DashboardIcon />Dashboard
            </Button>
        )
        : user
            ? (
                <Button variant='red' href='/me' className={`${s.navAct} ${s.actPrimary}`}>
                    <AccountCircle />Profile
                </Button>
            )
            : (
                // Same action as the homepage hero's "Enlist Now" — fade the
                // screen to black, then the join video. Shared so the two can't
                // drift; see components/enlist-transition.
                <Button variant='red' onClick={enlist} className={`${s.navAct} ${s.actPrimary}`}>
                    Enlist
                </Button>
            )

    return (
        <>
            <EnlistFadeOverlay fading={enlistFading} />

            <header ref={root} className={`${s.nav} ${scrolled ? s.navScrolled : ''}`}>

                <StatusRail status={status} hidden={scrolled} />

                <nav className={s.bar} aria-label='Primary'>
                    <Topo opacity={0.065} driftSeconds={720} />

                    <div className={s.inner}>
                        {/* Wrapped so it can claim an equal share of the free space
                            against the right cluster — that is what centres the
                            menu between them. See `.side` in the stylesheet. */}
                        <div className={s.side}>
                            <Link href='/' className={s.brand}>
                                <Image src={Logo} alt='ASOT' className={s.brandMark} width={40} height={40} quality={100} priority />
                                <span className={s.brandTxt}>
                                    <span className={s.brandName}>ASOT</span>
                                    <span className={s.brandSub}>Est. 2019 · Australia</span>
                                </span>
                            </Link>
                        </div>

                        <ul className={s.menu}>
                            {NAV_ITEMS.map(item => (
                                <MenuItem
                                    key={item.name}
                                    item={item}
                                    active={isItemActive(item, pathname)}
                                    open={openMenu === item.name}
                                    onEnter={() => item.children && enterItem(item.name)}
                                    onLeave={leaveItem}
                                    onToggle={() => setOpenMenu(openMenu === item.name ? null : item.name)}
                                    nextOp={status?.nextOp ?? null}
                                />
                            ))}
                        </ul>

                        <div className={s.util}>
                            <div className={s.icons}>
                                {/* There is no site-wide search; MILPACS is the
                                    member directory this icon is reaching for. */}
                                <Link href='/milpacs' className={s.ubtn} aria-label='Member directory'>
                                    <Search />
                                </Link>
                                {isMember && (
                                    <span className={s.ubtn}><NotificationBell /></span>
                                )}
                                {!user && (
                                    <Link href='/login' className={s.ubtn} aria-label='Sign in'>
                                        <AccountCircle />
                                    </Link>
                                )}
                            </div>

                            {donateButton}
                            {primaryButton}
                            {user && <AccountMenu user={user} />}

                            <button
                                type='button'
                                className={s.burger}
                                onClick={() => setSheetOpen(v => !v)}
                                aria-expanded={sheetOpen}
                                aria-label='Menu'
                            >
                                <i /><i /><i />
                            </button>
                        </div>
                    </div>
                </nav>

                {sheetOpen && (
                    <MobileSheet
                        pathname={pathname}
                        user={user}
                        actions={<>{donateButton}{primaryButton}</>}
                        onNavigate={() => setSheetOpen(false)}
                    />
                )}
            </header>

            <button
                type='button'
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className={`${s.toTop} ${scrolled ? s.toTopShown : ''}`}
                aria-label='Scroll to top'
            >
                <KeyboardArrowUp style={{ fontSize: 22 }} />
            </button>
        </>
    )
}

/* ---------------------------------------------------------------------------
   One top-level item, plus its mega panel.

   The <li> is `position: static` so the panel anchors to the bar rather than to
   the item — a 912px panel hanging off a right-hand item would otherwise be
   pushed off-screen.
   ------------------------------------------------------------------------- */

function MenuItem({ item, active, open, onEnter, onLeave, onToggle, nextOp }: {
    item: NavItem
    active: boolean
    open: boolean
    onEnter: () => void
    onLeave: () => void
    onToggle: () => void
    nextOp: { id: string, title: string, date: string } | null
}) {
    const classes = [active ? s.active : '', open ? s.isOpen : ''].filter(Boolean).join(' ')

    const label = (
        <>
            <span className={`${s.br} ${s.tl}`} />
            <span className={`${s.br} ${s.tr}`} />
            <span className={`${s.br} ${s.bl}`} />
            <span className={`${s.br} ${s.brr}`} />
            {item.name}
            {item.children && <KeyboardArrowDown className={s.chev} />}
        </>
    )

    return (
        <li className={classes} onMouseEnter={onEnter} onMouseLeave={onLeave}>
            {item.children ? (
                <button
                    type='button'
                    className={s.mi}
                    aria-haspopup='true'
                    aria-expanded={open}
                    onClick={onToggle}
                >
                    {label}
                </button>
            ) : (
                <Link href={item.href as any} className={s.mi}>{label}</Link>
            )}

            {item.children && <MegaPanel item={item} nextOp={nextOp} />}
        </li>
    )
}

function MegaPanel({ item, nextOp }: { item: NavItem, nextOp: { id: string, title: string, date: string } | null }) {
    const children = item.children!
    const withFeature = item.feature === 'nextOp' && !!nextOp

    // Odd counts leave a single item on the last row; without this the row
    // above it keeps a border that now separates nothing.
    const lastRowFrom = children.length - (children.length % 2 === 0 ? 2 : 1)

    return (
        // A short menu goes compact — unless it is carrying the operation card,
        // which needs the full width to sit beside the links rather than under.
        <div className={`${s.dd} ${children.length >= 4 || withFeature ? '' : s.ddCompact}`}>
            <div className={s.ddCard}>
                <div className={s.megaRail}>
                    <span className={s.lbl}>{item.name}</span>
                    <span className={s.cnt}>{String(children.length).padStart(2, '0')} Sections</span>
                </div>

                <div className={s.megaLinks}>
                    {children.map((child, i) => (
                        <Link
                            key={child.href}
                            href={child.href as any}
                            className={s.ddItem}
                            style={i >= lastRowFrom ? { borderBottom: 0 } : undefined}
                        >
                            <span className={s.ic}>{child.icon}</span>
                            <span style={{ minWidth: 0 }}>
                                <span className={s.tt}>{child.name}</span>
                                <span className={s.ds}>{child.description}</span>
                            </span>
                        </Link>
                    ))}
                </div>

                {/* Short menus drop the featured card rather than padding it
                    with dead space — as does a panel with no operation to show. */}
                {withFeature && (
                    <Link href={`/operations/${nextOp!.id}` as any} className={s.megaFeat}>
                        <div className={s.featImg}>
                            <Topo opacity={0.32} driftSeconds={900} mask='none' />
                            <span className={s.tag}>Next Op</span>
                        </div>
                        <div className={s.featT}>{nextOp!.title}</div>
                        <div className={s.featM}>{formatOpTime(nextOp!.date)}</div>
                    </Link>
                )}
            </div>
        </div>
    )
}
