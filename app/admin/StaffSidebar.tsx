'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Collapse } from '@mui/material'
import { ExpandMore, ChevronRight } from '@mui/icons-material'
import type { DashboardPermissions } from './StaffDashboardShell'
import { useFavourites } from '@/hooks/useFavourites'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
    label: string
    href: string
    visible: boolean
}

interface NavSection {
    label: string
    items: NavItem[]
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
    const [hovered, setHovered] = useState(false)
    const pinned = isPinned(item.href)

    return (
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
                    display: 'block',
                    padding: '8px 36px 8px 18px',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    color: isActive ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
                    borderLeft: isActive ? '2px solid var(--red)' : '2px solid transparent',
                    background: isActive ? 'rgba(219,0,29,0.08)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                    transition: 'background 0.15s, color 0.15s',
                }}
            >
                {item.label}
            </Link>

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
                    fontSize: '0.65rem',
                    color: pinned ? 'var(--red)' : 'rgba(237,237,237,0.35)',
                    cursor: 'pointer',
                    opacity: pinned ? 1 : hovered ? 0.8 : 0,
                    transition: 'opacity 0.15s, color 0.15s',
                    userSelect: 'none',
                    lineHeight: 1,
                    padding: '2px 2px',
                }}
            >
                {pinned ? '★' : '☆'}
            </span>
        </div>
    )
}

// ── Pinned section ────────────────────────────────────────────────────────────

function PinnedSection({
    onNavigate,
}: {
    onNavigate?: () => void
}) {
    const { favourites, unpin } = useFavourites()
    const router = useRouter()
    const pathname = usePathname()
    const [expanded, setExpanded] = useState(true)

    if (favourites.length === 0) return null

    function handleClick(fav: typeof favourites[number]) {
        if (fav.tabIndex !== undefined) {
            try { localStorage.setItem(`gotoTab:${fav.href}`, String(fav.tabIndex)) } catch {}
        }
        onNavigate?.()
        router.push(fav.href as never)
    }

    return (
        <div style={{ marginTop: 8 }}>
            <button
                onClick={() => setExpanded(p => !p)}
                className='w-full flex items-center justify-between px-5 py-2'
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.3)' }}
            >
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
                    ★ Pinned
                </span>
                {expanded
                    ? <ExpandMore sx={{ fontSize: 14, opacity: 0.5 }} />
                    : <ChevronRight sx={{ fontSize: 14, opacity: 0.5 }} />
                }
            </button>

            <Collapse in={expanded}>
                <div className='flex flex-col'>
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
                                        display: 'block',
                                        padding: '7px 36px 7px 16px',
                                        fontSize: '0.72rem',
                                        fontWeight: isActive ? 700 : 500,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        color: isActive ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
                                        background: isActive ? 'rgba(219,0,29,0.08)' : 'transparent',
                                        borderTop: 'none',
                                        borderRight: 'none',
                                        borderBottom: 'none',
                                        borderLeft: isActive ? '2px solid var(--red)' : '2px solid transparent',
                                        transition: 'background 0.15s, color 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
                                    }}
                                    onMouseLeave={e => {
                                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                                    }}
                                >
                                    {fav.label}
                                </button>
                                <span
                                    onClick={() => unpin(fav.id)}
                                    title='Unpin'
                                    style={{
                                        position: 'absolute',
                                        right: 10,
                                        fontSize: '0.7rem',
                                        color: 'rgba(237,237,237,0.2)',
                                        cursor: 'pointer',
                                        opacity: 0,
                                        transition: 'opacity 0.15s, color 0.15s',
                                        userSelect: 'none',
                                        lineHeight: 1,
                                        padding: '2px 2px',
                                    }}
                                    className='unpin-btn'
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--red)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.2)'}
                                >
                                    ×
                                </span>
                            </div>
                        )
                    })}
                </div>
            </Collapse>

            <style>{`
                .group\\/pin:hover .unpin-btn { opacity: 1 !important; }
            `}</style>
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
                { label: 'J1 — Recruitment',        href: '/admin/j1',      visible: permissions.canSeeJ1 },
                { label: 'J2 — Mission Making',      href: '/admin/j2',      visible: permissions.canSeeJ2 },
                { label: 'J3 — Training',            href: '/admin/j3',      visible: permissions.canSeeJ3 },
                { label: 'J4 — Administration',      href: '/admin/j4',      visible: permissions.canSeeJ4 },
                { label: 'J5 — Media',               href: '/admin/gallery', visible: permissions.canSeeJ5 },
                { label: 'J6 — Game Masters',        href: '/admin/j6',      visible: permissions.canSeeJ6 },
                { label: 'J7 — Development',         href: '/admin/j7',      visible: permissions.canSeeJ7 },
            ],
        },
        {
            label: 'Personnel',
            items: [
                { label: 'HQ Staff',    href: '/admin/personnel/hq-staff',  visible: permissions.canSeePersonnel },
                { label: 'All Staff',   href: '/admin/personnel/all-staff',  visible: permissions.canSeePersonnel },
                { label: 'All Members', href: '/admin/personnel/all',        visible: permissions.canSeePersonnel },
            ],
        },
        {
            label: 'Unit',
            items: [
                { label: 'ORBAT',                   href: '/admin/orbat',              visible: permissions.canSeeOrbat },
                { label: 'Calendar',                href: '/admin/unit/calendar',      visible: true },
                { label: 'Training Documentation',  href: '/admin/unit/training-docs', visible: true },
                { label: "Unit SOP's",              href: '/admin/unit/sops',          visible: true },
                { label: 'Tickets',                 href: '/admin/unit/tickets',       visible: true },
            ],
        },
    ]

    function toggle(key: keyof typeof expanded) {
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const sectionKeys: (keyof typeof expanded)[] = ['departments', 'personnel', 'unit']

    return (
        <nav className='flex flex-col h-full overflow-y-auto' style={{ paddingBottom: 32 }}>

            {/* Dashboard header */}
            <div className='px-5 py-5' style={{ borderBottom: '1px solid rgba(219,0,29,0.12)' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 3 }}>
                    ASOT Unit
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Staff Dashboard
                </div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', marginTop: 4, letterSpacing: '0.04em' }}>
                    {permissions.displayName}
                </div>
            </div>

            {/* Pinned section — shows only when items are pinned */}
            <PinnedSection onNavigate={onNavigate} />

            {/* Divider if there are pinned items */}
            <PinnedDivider />

            {/* Sections */}
            {sections.map((section, i) => {
                const key = sectionKeys[i]
                const visibleItems = section.items.filter(item => item.visible)
                if (visibleItems.length === 0) return null

                return (
                    <div key={section.label} style={{ marginTop: 8 }}>
                        <button
                            onClick={() => toggle(key)}
                            className='w-full flex items-center justify-between px-5 py-2'
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.3)' }}
                        >
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
                                {section.label}
                            </span>
                            {expanded[key]
                                ? <ExpandMore sx={{ fontSize: 14, opacity: 0.5 }} />
                                : <ChevronRight sx={{ fontSize: 14, opacity: 0.5 }} />
                            }
                        </button>

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

        </nav>
    )
}

// Small divider that only renders when there are pinned items
function PinnedDivider() {
    const { favourites } = useFavourites()
    if (favourites.length === 0) return null
    return <div style={{ height: 1, background: 'rgba(219,0,29,0.1)', margin: '4px 0' }} />
}
