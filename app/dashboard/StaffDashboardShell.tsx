'use client'

import { useState, Suspense } from 'react'
import { Drawer } from '@mui/material'
import StaffSidebar from './StaffSidebar'

export interface DashboardPermissions {
    displayName: string
    isStaff: boolean
    canSeeJ1: boolean
    canSeeJ2: boolean
    canSeeJ3: boolean
    canSeeJ4: boolean
    canSeeJ5: boolean
    canSeeJ6: boolean
    canSeeJ7: boolean
    canSeeOrbat: boolean
    canSeePersonnel: boolean
}

export default function StaffDashboardShell({
    permissions,
    children,
}: {
    permissions: DashboardPermissions
    children: React.ReactNode
}) {
    const [drawerOpen, setDrawerOpen] = useState(false)

    return (
        <div className='flex w-full min-h-screen'>

            {/* Desktop sidebar */}
            <div
                className='hidden md:flex flex-col flex-shrink-0'
                style={{
                    width: 260,
                    minHeight: '100vh',
                    position: 'sticky',
                    top: 0,
                    alignSelf: 'flex-start',
                    borderRight: '1px solid rgba(219,0,29,0.18)',
                    background: 'rgba(8,8,8,0.98)',
                }}
            >
                <Suspense>
                    <StaffSidebar permissions={permissions} />
                </Suspense>
            </div>

            {/* Mobile: side pull tab */}
            <button
                className='flex md:hidden flex-col items-center'
                onClick={() => setDrawerOpen(true)}
                style={{
                    position: 'fixed',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 51,
                    background: 'rgba(8,8,8,0.92)',
                    border: '1px solid rgba(219,0,29,0.25)',
                    borderLeft: 'none',
                    borderRadius: '0 6px 6px 0',
                    padding: '14px 7px',
                    cursor: 'pointer',
                    gap: 8,
                }}
            >
                {/* Three bar icon */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ display: 'block', width: 14, height: 1.5, background: 'rgba(219,0,29,0.7)', borderRadius: 1 }} />
                    <span style={{ display: 'block', width: 10, height: 1.5, background: 'rgba(219,0,29,0.5)', borderRadius: 1 }} />
                    <span style={{ display: 'block', width: 14, height: 1.5, background: 'rgba(219,0,29,0.7)', borderRadius: 1 }} />
                </div>
                <span style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    transform: 'rotate(180deg)',
                    fontSize: '0.4rem',
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'rgba(237,237,237,0.25)',
                    fontFamily: 'monospace',
                    marginTop: 2,
                }}>NAV</span>
            </button>

            {/* Mobile drawer */}
            <Drawer
                anchor='left'
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                PaperProps={{
                    sx: {
                        width: 260,
                        background: 'rgba(8,8,8,0.99)',
                        borderRight: '1px solid rgba(219,0,29,0.18)',
                    },
                }}
            >
                <Suspense>
                    <StaffSidebar permissions={permissions} onNavigate={() => setDrawerOpen(false)} />
                </Suspense>
            </Drawer>

            {/* Content area */}
            <div className='flex-1 min-w-0' style={{ background: 'var(--workspace)' }}>
                {children}
            </div>

        </div>
    )
}
