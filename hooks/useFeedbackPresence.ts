'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:3000/collab'

export interface PresenceUser {
    name: string
    color?: string
    avatar?: string | null
}

export function useFeedbackPresence(candidateId: string) {
    const [activeFields, setActiveFields] = useState<Record<string, PresenceUser[]>>({})
    const providerRef = useRef<HocuspocusProvider | null>(null)

    const setActiveField = useCallback((field: string | null) => {
        providerRef.current?.setAwarenessField('activeField', field)
    }, [])

    useEffect(() => {
        let provider: HocuspocusProvider | null = null
        let destroyed = false
        let listener: (() => void) | null = null

        fetch('/api/me/token')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || destroyed) return
                const { token, name, color, avatar } = data as { token: string; name: string; color: string; avatar: string | null }

                const ydoc = new Y.Doc()
                provider = new HocuspocusProvider({
                    url: COLLAB_WS_URL,
                    name: `cfb-${candidateId}`,
                    document: ydoc,
                    token,
                })

                provider.setAwarenessField('user', { name, color, avatar })
                provider.setAwarenessField('activeField', null)

                const awareness = provider.awareness
                if (!awareness) { providerRef.current = provider; return }

                listener = () => {
                    if (!provider?.awareness) return
                    const states = provider.awareness.getStates()
                    const myId = provider.awareness.clientID
                    const map: Record<string, PresenceUser[]> = {}
                    for (const [cid, state] of states) {
                        if (cid === myId) continue
                        const field = state.activeField as string | null | undefined
                        if (!field) continue
                        const user = (state.user ?? { name: 'Unknown' }) as PresenceUser
                        if (!map[field]) map[field] = []
                        map[field].push(user)
                    }
                    setActiveFields(map)
                }

                awareness.on('change', listener)
                providerRef.current = provider
            })
            .catch(() => {})

        return () => {
            destroyed = true
            if (provider?.awareness && listener) provider.awareness.off('change', listener)
            provider?.destroy()
            providerRef.current = null
        }
    }, [candidateId])

    return { activeFields, setActiveField }
}
