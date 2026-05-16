'use client'

import { useState, useEffect, useCallback, useRef, useMemo, Suspense, createContext, useContext } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Drawer, Dialog, DialogContent } from '@mui/material'
import StaffSidebar from './StaffSidebar'

export interface DashboardPermissions {
    displayName: string
    isStaff: boolean
    canSeeJ1: boolean
    canManageJ1: boolean
    canSeeJ2: boolean
    canSeeJ3: boolean
    canSeeJ4: boolean
    canSeeJ5: boolean
    canSeeJ6: boolean
    canSeeJ7: boolean
    canSeeOrbat: boolean
    canSeePersonnel: boolean
}

// ── Lockout context ────────────────────────────────────────────────────────────

interface LockoutContextValue {
    lockoutActive: boolean
    refreshLockout: () => Promise<void>
    showLockoutModal: () => void
}

const LockoutContext = createContext<LockoutContextValue>({
    lockoutActive: false,
    refreshLockout: async () => {},
    showLockoutModal: () => {},
})

export function useLockout() {
    return useContext(LockoutContext)
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export default function StaffDashboardShell({
    permissions,
    children,
}: {
    permissions: DashboardPermissions
    children: React.ReactNode
}) {
    const [drawerOpen, setDrawerOpen]         = useState(false)
    const [lockoutActive, setLockoutActive]   = useState(false)
    const [lockoutModalOpen, setLockoutModalOpen] = useState(false)
    const redirectedRef = useRef(false)
    const pathname = usePathname()
    const router   = useRouter()

    const checkLockout = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/tasks/lockout-status')
            if (!res.ok) return
            const { locked } = await res.json() as { locked: boolean }
            setLockoutActive(prev => prev === locked ? prev : locked)
            if (locked && !pathname.startsWith('/dashboard/tasks') && !redirectedRef.current) {
                redirectedRef.current = true
                router.push('/dashboard/tasks')
            }
        } catch { /* network error — don't lock */ }
    }, [pathname, router])

    // Run once on mount — check lockout status and redirect if needed
    useEffect(() => {
        checkLockout()
    }, []) // eslint-disable-line

    const showLockoutModal = useCallback(() => setLockoutModalOpen(true), [])

    const contextValue = useMemo<LockoutContextValue>(() => ({
        lockoutActive,
        refreshLockout: checkLockout,
        showLockoutModal,
    }), [lockoutActive, checkLockout, showLockoutModal])

    return (
        <LockoutContext.Provider value={contextValue}>
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

                {/* Lockout navigation-block modal */}
                <Dialog
                    open={lockoutModalOpen}
                    onClose={() => setLockoutModalOpen(false)}
                    maxWidth='xs'
                    fullWidth
                    PaperProps={{
                        style: {
                            background: '#0f0f0f',
                            border: '1px solid rgba(219,0,29,0.45)',
                            borderTop: '3px solid var(--red)',
                            borderRadius: 0,
                        },
                    }}
                >
                    <DialogContent style={{ padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace' }}>
                            {'// OVERDUE TASKS'}
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', lineHeight: 1.2 }}>
                            Overdue Tasks Require Action
                        </div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                            You have overdue tasks that must be actioned before you can leave this page.
                            Please start, complete, request an extension, or request reassignment for each overdue task.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <button
                                onClick={() => setLockoutModalOpen(false)}
                                style={{
                                    background: 'rgba(219,0,29,0.22)',
                                    border: '1px solid rgba(219,0,29,0.4)',
                                    color: 'rgba(237,237,237,0.9)',
                                    padding: '8px 20px',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Return to Tasks
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>

            </div>
        </LockoutContext.Provider>
    )
}
