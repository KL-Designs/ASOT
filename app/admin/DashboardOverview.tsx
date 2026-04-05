'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Typography } from '@mui/material'
import { useFavourites } from '@/hooks/useFavourites'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'
import type { DashboardPermissions } from './StaffDashboardShell'

// ── Local clock ────────────────────────────────────────────────────────────────

function LocalClock() {
    const [time, setTime] = useState('')
    const [tz, setTz] = useState('')
    useEffect(() => {
        setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)
        function tick() {
            const now = new Date()
            const h = now.getHours().toString().padStart(2, '0')
            const m = now.getMinutes().toString().padStart(2, '0')
            const s = now.getSeconds().toString().padStart(2, '0')
            setTime(`${h}:${m}:${s}`)
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])
    return (
        <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.7)', lineHeight: 1 }}>
                {time || '──:──:──'}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'rgba(237,237,237,0.2)', marginTop: 4, textTransform: 'uppercase' }}>
                {tz || '─────────'}
            </div>
        </div>
    )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.55rem', color: 'rgba(219,0,29,0.4)', lineHeight: 1 }}>//</span>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>
                {label}
            </span>
        </div>
    )
}

// ── Quick-access card definitions ─────────────────────────────────────────────

interface QuickCard {
    code: string
    name: string
    href: string
    color: string
    visible: boolean
}

function buildCards(p: DashboardPermissions): QuickCard[] {
    return [
        { code: 'J1', name: 'Recruitment',    href: '/admin/j1',                  color: '#3b82f6', visible: p.canSeeJ1 },
        { code: 'J2', name: 'Mission Making',  href: '/admin/j2',                  color: '#8b5cf6', visible: p.canSeeJ2 },
        { code: 'J3', name: 'Training',        href: '/admin/j3',                  color: '#10b981', visible: p.canSeeJ3 },
        { code: 'J4', name: 'Administration',  href: '/admin/j4',                  color: '#ef4444', visible: p.canSeeJ4 },
        { code: 'J5', name: 'Media',           href: '/admin/gallery',             color: '#f59e0b', visible: p.canSeeJ5 },
        { code: 'J6', name: 'Game Masters',    href: '/admin/j6',                  color: '#06b6d4', visible: p.canSeeJ6 },
        { code: 'J7', name: 'Development',     href: '/admin/j7',                  color: '#a78bfa', visible: p.canSeeJ7 },
        { code: 'CAL', name: 'Unit Calendar',  href: '/admin/unit/calendar',       color: 'rgba(219,0,29,0.85)', visible: true },
        { code: 'ORB', name: 'ORBAT',          href: '/admin/orbat',               color: 'rgba(219,0,29,0.7)',  visible: p.canSeeOrbat },
        { code: 'PER', name: 'Personnel',      href: '/admin/personnel/hq-staff',  color: 'rgba(219,0,29,0.6)',  visible: p.canSeePersonnel },
        { code: 'TRN', name: 'Training Docs',  href: '/admin/unit/training-docs',  color: 'rgba(237,237,237,0.3)', visible: true },
        { code: 'SOP', name: "Unit SOPs",      href: '/admin/unit/sops',           color: 'rgba(237,237,237,0.3)', visible: true },
        { code: 'TKT', name: 'Tickets',        href: '/admin/unit/tickets',        color: 'rgba(237,237,237,0.3)', visible: true },
    ]
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuickCardItem({ card }: { card: QuickCard }) {
    return (
        <Link
            href={card.href as never}
            style={{ textDecoration: 'none', flex: '1 1 140px', maxWidth: 180 }}
        >
            <div
                style={{
                    position: 'relative',
                    border: `1px solid rgba(255,255,255,0.06)`,
                    borderTop: `2px solid ${card.color}`,
                    background: 'rgba(255,255,255,0.02)',
                    padding: '18px 16px 16px',
                    cursor: 'pointer',
                    transition: 'background 0.15s, border-color 0.15s',
                    height: 90,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = `rgba(255,255,255,0.12)`
                    ;(e.currentTarget as HTMLElement).style.borderTopColor = card.color
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = `rgba(255,255,255,0.06)`
                    ;(e.currentTarget as HTMLElement).style.borderTopColor = card.color
                }}
            >
                <CornerBrackets color='rgba(255,255,255,0.08)' size={5} />
                <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: 2, color: card.color, lineHeight: 1 }}>
                    {card.code}
                </div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)', lineHeight: 1.2 }}>
                    {card.name}
                </div>
            </div>
        </Link>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardOverview({
    displayName,
    permissions,
}: {
    displayName: string
    permissions: DashboardPermissions
}) {
    const router = useRouter()
    const { favourites, unpin } = useFavourites()
    const cards = buildCards(permissions).filter(c => c.visible)

    const today = new Date().toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })

    function handleFavClick(fav: { href: string; tabIndex?: number }) {
        if (fav.tabIndex !== undefined) {
            try { localStorage.setItem(`gotoTab:${fav.href}`, String(fav.tabIndex)) } catch {}
        }
        router.push(fav.href as never)
    }

    return (
        <div className='h-full w-full p-6 md:p-8 flex flex-col gap-6 max-w-[1100px]'>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div
                className='flex items-start justify-between px-5 py-4'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <CornerBrackets />
                <div>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'rgba(219,0,29,0.4)' }}>ASOT</span>
                        <span style={{ color: 'rgba(219,0,29,0.25)' }}>//</span>
                        <span>UNIT</span>
                    </div>
                    <Typography fontWeight={700} fontSize='1.1rem' letterSpacing={3} style={{ textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 6 }}>
                        Staff Portal
                    </Typography>
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)', letterSpacing: '0.04em' }}>
                        Welcome back, {displayName}
                    </Typography>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <LocalClock />
                    <Typography
                        fontSize='0.6rem'
                        style={{
                            color: 'rgba(237,237,237,0.2)',
                            letterSpacing: '0.05em',
                            textAlign: 'right',
                            fontFamily: 'monospace',
                        }}
                    >
                        {today}
                    </Typography>
                </div>
            </div>

            {/* ── Pinned / Favourites ────────────────────────────────────────── */}
            {favourites.length > 0 && (
                <div>
                    <SectionLabel label='Pinned ★' />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {favourites.map(fav => (
                            <div
                                key={fav.id}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 0,
                                    border: '1px solid rgba(219,0,29,0.2)',
                                    background: 'rgba(219,0,29,0.05)',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                }}
                            >
                                <span
                                    onClick={() => handleFavClick(fav)}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        color: 'rgba(237,237,237,0.7)',
                                        transition: 'color 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fff'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.7)'}
                                >
                                    {fav.label}
                                </span>
                                <span
                                    onClick={() => unpin(fav.id)}
                                    title='Remove from favourites'
                                    style={{
                                        padding: '6px 9px 6px 4px',
                                        fontSize: '0.6rem',
                                        color: 'rgba(237,237,237,0.25)',
                                        cursor: 'pointer',
                                        transition: 'color 0.15s',
                                        lineHeight: 1,
                                    }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--red)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.25)'}
                                >
                                    ×
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Quick Access ───────────────────────────────────────────────── */}
            <div>
                <SectionLabel label='Quick Access' />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {cards.map(card => (
                        <QuickCardItem key={card.href} card={card} />
                    ))}
                </div>
            </div>

        </div>
    )
}
