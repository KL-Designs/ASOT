'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Typography } from '@mui/material'
import { CheckCircleOutline } from '@mui/icons-material'
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardOverview({
    displayName,
}: {
    displayName: string
    permissions: DashboardPermissions
}) {
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
        <div className='h-full w-full p-6 md:p-8 flex flex-col gap-6 max-w-[1100px]'>

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
                        Member Portal
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

            {/* ── Tasks ──────────────────────────────────────────────────────── */}
            <TasksWidget />

        </div>
    )
}
