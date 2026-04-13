'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Collapse } from '@mui/material'
import {
    PersonAdd, Map, School, AdminPanelSettings, Collections,
    SportsEsports, Code, Badge, Groups, People,
    AccountTree, CalendarMonth, MenuBook, Policy, ConfirmationNumber,
    Dashboard,
} from '@mui/icons-material'
import type { DashboardPermissions } from './StaffDashboardShell'
import { useFavourites } from '@/hooks/useFavourites'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavTab {
    label: string
    tab: number
}

interface NavItem {
    label: string
    href: string
    visible: boolean
    icon?: React.ReactNode
    tabs?: NavTab[]
}

interface NavSection {
    label: string
    items: NavItem[]
}

// ── Local clock ───────────────────────────────────────────────────────────────

function LocalClock() {
    const [time, setTime] = useState('')
    const [tzAbbr, setTzAbbr] = useState('')
    useEffect(() => {
        function tick() {
            const now = new Date()
            const h = now.getHours().toString().padStart(2, '0')
            const m = now.getMinutes().toString().padStart(2, '0')
            const s = now.getSeconds().toString().padStart(2, '0')
            setTime(`${h}:${m}:${s}`)
            // Extract short timezone abbreviation e.g. "AEST", "GMT+10"
            const parts = now.toLocaleTimeString('en', { timeZoneName: 'short' }).split(' ')
            setTzAbbr(parts[parts.length - 1] ?? '')
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])
    return (
        <span style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            {time || '──:──:──'}{tzAbbr ? <span style={{ fontSize: '0.45rem', opacity: 0.6, marginLeft: 2 }}>{tzAbbr}</span> : null}
        </span>
    )
}

// ── Pinnable nav item row ─────────────────────────────────────────────────────

function NavRow({
    item,
    isActive,
    onNavigate,
}: {
    item: NavItem
    isActive: boolean
    onNavigate?: () => void
}) {
    const { isPinned, pin, unpin } = useFavourites()
    const searchParams = useSearchParams()
    const [hovered, setHovered] = useState(false)
    const [subExpanded, setSubExpanded] = useState(isActive)
    const pinned = isPinned(item.href)
    const hasTabs = item.tabs && item.tabs.length > 0
    const activeTab = isActive ? Number(searchParams.get('tab') ?? -1) : -1

    // Auto-expand when navigating to this section
    useEffect(() => {
        if (isActive && hasTabs) setSubExpanded(true)
    }, [isActive, hasTabs])

    return (
        <div>
            <div
                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <Link
                    href={item.href as never}
                    onClick={onNavigate}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: hasTabs ? '7px 52px 7px 16px' : '7px 36px 7px 16px',
                        fontSize: '0.72rem',
                        fontWeight: isActive ? 700 : 400,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        textDecoration: 'none',
                        color: isActive ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.45)',
                        borderLeft: isActive ? '2px solid var(--red)' : '2px solid transparent',
                        background: isActive
                            ? 'rgba(219,0,29,0.07)'
                            : hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
                        transition: 'background 0.12s, color 0.12s',
                    }}
                >
                    {/* Active indicator glyph */}
                    <span style={{
                        fontSize: '0.55rem',
                        color: isActive ? 'var(--red)' : 'transparent',
                        flexShrink: 0,
                        transition: 'color 0.12s',
                        lineHeight: 1,
                    }}>▸</span>
                    {item.icon && (
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                            color: isActive ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.22)',
                            transition: 'color 0.12s',
                            fontSize: 14,
                        }}>
                            {item.icon}
                        </span>
                    )}
                    {item.label}
                </Link>

                {/* Expand toggle for sub-tabs */}
                {hasTabs && (
                    <button
                        onClick={e => { e.preventDefault(); setSubExpanded(p => !p) }}
                        style={{
                            position: 'absolute',
                            right: 26,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            fontSize: '0.55rem',
                            fontFamily: 'monospace',
                            color: subExpanded ? 'rgba(219,0,29,0.5)' : 'rgba(237,237,237,0.2)',
                            lineHeight: 1,
                            opacity: hovered || subExpanded ? 1 : 0.5,
                            transition: 'opacity 0.12s, color 0.12s',
                        }}
                    >
                        {subExpanded ? '[−]' : '[+]'}
                    </button>
                )}

                {/* Pin icon */}
                <span
                    onClick={e => {
                        e.stopPropagation()
                        pinned
                            ? unpin(item.href)
                            : pin({ id: item.href, label: item.label, href: item.href })
                    }}
                    title={pinned ? 'Remove from favourites' : 'Pin to favourites'}
                    style={{
                        position: 'absolute',
                        right: 10,
                        fontSize: '0.6rem',
                        color: pinned ? 'var(--red)' : 'rgba(237,237,237,0.3)',
                        cursor: 'pointer',
                        opacity: pinned ? 1 : hovered ? 0.8 : 0,
                        transition: 'opacity 0.12s, color 0.12s',
                        userSelect: 'none',
                        lineHeight: 1,
                    }}
                >
                    {pinned ? '★' : '☆'}
                </span>
            </div>

            {/* Sub-tab rows */}
            {hasTabs && (
                <Collapse in={subExpanded}>
                    <div className='flex flex-col pb-1'>
                        {item.tabs!.map(t => {
                            const isTabActive = isActive && activeTab === t.tab
                            return (
                                <Link
                                    key={t.tab}
                                    href={`${item.href}?tab=${t.tab}` as never}
                                    onClick={onNavigate}
                                    style={{
                                        padding: '5px 16px 5px 44px',
                                        fontSize: '0.65rem',
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        textDecoration: 'none',
                                        color: isTabActive ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.32)',
                                        borderLeft: isTabActive ? '2px solid rgba(219,0,29,0.5)' : '2px solid transparent',
                                        background: isTabActive ? 'rgba(219,0,29,0.04)' : 'transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        transition: 'background 0.12s, color 0.12s',
                                    }}
                                    onMouseEnter={e => {
                                        if (!isTabActive) {
                                            (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.65)'
                                            ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (!isTabActive) {
                                            (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.32)'
                                            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                                        }
                                    }}
                                >
                                    <span style={{ fontSize: '0.4rem', color: isTabActive ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.18)', flexShrink: 0, lineHeight: 1 }}>▸</span>
                                    {t.label}
                                </Link>
                            )
                        })}
                    </div>
                </Collapse>
            )}
        </div>
    )
}

// ── Home button ───────────────────────────────────────────────────────────────

function HomeButton({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
    const isActive = pathname === '/admin'
    const [hovered, setHovered] = useState(false)

    return (
        <div style={{ padding: '6px 0 2px' }}>
            <Link
                href='/admin'
                onClick={onNavigate}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 16px',
                    fontSize: '0.72rem',
                    fontWeight: isActive ? 700 : 400,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    color: isActive ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.45)',
                    borderLeft: isActive ? '2px solid var(--red)' : '2px solid transparent',
                    background: isActive
                        ? 'rgba(219,0,29,0.07)'
                        : hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
                    transition: 'background 0.12s, color 0.12s',
                }}
            >
                <span style={{
                    fontSize: '0.55rem',
                    color: isActive ? 'var(--red)' : 'transparent',
                    flexShrink: 0,
                    transition: 'color 0.12s',
                    lineHeight: 1,
                }}>▸</span>
                <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    color: isActive ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.22)',
                    transition: 'color 0.12s',
                    fontSize: 14,
                }}>
                    <Dashboard sx={{ fontSize: 14 }} />
                </span>
                Dashboard
            </Link>
        </div>
    )
}

// ── Pinned section ────────────────────────────────────────────────────────────

function PinnedSection({ onNavigate }: { onNavigate?: () => void }) {
    const { favourites, unpin } = useFavourites()
    const router = useRouter()
    const pathname = usePathname()
    const [expanded, setExpanded] = useState(true)

    if (favourites.length === 0) return null

    function handleClick(fav: typeof favourites[number]) {
        onNavigate?.()
        const href = fav.tabIndex !== undefined
            ? `${fav.href}?tab=${fav.tabIndex}`
            : fav.href
        router.push(href as never)
    }

    return (
        <div>
            {/* Section header */}
            <button
                onClick={() => setExpanded(p => !p)}
                className='w-full flex items-center justify-between px-4 py-2'
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'rgba(219,0,29,0.45)', fontFamily: 'monospace' }}>//</span>
                    PINNED
                </span>
                <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)', lineHeight: 1 }}>
                    {expanded ? '[−]' : '[+]'}
                </span>
            </button>

            <Collapse in={expanded}>
                <div className='flex flex-col pb-1'>
                    {favourites.map(fav => {
                        const isActive = pathname === fav.href
                        return (
                            <div
                                key={fav.id}
                                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                                className='group/pin'
                            >
                                <button
                                    onClick={() => handleClick(fav)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 36px 6px 16px',
                                        fontSize: '0.68rem',
                                        fontWeight: isActive ? 700 : 400,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        color: isActive ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.45)',
                                        background: isActive ? 'rgba(219,0,29,0.07)' : 'transparent',
                                        borderTop: 'none',
                                        borderRight: 'none',
                                        borderBottom: 'none',
                                        borderLeft: isActive ? '2px solid var(--red)' : '2px solid transparent',
                                        transition: 'background 0.12s, color 0.12s',
                                    }}
                                    onMouseEnter={e => {
                                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'
                                    }}
                                    onMouseLeave={e => {
                                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                                    }}
                                >
                                    <span style={{ fontSize: '0.5rem', color: isActive ? 'var(--red)' : 'transparent', flexShrink: 0, lineHeight: 1 }}>▸</span>
                                    {fav.label}
                                </button>
                                <span
                                    onClick={() => unpin(fav.id)}
                                    title='Unpin'
                                    style={{ position: 'absolute', right: 10, fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', cursor: 'pointer', opacity: 0, transition: 'opacity 0.12s, color 0.12s', userSelect: 'none', lineHeight: 1 }}
                                    className='unpin-btn'
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--red)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.2)'}
                                >×</span>
                            </div>
                        )
                    })}
                </div>
            </Collapse>

            <style>{`.group\\/pin:hover .unpin-btn { opacity: 1 !important; }`}</style>
        </div>
    )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function StaffSidebar({
    permissions,
    onNavigate,
}: {
    permissions: DashboardPermissions
    onNavigate?: () => void
}) {
    const pathname = usePathname()

    const [expanded, setExpanded] = useState({
        departments: true,
        personnel: true,
        unit: true,
    })

    const sections: NavSection[] = [
        {
            label: 'Departments',
            items: [
                {
                    label: '[J1] Recruitment', href: '/admin/j1', visible: permissions.canSeeJ1, icon: <PersonAdd sx={{ fontSize: 14 }} />,
                    tabs: [
                        { label: 'Recruit Member', tab: 0 },
                        { label: 'Applications',   tab: 1 },
                        { label: 'Mastersheet',    tab: 2 },
                        { label: 'Statistics',     tab: 3 },
                    ],
                },
                {
                    label: '[J2] Mission Making', href: '/admin/j2', visible: permissions.canSeeJ2, icon: <Map sx={{ fontSize: 14 }} />,
                    tabs: [
                        { label: 'Operations', tab: 0 },
                    ],
                },
                {
                    label: '[J3] Training', href: '/admin/j3', visible: permissions.canSeeJ3, icon: <School sx={{ fontSize: 14 }} />,
                    tabs: [
                        { label: 'Qual Tickets',   tab: 0 },
                        { label: 'Promo Tickets',  tab: 1 },
                        { label: 'Training Sched', tab: 2 },
                    ],
                },
                {
                    label: '[J4] Administration', href: '/admin/j4', visible: permissions.canSeeJ4, icon: <AdminPanelSettings sx={{ fontSize: 14 }} />,
                    tabs: [
                        { label: 'Tools', tab: 0 },
                    ],
                },
                {
                    label: '[J5] Media', href: '/admin/j5', visible: permissions.canSeeJ5, icon: <Collections sx={{ fontSize: 14 }} />,
                    tabs: [
                        { label: 'Gallery',              tab: 0 },
                        { label: 'Screenshot of Month',  tab: 1 },
                    ],
                },
                {
                    label: '[J6] Game Masters', href: '/admin/j6', visible: permissions.canSeeJ6, icon: <SportsEsports sx={{ fontSize: 14 }} />,
                    tabs: [
                        { label: 'Zeus Notes', tab: 0 },
                    ],
                },
                { label: '[J7] Development',  href: '/admin/j7', visible: permissions.canSeeJ7, icon: <Code sx={{ fontSize: 14 }} /> },
            ],
        },
        {
            label: 'Personnel',
            items: [
                { label: 'HQ Staff',    href: '/admin/personnel/hq-staff', visible: permissions.canSeePersonnel, icon: <Badge sx={{ fontSize: 14 }} /> },
                { label: 'All Staff',   href: '/admin/personnel/all-staff', visible: permissions.canSeePersonnel, icon: <Groups sx={{ fontSize: 14 }} /> },
                { label: 'Members',     href: '/admin/personnel/all',       visible: permissions.canSeePersonnel, icon: <People sx={{ fontSize: 14 }} /> },
            ],
        },
        {
            label: 'Unit',
            items: [
                { label: 'ORBAT',         href: '/admin/orbat',              visible: permissions.canSeeOrbat, icon: <AccountTree sx={{ fontSize: 14 }} /> },
                { label: 'Calendar',      href: '/admin/unit/calendar',      visible: true,                    icon: <CalendarMonth sx={{ fontSize: 14 }} /> },
                { label: 'Training Docs', href: '/admin/unit/training-docs', visible: true,                    icon: <MenuBook sx={{ fontSize: 14 }} /> },
                { label: 'SOPs',          href: '/admin/unit/sops',          visible: true,                    icon: <Policy sx={{ fontSize: 14 }} /> },
                { label: 'Tickets',       href: '/admin/unit/tickets',       visible: true,                    icon: <ConfirmationNumber sx={{ fontSize: 14 }} /> },
            ],
        },
    ]

    function toggle(key: keyof typeof expanded) {
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const sectionKeys: (keyof typeof expanded)[] = ['departments', 'personnel', 'unit']

    return (
        <nav className='flex flex-col h-full overflow-y-auto' style={{ paddingBottom: 40 }}>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div
                style={{
                    position: 'relative',
                    padding: '18px 16px 16px',
                    borderBottom: '1px solid rgba(219,0,29,0.42)',
                    background: 'rgba(0,0,0,0.25)',
                }}
            >
                <CornerBrackets />

                {/* Top row: unit label + clock */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace' }}>
                        ASOT // UNIT
                    </span>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                        <LocalClock />
                    </span>
                </div>

                {/* Portal title */}
                <div style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 10 }}>
                    Member Portal
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'rgba(219,0,29,0.18)', marginBottom: 10 }} />

                {/* User + status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.06em', fontFamily: 'monospace' }}>
                        {permissions.displayName || '—'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.52rem', color: 'rgba(0,200,80,0.6)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(0,200,80,0.7)', flexShrink: 0, boxShadow: '0 0 4px rgba(0,200,80,0.5)' }} />
                        ONLINE
                    </span>
                </div>
            </div>

            {/* ── Home button ─────────────────────────────────────────────── */}
            <HomeButton pathname={pathname} onNavigate={onNavigate} />

            {/* ── Pinned section ──────────────────────────────────────────── */}
            <PinnedSection onNavigate={onNavigate} />

            {/* ── Sections ────────────────────────────────────────────────── */}
            {sections.map((section, i) => {
                const key = sectionKeys[i]
                const visibleItems = section.items.filter(item => item.visible)
                if (visibleItems.length === 0) return null

                const isAnyActive = visibleItems.some(item =>
                    pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
                )

                return (
                    <div key={section.label} style={{ marginTop: 6 }}>

                        {/* Section toggle */}
                        <button
                            onClick={() => toggle(key)}
                            className='w-full flex items-center justify-between px-4 py-2'
                            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            <span style={{
                                fontSize: '0.55rem',
                                fontWeight: 700,
                                letterSpacing: '0.22em',
                                textTransform: 'uppercase',
                                color: isAnyActive ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                transition: 'color 0.15s',
                            }}>
                                <span style={{ fontFamily: 'monospace', color: isAnyActive ? 'rgba(219,0,29,0.5)' : 'rgba(237,237,237,0.15)' }}>//</span>
                                {section.label.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)', lineHeight: 1 }}>
                                {expanded[key] ? '[−]' : '[+]'}
                            </span>
                        </button>

                        {/* Items */}
                        <Collapse in={expanded[key]}>
                            <div className='flex flex-col'>
                                {visibleItems.map(item => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
                                    return (
                                        <NavRow
                                            key={item.href}
                                            item={item}
                                            isActive={isActive}
                                            onNavigate={onNavigate}
                                        />
                                    )
                                })}
                            </div>
                        </Collapse>
                    </div>
                )
            })}

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid rgba(219,0,29,0.22)' }}>
                <div style={{ fontSize: '0.5rem', fontFamily: 'monospace', letterSpacing: '0.15em', color: 'rgba(237,237,237,0.12)', textTransform: 'uppercase', lineHeight: 1.8 }}>
                    <div>SYS // MEMBER-PORTAL</div>
                    <div>AUTH // DISCORD-SSO</div>
                </div>
            </div>

        </nav>
    )
}
