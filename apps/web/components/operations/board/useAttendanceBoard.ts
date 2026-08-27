'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import type { BoardAction } from '@/lib/attendance/actions'
import type { RosterSlot } from '@/lib/attendance/roster'
import type { AttendanceStage } from '@/lib/operations/stage'

const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:3000/collab'

/**
 * Live state for the attendance board.
 *
 * ## Why Mongo stays the authority
 *
 * The obvious move is to put the board in the Y.js document, the way the
 * operation map does, and let CRDT merge handle everything. That is wrong here
 * for a reason that has nothing to do with merge semantics: the collab socket
 * only ever *authenticates*, it never authorises per field. In a CRDT board
 * any connected member could write any position, and "members may only move
 * themselves" — the rule the whole design rests on — becomes unenforceable.
 * Putting a validator in front of it just rebuilds what we have here.
 *
 * So writes are ordinary POSTs the server validates, and the Y.js document
 * carries one number: the revision. A peer sees it move and refetches. That
 * also gets presence for free from the awareness channel the editor's
 * collaborative cursors already use, which is the "23 watching" cluster.
 *
 * ## Animating other people's changes, not your own
 *
 * You already know where you went; watching your own click replay as an
 * animation reads as lag. The hook therefore reports whether the revision it
 * is showing arrived from somebody else, and the board only plays its arrival
 * effects when it did.
 */

export interface BoardMember {
    id: string
    displayName: string
    avatarURL: string
    rsvp: 'attending' | 'not_attending' | null
    preferredSection: string | null
    preferredRole: string | null
}

export interface BoardPeer {
    name: string
    color: string
    avatar: string | null
}

export interface BoardData {
    roster: RosterSlot[]
    rosterRev: number
    members: Record<string, BoardMember>
    stage: AttendanceStage
    sectionMeta: { category: string; sectionTitle: string | null; color?: string }[]
    customUnits: { id: string; name: string; color?: string }[]
}

export interface BoardState {
    data: BoardData | null
    loading: boolean
    connected: boolean
    peers: BoardPeer[]
    /** True when the roster on screen arrived from another viewer's change. */
    fromPeer: boolean
    error: string | null
}

interface AttendanceResponse {
    roster?: RosterSlot[]
    rosterRev?: number
    stage?: AttendanceStage
    recordsWithUsers?: {
        userId: string
        rsvp: 'attending' | 'not_attending' | null
        preferredSection?: string | null
        preferredRole?: string | null
        user: { id: string; displayName: string; avatarURL: string } | null
    }[]
    sectionMeta?: { category: string; sectionTitle: string | null; color?: string }[]
    customUnits?: { id: string; name: string; color?: string }[]
}

function toBoardData(res: AttendanceResponse): BoardData {
    const members: Record<string, BoardMember> = {}
    for (const r of res.recordsWithUsers ?? []) {
        members[r.userId] = {
            id: r.userId,
            displayName: r.user?.displayName ?? 'Unknown',
            avatarURL: r.user?.avatarURL ?? '',
            rsvp: r.rsvp,
            preferredSection: r.preferredSection ?? null,
            preferredRole: r.preferredRole ?? null,
        }
    }
    return {
        roster: res.roster ?? [],
        rosterRev: res.rosterRev ?? 0,
        members,
        stage: res.stage ?? 'preparing',
        sectionMeta: res.sectionMeta ?? [],
        customUnits: res.customUnits ?? [],
    }
}

export function useAttendanceBoard(operationId: string) {
    const [ydoc] = useState(() => new Y.Doc())
    const [state, setState] = useState<BoardState>({
        data: null, loading: true, connected: false, peers: [], fromPeer: false, error: null,
    })
    const providerRef = useRef<HocuspocusProvider | null>(null)

    // Revisions this client produced. An incoming bump for one of these is our
    // own echo coming back off the wire, not somebody else's move.
    const ownRevs = useRef(new Set<number>())

    const load = useCallback(async (fromPeer: boolean) => {
        try {
            const res = await fetch(`/api/operations/${operationId}/attendance`)
            if (!res.ok) throw new Error('Could not load the attendance board')
            const data = toBoardData(await res.json())
            setState(prev => ({ ...prev, data, loading: false, fromPeer, error: null }))
        } catch (e) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: e instanceof Error ? e.message : 'Could not load the attendance board',
            }))
        }
    }, [operationId])

    useEffect(() => { load(false) }, [load])

    // ── The signal channel ────────────────────────────────────────────────────

    useEffect(() => {
        let destroyed = false
        const board = ydoc.getMap<number>('board')

        const onRev = () => {
            if (destroyed) return
            const rev = board.get('rev') ?? 0
            if (ownRevs.current.has(rev)) return   // our own write echoing back
            load(true)
        }
        board.observe(onRev)

        fetch('/api/me/token')
            .then(r => r.json())
            .then(({ token, name, color, avatar }) => {
                if (destroyed || !token) return
                const provider = new HocuspocusProvider({
                    url: COLLAB_WS_URL,
                    name: `att-${operationId}`,
                    document: ydoc,
                    token,
                    onSynced: () => {
                        if (!destroyed) setState(prev => ({ ...prev, connected: true }))
                    },
                    onStatus: ({ status }) => {
                        if (!destroyed && status !== 'connected') {
                            setState(prev => ({ ...prev, connected: false }))
                        }
                    },
                    onAwarenessUpdate: () => {
                        if (destroyed) return
                        const states = provider.awareness?.getStates()
                        if (!states) return
                        const peers: BoardPeer[] = []
                        states.forEach((s, clientId) => {
                            if (clientId === provider.awareness?.clientID) return
                            if (s?.boardUser) peers.push(s.boardUser as BoardPeer)
                        })
                        setState(prev => ({ ...prev, peers }))
                    },
                })
                provider.setAwarenessField('boardUser', {
                    name: name || 'Unknown',
                    color: color || '#4f8ca8',
                    avatar: avatar || null,
                })
                providerRef.current = provider
            })
            .catch(() => {
                // Not signed in, or the collab server is down. The board still
                // renders and still works — it just stops being live, so fall
                // back to a slow poll rather than going stale silently.
            })

        return () => {
            destroyed = true
            board.unobserve(onRev)
            providerRef.current?.destroy()
            providerRef.current = null
        }
    }, [operationId, ydoc, load])

    // Backstop. Server-side changes — the cron closing RSVP, a stage advancing
    // elsewhere — do not bump the revision, and neither does anything at all if
    // the socket failed to connect.
    useEffect(() => {
        const id = setInterval(() => load(true), 30_000)
        return () => clearInterval(id)
    }, [load])

    // ── Writing ───────────────────────────────────────────────────────────────

    const act = useCallback(async (action: BoardAction): Promise<string | null> => {
        try {
            const res = await fetch(`/api/operations/${operationId}/attendance/roster`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action),
            })
            const json = await res.json()
            if (!res.ok) return json.error ?? 'That did not work'

            // Apply our own result directly: we already have the authoritative
            // roster back, so a refetch would only add a round-trip of lag to
            // the one person who most needs the board to feel immediate.
            if (json.roster) {
                setState(prev => prev.data
                    ? { ...prev, data: { ...prev.data, roster: json.roster, rosterRev: json.rev }, fromPeer: false }
                    : prev)
            } else {
                await load(false)
            }

            // Tell everyone else. Recording it first stops our own broadcast
            // bouncing back and triggering a pointless refetch.
            if (typeof json.rev === 'number') {
                ownRevs.current.add(json.rev)
                ydoc.getMap<number>('board').set('rev', json.rev)
            }
            return null
        } catch {
            return 'Could not reach the server'
        }
    }, [operationId, ydoc, load])

    return { ...state, act, reload: () => load(false) }
}
