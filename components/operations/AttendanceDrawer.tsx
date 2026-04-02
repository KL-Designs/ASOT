'use client'

import { useState, useEffect } from 'react'
import AttendancePanel from '@/components/operations/AttendancePanel'

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

interface Props {
    operationId: string
    operationStatus: string
    myUserId: string | null
    isHQ: boolean
    isSectionLeader: boolean
    themeColor: string
}

export default function AttendanceDrawer({ operationId, operationStatus, myUserId, isHQ, isSectionLeader, themeColor }: Props) {
    const [drawerOpen, setDrawerOpen] = useState(false)
    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    // ESC to close
    useEffect(() => {
        if (!drawerOpen) return
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [drawerOpen])

    // Lock body scroll on mobile when drawer is open
    useEffect(() => {
        document.body.style.overflow = drawerOpen ? 'hidden' : ''
        return () => { document.body.style.overflow = '' }
    }, [drawerOpen])

    const headerBar = (showClose: boolean) => (
        <div style={{
            padding: '7px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 10, background: c(0.8), flexShrink: 0 }} />
                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8) }}>
                    Attendance
                </span>
            </div>
            {showClose && (
                <button
                    onClick={() => setDrawerOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.45)', fontSize: '1.2rem', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                    aria-label='Close attendance'
                >
                    ×
                </button>
            )}
        </div>
    )

    const panel = (
        <div style={{ padding: 14 }}>
            <AttendancePanel
                operationId={operationId}
                operationStatus={operationStatus}
                myUserId={myUserId}
                isHQ={isHQ}
                isSectionLeader={isSectionLeader}
                themeColor={themeColor}
            />
        </div>
    )

    return (
        <>
            {/* ── Desktop sidebar (lg+) ───────────────────────── */}
            <div
                className='hidden lg:block print-hide'
                style={{
                    width: 500,
                    flexShrink: 0,
                    position: 'sticky',
                    top: 16,
                    alignSelf: 'flex-start',
                    border: `1px solid ${c(0.15)}`,
                    borderTop: `2px solid ${c(0.6)}`,
                    background: 'rgba(0,0,0,0.25)',
                    overflow: 'hidden',
                }}
            >
                {headerBar(false)}
                {panel}
            </div>

            {/* ── Mobile: floating tab button ─────────────────── */}
            <button
                className='lg:hidden print-hide'
                onClick={() => setDrawerOpen(true)}
                style={{
                    position: 'fixed',
                    top: 80,
                    right: 0,
                    zIndex: 40,
                    background: c(0.9),
                    border: 'none',
                    borderRadius: '4px 0 0 4px',
                    padding: '10px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: `-2px 2px 14px ${c(0.45)}`,
                }}
                aria-label='Open attendance'
            >
                {/* People icon */}
                <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='white' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                    <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
                    <circle cx='9' cy='7' r='4' />
                    <path d='M23 21v-2a4 4 0 0 0-3-3.87' />
                    <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                </svg>
                <span style={{
                    fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: 'white',
                    writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
                }}>
                    Attendance
                </span>
            </button>

            {/* ── Mobile drawer overlay ────────────────────────── */}
            {drawerOpen && (
                <div className='lg:hidden print-hide' style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
                    {/* Backdrop */}
                    <div
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
                        onClick={() => setDrawerOpen(false)}
                    />
                    {/* Slide-in panel */}
                    <div style={{
                        position: 'relative',
                        width: '95vw',
                        maxWidth: 520,
                        height: '100%',
                        overflowY: 'auto',
                        borderLeft: `2px solid ${c(0.6)}`,
                        background: 'rgba(10,10,12,0.97)',
                        backdropFilter: 'blur(16px)',
                    }}>
                        {headerBar(true)}
                        {panel}
                    </div>
                </div>
            )}
        </>
    )
}
