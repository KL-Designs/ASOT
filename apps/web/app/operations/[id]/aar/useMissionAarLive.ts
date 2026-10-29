'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:3000/collab'

export interface AarPeer { name: string; color: string; avatar: string | null; section: string | null }

/**
 * Row 328: who else is in the Mission AAR, and a nudge when they save.
 *
 * The attendance board's split: Mongo holds the blocks and every save is a
 * checked PUT; the live document `maar-{operationId}` carries a revision per
 * section and each viewer's presence (including which section they are in).
 * A peer's save bumps that section's revision and everyone else refetches.
 */
export function useMissionAarLive(operationId: string, enabled: boolean, onPeerSave: () => void) {
    const [ydoc] = useState(() => new Y.Doc())
    const [peers, setPeers] = useState<AarPeer[]>([])
    const providerRef = useRef<HocuspocusProvider | null>(null)
    const own = useRef(new Set<string>())
    const peerKey = useRef('')
    const onPeerSaveRef = useRef(onPeerSave)
    onPeerSaveRef.current = onPeerSave

    useEffect(() => {
        if (!enabled) return
        let destroyed = false
        const revs = ydoc.getMap<string>('revs')
        const onRev = (e: Y.YMapEvent<string>) => {
            for (const key of e.keysChanged) {
                const v = revs.get(key)
                if (v && own.current.has(v)) continue
                onPeerSaveRef.current()
                return
            }
        }
        revs.observe(onRev)

        fetch('/api/me/token')
            .then(r => r.json())
            .then(({ token, name, color, avatar }) => {
                if (destroyed || !token) return
                const provider = new HocuspocusProvider({
                    url: COLLAB_WS_URL,
                    name: `maar-${operationId}`,
                    document: ydoc,
                    token,
                    onAwarenessUpdate: () => {
                        if (destroyed) return
                        const list: AarPeer[] = []
                        provider.awareness?.getStates().forEach((st, clientId) => {
                            if (clientId === provider.awareness?.clientID) return
                            if (st?.aarUser) list.push(st.aarUser as AarPeer)
                        })
                        const key = list.map(p => `${p.name}|${p.section}`).join(',')
                        if (key === peerKey.current) return
                        peerKey.current = key
                        setPeers(list)
                    },
                })
                provider.setAwarenessField('aarUser', { name: name || 'Unknown', color: color || '#4f8ca8', avatar: avatar || null, section: null })
                providerRef.current = provider
            })
            .catch(() => { /* Not live; saves still work. */ })

        return () => {
            destroyed = true
            revs.unobserve(onRev)
            providerRef.current?.destroy()
            providerRef.current = null
        }
    }, [operationId, enabled, ydoc])

    /** Tell the room which section this viewer is working in, or none. */
    const focus = useCallback((section: string | null) => {
        const p = providerRef.current
        const current = p?.awareness?.getLocalState()?.aarUser as AarPeer | undefined
        if (p && current) p.setAwarenessField('aarUser', { ...current, section })
    }, [])

    /** After a save: bump the section's revision so peers refetch. */
    const saved = useCallback((section: string) => {
        const rev = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        own.current.add(rev)
        ydoc.getMap<string>('revs').set(section, rev)
    }, [ydoc])

    return { peers, focus, saved }
}
