'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications, NotificationItem } from '@/hooks/useNotifications'

function playChime() {
    try {
        const ctx = new AudioContext()
        const note = (freq: number, start: number, dur: number) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.value = freq
            gain.gain.setValueAtTime(0, start)
            gain.gain.linearRampToValueAtTime(0.12, start + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
            osc.start(start)
            osc.stop(start + dur)
        }
        const t = ctx.currentTime
        note(880, t, 0.7)          // A5
        note(1108.73, t + 0.18, 0.7) // C#6
        setTimeout(() => ctx.close(), 1500)
    } catch { /* AudioContext blocked — ignore */ }
}

interface Toast extends NotificationItem { key: number }
let toastKey = 0

const TYPE_LABELS: Record<string, string> = {
    task_assigned:  'Task',
    task_extended:  'Extension',
    task_completed: 'Completed',
    task_extension_requested: 'Ext. Request',
    task_extension_approved:  'Ext. Approved',
    task_extension_denied:    'Ext. Denied',
    calendar_reminder: 'Reminder',
    system: 'System',
}

const TYPE_COLORS: Record<string, string> = {
    task_assigned:  '#3b82f6',
    task_extended:  '#f59e0b',
    task_completed: '#10b981',
    task_extension_requested: '#f59e0b',
    task_extension_approved:  '#10b981',
    task_extension_denied:    'rgba(219,0,29,0.85)',
    calendar_reminder: 'rgba(219,0,29,0.85)',
    system: 'rgba(237,237,237,0.4)',
}

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins  < 1)  return 'just now'
    if (mins  < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
}

export default function NotificationBell() {
    const { notifications, newArrivals, unreadCount, markRead, markAllRead, dismiss, dismissAll } = useNotifications()
    const [open, setOpen] = useState(false)
    const [toasts, setToasts] = useState<Toast[]>([])
    const ref = useRef<HTMLDivElement>(null)
    const router = useRouter()

    const dismissToast = useCallback((key: number) => {
        setToasts(prev => prev.filter(t => t.key !== key))
    }, [])

    // Show toast + play chime for newly arrived notifications
    useEffect(() => {
        if (newArrivals.length === 0) return
        playChime()
        const created: Toast[] = newArrivals.map(n => ({ ...n, key: toastKey++ }))
        setToasts(prev => [...prev, ...created])
        created.forEach(t => {
            setTimeout(() => dismissToast(t.key), 6000)
        })
    }, [newArrivals, dismissToast])

    // Close on outside click
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    function handleClick(n: (typeof notifications)[number]) {
        markRead(n._id)
        if (n.actionUrl) {
            setOpen(false)
            router.push(n.actionUrl as never)
        }
    }

    return (
        <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>

            {/* Bell button */}
            <button
                onClick={() => setOpen(v => !v)}
                title='Notifications'
                style={{
                    position: 'relative',
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    width: 34,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: unreadCount > 0 ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.45)',
                    transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(219,0,29,0.5)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
            >
                {/* Bell SVG */}
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                    <path d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' />
                    <path d='M13.73 21a2 2 0 0 1-3.46 0' />
                </svg>

                {/* Unread badge */}
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        background: 'var(--red)',
                        color: '#fff',
                        fontSize: '0.55rem',
                        fontWeight: 800,
                        lineHeight: 1,
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 3px',
                        fontFamily: 'monospace',
                        letterSpacing: 0,
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: 340,
                        maxHeight: 480,
                        background: 'rgba(12,12,12,0.98)',
                        border: '1px solid rgba(219,0,29,0.42)',
                        borderTop: '2px solid var(--red)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                        zIndex: 200,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(219,0,29,0.27)',
                        flexShrink: 0,
                    }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.75)', fontFamily: 'monospace' }}>
                            {'// NOTIFICATIONS '}{unreadCount > 0 ? `[${unreadCount}]` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.55rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'monospace', transition: 'color 0.12s' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.7)' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.35)' }}
                                >
                                    Mark all read
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    onClick={dismissAll}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.55rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'monospace', transition: 'color 0.12s' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(219,0,29,0.8)' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.35)' }}
                                >
                                    Clear all
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'rgba(237,237,237,0.3)', lineHeight: 1, transition: 'color 0.12s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.3)' }}
                            >×</button>
                        </div>
                    </div>

                    {/* List */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {notifications.length === 0 ? (
                            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                                    No notifications
                                </div>
                            </div>
                        ) : (
                            notifications.map(n => {
                                const color = TYPE_COLORS[n.type] ?? 'rgba(237,237,237,0.4)'
                                const isUnread = !n.readAt
                                return (
                                    <div
                                        key={n._id}
                                        style={{
                                            position: 'relative',
                                            display: 'flex',
                                            gap: 10,
                                            padding: '10px 14px',
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            background: isUnread ? 'rgba(219,0,29,0.04)' : 'transparent',
                                            cursor: n.actionUrl ? 'pointer' : 'default',
                                            transition: 'background 0.12s',
                                        }}
                                        onClick={() => handleClick(n)}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? 'rgba(219,0,29,0.08)' : 'rgba(255,255,255,0.03)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? 'rgba(219,0,29,0.04)' : 'transparent' }}
                                    >
                                        {/* Unread dot */}
                                        <div style={{ flexShrink: 0, paddingTop: 4 }}>
                                            <span style={{
                                                display: 'block', width: 6, height: 6, borderRadius: '50%',
                                                background: isUnread ? 'var(--red)' : 'transparent',
                                                boxShadow: isUnread ? '0 0 4px rgba(219,0,29,0.6)' : 'none',
                                                transition: 'background 0.15s',
                                            }} />
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color, fontFamily: 'monospace' }}>
                                                    {TYPE_LABELS[n.type] ?? n.type}
                                                </span>
                                                <span style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>
                                                    {timeAgo(n.createdAt)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.62rem', fontWeight: isUnread ? 700 : 400, color: isUnread ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.55)', lineHeight: 1.3, marginBottom: 2 }}>
                                                {n.title}
                                            </div>
                                            <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.4 }}>
                                                {n.body}
                                            </div>
                                        </div>

                                        {/* Dismiss */}
                                        <button
                                            onClick={e => { e.stopPropagation(); dismiss(n._id) }}
                                            title='Dismiss'
                                            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.15)', fontSize: '0.75rem', lineHeight: 1, padding: '2px 4px', transition: 'color 0.12s', flexShrink: 0 }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)' }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.15)' }}
                                        >×</button>
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Footer — link to tasks */}
                    <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(219,0,29,0.12)', flexShrink: 0 }}>
                        <button
                            onClick={() => { setOpen(false); router.push('/dashboard/tasks') }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'monospace', transition: 'color 0.12s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(219,0,29,0.8)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.3)' }}
                        >
                            View all tasks →
                        </button>
                    </div>
                </div>
            )}

            {/* Toast popups — fixed bottom-right */}
            {toasts.length > 0 && (
            <div style={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                zIndex: 9999,
                pointerEvents: 'none',
            }}>
                {toasts.map(t => {
                    const color = TYPE_COLORS[t.type] ?? 'rgba(237,237,237,0.4)'
                    const label = TYPE_LABELS[t.type] ?? t.type
                    return (
                        <div
                            key={t.key}
                            style={{
                                pointerEvents: 'auto',
                                width: 300,
                                background: 'rgba(12,12,12,0.97)',
                                border: '1px solid rgba(219,0,29,0.27)',
                                borderLeft: '3px solid var(--red)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                                padding: '12px 14px',
                                animation: 'toastIn 0.25s ease',
                                display: 'flex',
                                gap: 10,
                                alignItems: 'flex-start',
                            }}
                        >
                            {/* Bell icon */}
                            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke={color} strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' style={{ flexShrink: 0, marginTop: 2 }}>
                                <path d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' />
                                <path d='M13.73 21a2 2 0 0 1-3.46 0' />
                            </svg>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color, fontFamily: 'monospace', marginBottom: 4 }}>
                                    {label}
                                </div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', lineHeight: 1.3, marginBottom: 3 }}>
                                    {t.title}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.4 }}>
                                    {t.body}
                                </div>
                            </div>
                            <button
                                onClick={() => dismissToast(t.key)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.2)', fontSize: '0.85rem', lineHeight: 1, padding: '2px 2px', flexShrink: 0, transition: 'color 0.12s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.2)' }}
                            >×</button>
                        </div>
                    )
                })}
            </div>
        )}
        </div>
    )
}
