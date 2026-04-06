'use client'

import { useState, useEffect, useCallback } from 'react'

export interface NotificationItem {
    _id: string
    userId: string
    type: string
    title: string
    body: string
    actionUrl?: string
    relatedId?: string
    createdAt: string
    readAt: string | null
}

const POLL_INTERVAL = 30_000 // 30 seconds

export function useNotifications() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [loading, setLoading] = useState(false)

    const fetch_ = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications')
            if (!res.ok) return
            const data = await res.json()
            setNotifications(data.notifications ?? [])
        } catch {
            // silently fail — network may be unavailable
        }
    }, [])

    useEffect(() => {
        setLoading(true)
        fetch_().finally(() => setLoading(false))
        const id = setInterval(fetch_, POLL_INTERVAL)
        return () => clearInterval(id)
    }, [fetch_])

    const unreadCount = notifications.filter(n => !n.readAt).length

    async function markRead(id: string) {
        setNotifications(prev =>
            prev.map(n => n._id === id ? { ...n, readAt: new Date().toISOString() } : n)
        )
        await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    }

    async function markAllRead() {
        setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
        await fetch('/api/notifications', { method: 'PATCH' })
    }

    async function dismiss(id: string) {
        setNotifications(prev => prev.filter(n => n._id !== id))
        await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
    }

    return { notifications, unreadCount, loading, markRead, markAllRead, dismiss, refresh: fetch_ }
}
