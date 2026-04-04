'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Collapse } from '@mui/material'
import { ExpandMore, ChevronRight } from '@mui/icons-material'
import type { DashboardPermissions } from './StaffDashboardShell'

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
                { label: 'HQ Staff',   href: '/admin/personnel/hq-staff',   visible: permissions.canSeePersonnel },
                { label: 'All Staff',  href: '/admin/personnel/all-staff',   visible: permissions.canSeePersonnel },
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
            <div
                className='px-5 py-5'
                style={{ borderBottom: '1px solid rgba(219,0,29,0.12)' }}
            >
                <div style={{
                    fontSize: '0.58rem',
                    fontWeight: 700,
                    letterSpacing: 3,
                    textTransform: 'uppercase',
                    color: 'rgba(219,0,29,0.7)',
                    marginBottom: 3,
                }}>
                    ASOT Unit
                </div>
                <div style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                }}>
                    Staff Dashboard
                </div>
                <div style={{
                    fontSize: '0.65rem',
                    color: 'rgba(237,237,237,0.3)',
                    marginTop: 4,
                    letterSpacing: '0.04em',
                }}>
                    {permissions.displayName}
                </div>
            </div>

            {/* Sections */}
            {sections.map((section, i) => {
                const key = sectionKeys[i]
                const visibleItems = section.items.filter(item => item.visible)
                if (visibleItems.length === 0) return null

                return (
                    <div key={section.label} style={{ marginTop: 8 }}>

                        {/* Section header — clickable toggle */}
                        <button
                            onClick={() => toggle(key)}
                            className='w-full flex items-center justify-between px-5 py-2'
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'rgba(237,237,237,0.3)',
                            }}
                        >
                            <span style={{
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                letterSpacing: 3,
                                textTransform: 'uppercase',
                            }}>
                                {section.label}
                            </span>
                            {expanded[key]
                                ? <ExpandMore sx={{ fontSize: 14, opacity: 0.5 }} />
                                : <ChevronRight sx={{ fontSize: 14, opacity: 0.5 }} />
                            }
                        </button>

                        {/* Nav items */}
                        <Collapse in={expanded[key]}>
                            <div className='flex flex-col'>
                                {visibleItems.map(item => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/admin' && pathname.startsWith(item.href))
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href as never}
                                            onClick={onNavigate}
                                            style={{
                                                display: 'block',
                                                padding: '8px 20px 8px 18px',
                                                fontSize: '0.75rem',
                                                fontWeight: isActive ? 700 : 500,
                                                letterSpacing: '0.08em',
                                                textTransform: 'uppercase',
                                                textDecoration: 'none',
                                                color: isActive ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
                                                borderLeft: isActive
                                                    ? '2px solid var(--red)'
                                                    : '2px solid transparent',
                                                background: isActive
                                                    ? 'rgba(219,0,29,0.08)'
                                                    : 'transparent',
                                                transition: 'background 0.15s, color 0.15s',
                                            }}
                                            onMouseEnter={e => {
                                                if (!isActive) {
                                                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
                                                    ;(e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.8)'
                                                }
                                            }}
                                            onMouseLeave={e => {
                                                if (!isActive) {
                                                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                                                    ;(e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.55)'
                                                }
                                            }}
                                        >
                                            {item.label}
                                        </Link>
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
