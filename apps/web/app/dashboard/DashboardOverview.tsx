'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Typography, Tooltip } from '@mui/material'
import { CheckCircleOutline, Language, Storage, Backup, Forum, Headset, Warning } from '@mui/icons-material'
import {
    DndContext, closestCenter, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useFavourites, type Favourite } from '@/hooks/useFavourites'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import DashboardQuickLinks from './_components/DashboardQuickLinks'
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

// ── Service status icons ──────────────────────────────────────────────────────

type ServiceStatus = { online: boolean; devMode?: boolean }
type StatusResponse = {
    website: ServiceStatus
    database: ServiceStatus
    backups: ServiceStatus
    discord: ServiceStatus
    teamspeak: ServiceStatus
}

const ALL_OFFLINE: StatusResponse = {
    website: { online: false },
    database: { online: false },
    backups: { online: false },
    discord: { online: false },
    teamspeak: { online: false },
}

function statusColor(status: ServiceStatus): string {
    if (status.devMode) return status.online ? 'rgba(96,165,250,0.9)' : 'rgba(251,191,36,0.95)'
    return status.online ? 'rgba(34,197,94,0.85)' : 'rgba(219,0,29,0.85)'
}

function statusLabel(name: string, status: ServiceStatus): string {
    if (status.devMode) return status.online ? `${name}: Dev mode (connected)` : `${name}: Dev mode — OFFLINE`
    return `${name}: ${status.online ? 'Online' : 'Offline'}`
}

function ServiceIcon({ name, status, Icon }: { name: string; status: ServiceStatus; Icon: typeof Language }) {
    const showWarning = !!status.devMode && !status.online
    return (
        <Tooltip title={statusLabel(name, status)}>
            <div style={{ position: 'relative', display: 'inline-flex', lineHeight: 0 }}>
                <Icon sx={{ fontSize: 15, color: statusColor(status) }} />
                {showWarning && (
                    <Warning sx={{ fontSize: 9, color: 'rgba(251,191,36,0.95)', position: 'absolute', bottom: -3, right: -4 }} />
                )}
            </div>
        </Tooltip>
    )
}

function ServiceStatusIcons() {
    const [status, setStatus] = useState<StatusResponse | null>(null)

    useEffect(() => {
        let cancelled = false
        async function poll() {
            try {
                const res = await fetch('/api/dashboard/status')
                if (!res.ok) throw new Error('bad response')
                const data: StatusResponse = await res.json()
                if (!cancelled) setStatus(data)
            } catch {
                if (!cancelled) setStatus(ALL_OFFLINE)
            }
        }
        poll()
        const id = setInterval(poll, 30_000)
        return () => { cancelled = true; clearInterval(id) }
    }, [])

    if (!status) return null

    return (
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <ServiceIcon name='Website' status={status.website} Icon={Language} />
            <ServiceIcon name='Database' status={status.database} Icon={Storage} />
            <ServiceIcon name='Backups' status={status.backups} Icon={Backup} />
            <ServiceIcon name='Discord' status={status.discord} Icon={Forum} />
            <ServiceIcon name='TeamSpeak' status={status.teamspeak} Icon={Headset} />
        </div>
    )
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.55rem', color: 'rgba(219,0,29,0.4)', lineHeight: 1 }}>{'//'}</span>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>
                {label}
            </span>
        </div>
    )
}

// ── Derive card appearance from favourite href ─────────────────────────────────

function deriveCard(fav: Favourite): { code: string; color: string } {
    const h = fav.href
    if (h.includes('/j1'))            return { code: 'J1',  color: '#3b82f6' }
    if (h.includes('/j2'))            return { code: 'J2',  color: '#8b5cf6' }
    if (h.includes('/j3'))            return { code: 'J3',  color: '#10b981' }
    if (h.includes('/j4'))            return { code: 'J4',  color: '#ef4444' }
    if (h.includes('/j5') || h.includes('/gallery')) return { code: 'J5', color: '#f59e0b' }
    if (h.includes('/j6'))            return { code: 'J6',  color: '#06b6d4' }
    if (h.includes('/j7'))            return { code: 'J7',  color: '#a78bfa' }
    if (h.includes('/calendar'))      return { code: 'CAL', color: 'rgba(219,0,29,0.85)' }
    if (h.includes('/orbat'))         return { code: 'ORB', color: 'rgba(219,0,29,0.7)' }
    if (h.includes('/personnel'))     return { code: 'PER', color: 'rgba(219,0,29,0.6)' }
    if (h.includes('/training-docs')) return { code: 'TRN', color: 'rgba(237,237,237,0.4)' }
    if (h.includes('/sops'))          return { code: 'SOP', color: 'rgba(237,237,237,0.4)' }
    if (h.includes('/tickets'))       return { code: 'TKT', color: 'rgba(237,237,237,0.4)' }
    return { code: fav.label.slice(0, 3).toUpperCase(), color: 'rgba(219,0,29,0.7)' }
}

// ── Sortable favourite card ────────────────────────────────────────────────────

function SortableFavCard({
    fav,
    onNavigate,
    onUnpin,
}: {
    fav: Favourite
    onNavigate: (fav: Favourite) => void
    onUnpin: (id: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fav.id })
    const { code, color } = deriveCard(fav)
    const [hovered, setHovered] = useState(false)

    return (
        <div
            ref={setNodeRef}
            style={{
                flex: '1 1 140px',
                maxWidth: 180,
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.45 : 1,
                zIndex: isDragging ? 10 : undefined,
            }}
        >
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    position: 'relative',
                    border: `1px solid ${hovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)'}`,
                    borderTop: `2px solid ${color}`,
                    background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                    padding: '14px 14px 12px',
                    height: 90,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'background 0.15s, border-color 0.15s',
                    cursor: isDragging ? 'grabbing' : 'pointer',
                }}
            >
                <CornerBrackets color='rgba(255,255,255,0.08)' size={5} />

                {/* Drag handle — top-right */}
                <div
                    {...attributes}
                    {...listeners}
                    title='Drag to reorder'
                    style={{
                        position: 'absolute',
                        top: 6,
                        right: 30,
                        padding: '2px 4px',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        color: hovered ? 'rgba(237,237,237,0.35)' : 'rgba(237,237,237,0.1)',
                        fontSize: '0.55rem',
                        lineHeight: 1,
                        letterSpacing: 1,
                        transition: 'color 0.15s',
                        userSelect: 'none',
                    }}
                >
                    ⠿
                </div>

                {/* Unpin button — top-right */}
                <button
                    onClick={e => { e.stopPropagation(); onUnpin(fav.id) }}
                    title='Remove from favourites'
                    style={{
                        position: 'absolute',
                        top: 5,
                        right: 8,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        color: hovered ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.1)',
                        fontSize: '0.65rem',
                        lineHeight: 1,
                        transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                    onMouseLeave={e => (e.currentTarget.style.color = hovered ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.1)')}
                >
                    ×
                </button>

                {/* Card content — clickable area */}
                <div
                    onClick={() => onNavigate(fav)}
                    style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, paddingTop: 6 }}
                >
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: 2, color, lineHeight: 1 }}>
                        {code}
                    </div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)', lineHeight: 1.2 }}>
                        {fav.label}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyFavourites() {
    return (
        <div
            style={{
                border: '1px dashed rgba(219,0,29,0.32)',
                background: 'rgba(219,0,29,0.02)',
                padding: '32px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
            }}
        >
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                No favourites pinned
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.2)', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                Pin pages using the <span style={{ color: 'rgba(219,0,29,0.6)', fontWeight: 700 }}>★</span> icon in the sidebar navigation to add them here.
            </div>
        </div>
    )
}

// ── Tasks widget ───────────────────────────────────────────────────────────────

type TaskItem = {
    _id: string
    title: string
    description?: string
    type?: string
    dueDate?: string | null
    status: string
    assignedByName: string
    actionUrl?: string
}

function TaskTypeBadge({ type }: { type?: string }) {
    const map: Record<string, { label: string; color: string }> = {
        attendance:         { label: 'ATT', color: '#f97316' },
        application_review: { label: 'APP', color: '#3b82f6' },
        manual:             { label: 'TSK', color: 'rgba(237,237,237,0.3)' },
    }
    const entry = map[type ?? 'manual'] ?? map.manual
    return (
        <span style={{
            fontSize: '0.48rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '2px 5px',
            border: `1px solid ${entry.color}`,
            color: entry.color,
            borderRadius: 3,
            fontFamily: 'monospace',
            flexShrink: 0,
        }}>
            {entry.label}
        </span>
    )
}

function TasksWidget() {
    const router = useRouter()
    const [tasks, setTasks] = useState<TaskItem[]>([])
    const [loading, setLoading] = useState(true)
    const [completing, setCompleting] = useState<string | null>(null)

    const load = useCallback(() => {
        setLoading(true)
        fetch('/api/admin/tasks?view=mine')
            .then(r => r.json())
            .then(d => { setTasks(d.tasks ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    useEffect(() => { load() }, [load])

    async function handleComplete(taskId: string, e: React.MouseEvent) {
        e.stopPropagation()
        setCompleting(taskId)
        await fetch(`/api/admin/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'complete' }),
        })
        setTasks(prev => prev.filter(t => t._id !== taskId))
        setCompleting(null)
    }

    const preview = tasks.slice(0, 5)
    const overflow = tasks.length - preview.length

    return (
        <div>
            <SectionLabel label='My Tasks' />
            <div style={{
                border: '1px solid rgba(219,0,29,0.42)',
                borderTop: '2px solid var(--red)',
                background: 'rgba(255,255,255,0.03)',
                position: 'relative',
            }}>
                <CornerBrackets />

                {loading ? (
                    <div style={{ padding: '20px 20px', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>
                        Loading…
                    </div>
                ) : tasks.length === 0 ? (
                    <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircleOutline sx={{ fontSize: '1rem', color: 'rgba(34,197,94,0.5)' }} />
                        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.05em' }}>
                            No pending tasks
                        </span>
                    </div>
                ) : (
                    <>
                        {preview.map((task, i) => {
                            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
                            const isCompleting = completing === task._id
                            return (
                                <div
                                    key={task._id}
                                    onClick={() => task.actionUrl ? router.push(task.actionUrl as never) : router.push('/dashboard/tasks')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '9px 14px',
                                        borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                                        cursor: 'pointer',
                                        transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <TaskTypeBadge type={task.type} />

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            color: 'rgba(237,237,237,0.85)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            lineHeight: 1.3,
                                        }}>
                                            {task.title}
                                        </div>
                                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)', marginTop: 1 }}>
                                            {task.assignedByName === 'System' ? 'Auto-assigned' : `From: ${task.assignedByName}`}
                                            {task.dueDate && (
                                                <span style={{ marginLeft: 8, color: isOverdue ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.3)' }}>
                                                    Due {new Date(task.dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                                    {isOverdue && ' — overdue'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={e => handleComplete(task._id, e)}
                                        disabled={isCompleting}
                                        title='Mark complete'
                                        style={{
                                            background: 'none',
                                            border: '1px solid rgba(34,197,94,0.3)',
                                            borderRadius: 4,
                                            padding: '3px 7px',
                                            cursor: isCompleting ? 'default' : 'pointer',
                                            color: isCompleting ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.7)',
                                            fontSize: '0.6rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.08em',
                                            flexShrink: 0,
                                            transition: 'all 0.12s',
                                        }}
                                        onMouseEnter={e => { if (!isCompleting) e.currentTarget.style.background = 'rgba(34,197,94,0.12)' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                                    >
                                        {isCompleting ? '…' : '✓'}
                                    </button>
                                </div>
                            )
                        })}

                        <div style={{
                            borderTop: '1px solid rgba(219,0,29,0.18)',
                            padding: '7px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <span style={{ fontSize: '0.57rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>
                                {tasks.length} pending task{tasks.length !== 1 ? 's' : ''}{overflow > 0 ? ` — ${overflow} more` : ''}
                            </span>
                            <Link
                                href='/dashboard/tasks'
                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(219,0,29,0.7)', textDecoration: 'none', textTransform: 'uppercase' }}
                            >
                                View all →
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ── Operations overview widget ────────────────────────────────────────────────

type OpOverview = {
    _id: string
    title: string
    date: string
    status: string
    department?: string
    ownedByName?: string
    coverImage?: string
    themeColor?: string
}

function OperationsWidget({ isHQ }: { isHQ: boolean }) {
    const [active, setActive] = useState<OpOverview[]>([])
    const [inDev, setInDev] = useState<OpOverview[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const reqs = [fetch('/api/operations?status=Active,Upcoming').then(r => r.json())]
        if (isHQ) reqs.push(fetch('/api/operations?status=In+Development').then(r => r.json()))
        Promise.all(reqs).then(([liveJson, devJson]) => {
            setActive(liveJson.missions ?? [])
            if (devJson) setInDev(devJson.missions ?? [])
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [isHQ])

    const upcoming = active.filter(o => o.status === 'Upcoming')
    const live     = active.filter(o => o.status === 'Active')

    if (loading) return (
        <div>
            <SectionLabel label='Operations' />
            <div style={{ border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)', padding: '18px 16px', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>
                Loading…
            </div>
        </div>
    )

    const empty = live.length === 0 && upcoming.length === 0 && inDev.length === 0

    function OpRow({ op }: { op: OpOverview }) {
        const theme = op.themeColor || '#db001d'
        const isActive = op.status === 'Active'
        const isDev    = op.status === 'In Development'
        const accent = isActive ? 'rgba(0,200,80,0.8)' : isDev ? 'rgba(219,0,29,0.7)' : 'rgba(219,160,0,0.8)'
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {op.coverImage ? (
                    <div style={{ width: 40, height: 26, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <img src={op.coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                ) : (
                    <div style={{ width: 4, flexShrink: 0, alignSelf: 'stretch', background: accent, opacity: 0.5 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.title}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', color: accent, textTransform: 'uppercase' }}>
                            {op.status}
                        </span>
                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.04em' }}>
                            {new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {op.ownedByName && (
                            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.04em' }}>
                                {op.ownedByName}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    {isHQ && !isDev && (
                        <Link href={`/operations/${op._id}/edit`} style={{ textDecoration: 'none' }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 7px', border: '1px solid rgba(219,160,0,0.3)', color: 'rgba(219,160,0,0.7)', cursor: 'pointer' }}>
                                EDIT
                            </span>
                        </Link>
                    )}
                    {isDev ? (
                        <Link href={`/operations/${op._id}/edit`} style={{ textDecoration: 'none' }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 7px', border: '1px solid rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.75)', cursor: 'pointer' }}>
                                OPEN
                            </span>
                        </Link>
                    ) : (
                        <Link href={`/operations/${op._id}`} style={{ textDecoration: 'none' }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 7px', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>
                                VIEW
                            </span>
                        </Link>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div>
            <SectionLabel label='Operations' />
            <div style={{ border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)', position: 'relative' }}>
                <CornerBrackets />

                {empty ? (
                    <div style={{ padding: '20px 16px', fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                        No active or upcoming operations.
                    </div>
                ) : (
                    <div>
                        {live.length > 0 && (
                            <div>
                                <div style={{ padding: '6px 14px 4px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,200,80,0.5)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    Active
                                </div>
                                {live.map(op => <OpRow key={op._id} op={op} />)}
                            </div>
                        )}
                        {upcoming.length > 0 && (
                            <div>
                                <div style={{ padding: '6px 14px 4px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    Upcoming
                                </div>
                                {upcoming.map(op => <OpRow key={op._id} op={op} />)}
                            </div>
                        )}
                        {isHQ && inDev.length > 0 && (
                            <div>
                                <div style={{ padding: '6px 14px 4px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    In Development
                                </div>
                                {inDev.map(op => <OpRow key={op._id} op={op} />)}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ borderTop: '1px solid rgba(219,0,29,0.12)', padding: '6px 14px', display: 'flex', justifyContent: 'flex-end' }}>
                    <Link href='/operations' style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(219,0,29,0.7)', textDecoration: 'none', textTransform: 'uppercase' }}>
                        Operations Board →
                    </Link>
                </div>
            </div>
        </div>
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
    const isHQ = permissions.canSeeJ2 || permissions.isStaff
    const router = useRouter()
    const { favourites, unpin, reorder } = useFavourites()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    )

    const today = new Date().toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })

    function handleNavigate(fav: Favourite) {
        if (fav.tabIndex !== undefined) {
            try { localStorage.setItem(`gotoTab:${fav.href}`, String(fav.tabIndex)) } catch {}
        }
        router.push(fav.href as never)
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = favourites.findIndex(f => f.id === active.id)
        const newIndex = favourites.findIndex(f => f.id === over.id)
        reorder(arrayMove(favourites, oldIndex, newIndex))
    }

    return (
        <div className='h-full w-full p-6 md:p-8 flex flex-col gap-6'>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div
                className='flex items-start justify-between px-5 py-4'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'rgba(219,0,29,0.4)' }}>ASOT</span>
                        <span style={{ color: 'rgba(219,0,29,0.25)' }}>{'//'}</span>
                        <span>UNIT</span>
                    </div>
                    <Typography fontWeight={700} fontSize='1.1rem' letterSpacing={3} style={{ textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 6 }}>
                        Dashboard
                    </Typography>
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)', letterSpacing: '0.04em' }}>
                        Welcome back, {displayName}
                    </Typography>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <ServiceStatusIcons />
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

            {/* ── Favourites (draggable) ─────────────────────────────────────── */}
            <div>
                <SectionLabel label='Favourites ★' />

                {favourites.length === 0 ? (
                    <EmptyFavourites />
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={favourites.map(f => f.id)} strategy={rectSortingStrategy}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                {favourites.map(fav => (
                                    <SortableFavCard
                                        key={fav.id}
                                        fav={fav}
                                        onNavigate={handleNavigate}
                                        onUnpin={unpin}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* ── Quick links (per-department, member-visible) ──────────────── */}
            <DashboardQuickLinks />

            {/* ── Tasks ──────────────────────────────────────────────────────── */}
            <TasksWidget />

            {/* ── Operations overview (staff only) ───────────────────────────── */}
            {permissions.isStaff && <OperationsWidget isHQ={isHQ} />}

        </div>
    )
}
