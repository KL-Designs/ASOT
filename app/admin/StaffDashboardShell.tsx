'use client'

import { useState } from 'react'
import { Drawer, IconButton } from '@mui/material'
import { Menu as MenuIcon } from '@mui/icons-material'
import StaffSidebar from './StaffSidebar'

export interface DashboardPermissions {
    displayName: string
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
                    width: 240,
                    minHeight: '100vh',
                    position: 'sticky',
                    top: 0,
                    alignSelf: 'flex-start',
                    borderRight: '1px solid rgba(219,0,29,0.15)',
                    background: 'rgba(10,10,10,0.97)',
                }}
            >
                <StaffSidebar permissions={permissions} />
            </div>

            {/* Mobile: top bar with hamburger */}
            <div
                className='flex md:hidden items-center px-4 fixed top-[60px] left-0 right-0 z-40'
                style={{
                    height: 44,
                    borderBottom: '1px solid rgba(219,0,29,0.15)',
                    background: 'rgba(10,10,10,0.97)',
                }}
            >
                <IconButton
                    size='small'
                    onClick={() => setDrawerOpen(true)}
                    sx={{ color: 'rgba(237,237,237,0.6)', mr: 1.5 }}
                >
                    <MenuIcon fontSize='small' />
                </IconButton>
                <span
                    style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: 3,
                        textTransform: 'uppercase',
                        color: 'rgba(219,0,29,0.7)',
                    }}
                >
                    Staff Dashboard
                </span>
            </div>

            {/* Mobile drawer */}
            <Drawer
                anchor='left'
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                PaperProps={{
                    sx: {
                        width: 240,
                        background: 'rgba(10,10,10,0.99)',
                        borderRight: '1px solid rgba(219,0,29,0.15)',
                    },
                }}
            >
                <StaffSidebar permissions={permissions} onNavigate={() => setDrawerOpen(false)} />
            </Drawer>

            {/* Content area */}
            <div className='flex-1 min-w-0 md:pt-0 pt-[44px]'>
                {children}
            </div>

        </div>
    )
}
