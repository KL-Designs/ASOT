'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import type { MapLayer, MapAnnotation, MapPresenceUser, AnnotationType, AnnotationProperties } from './types'

function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:3000/collab'

export interface MapYjsState {
    layers: MapLayer[]
    annotations: MapAnnotation[]
    peers: MapPresenceUser[]
    connected: boolean
}

export interface MapYjsActions {
    addLayer: (name: string, color?: string) => string
    updateLayer: (id: string, patch: Partial<Omit<MapLayer, 'id'>>) => void
    removeLayer: (id: string) => void
    addAnnotation: (layerId: string, type: AnnotationType, geometry: number[][], properties: Partial<AnnotationProperties>) => string
    updateAnnotation: (id: string, patch: { geometry?: number[][], properties?: Partial<AnnotationProperties> }) => void
    removeAnnotation: (id: string) => void
    broadcastCursor: (pos: [number, number] | null) => void
    undo: () => void
    redo: () => void
}

function readLayers(ydoc: Y.Doc): MapLayer[] {
    const layerMap = ydoc.getMap<Y.Map<unknown>>('mapLayers')
    const order = ydoc.getArray<string>('mapLayerOrder').toArray()
    const layers: MapLayer[] = []
    for (let i = 0; i < order.length; i++) {
        const id = order[i]
        const entry = layerMap.get(id)
        if (!entry) continue
        layers.push({
            id,
            name: (entry.get('name') as string) || 'Layer',
            color: (entry.get('color') as string) || '#3498db',
            visible: entry.get('visible') !== false,
            order: i,
        })
    }
    return layers
}

function readAnnotations(ydoc: Y.Doc): MapAnnotation[] {
    const annMap = ydoc.getMap<Y.Map<unknown>>('mapAnnotations')
    const result: MapAnnotation[] = []
    annMap.forEach((entry, id) => {
        try {
            result.push({
                id,
                layerId: entry.get('layerId') as string,
                type: entry.get('type') as AnnotationType,
                geometry: JSON.parse(entry.get('geometry') as string),
                properties: JSON.parse(entry.get('properties') as string),
            })
        } catch {}
    })
    return result
}

export function useMapYjs(operationId: string, canEdit: boolean): [MapYjsState, MapYjsActions] {
    const [ydoc] = useState(() => new Y.Doc())
    const [state, setState] = useState<MapYjsState>({
        layers: [],
        annotations: [],
        peers: [],
        connected: false,
    })
    const providerRef = useRef<HocuspocusProvider | null>(null)
    const undoManagerRef = useRef<Y.UndoManager | null>(null)

    useEffect(() => {
        const annotations = ydoc.getMap<Y.Map<unknown>>('mapAnnotations')
        const layers     = ydoc.getMap<Y.Map<unknown>>('mapLayers')
        const layerOrder = ydoc.getArray<string>('mapLayerOrder')
        undoManagerRef.current = new Y.UndoManager([annotations, layers, layerOrder], { captureTimeout: 500 })
        return () => { undoManagerRef.current?.destroy(); undoManagerRef.current = null }
    }, [ydoc])

    // Sync Yjs state → React state
    const sync = useCallback(() => {
        setState(prev => ({
            ...prev,
            layers: readLayers(ydoc),
            annotations: readAnnotations(ydoc),
        }))
    }, [ydoc])

    useEffect(() => {
        let destroyed = false

        const layers = ydoc.getMap('mapLayers')
        const layerOrder = ydoc.getArray('mapLayerOrder')
        const annotations = ydoc.getMap('mapAnnotations')

        layers.observeDeep(sync)
        layerOrder.observe(sync)
        annotations.observeDeep(sync)

        if (!canEdit) {
            // Read-only: just sync from a fresh provider, no token needed beyond basic auth
            // For the view page we use a read-only connection (no writes allowed)
        }

        fetch('/api/me/token')
            .then(r => r.json())
            .then(({ token, name, color, avatar }) => {
                if (destroyed || !token) return
                const provider = new HocuspocusProvider({
                    url: COLLAB_WS_URL,
                    name: `${operationId}-map`,
                    document: ydoc,
                    token,
                    onSynced: () => {
                        if (destroyed) return
                        sync()
                        setState(prev => ({ ...prev, connected: true }))
                    },
                    onStatus: ({ status }) => {
                        if (destroyed) return
                        if (status !== 'connected') setState(prev => ({ ...prev, connected: false }))
                    },
                    onAwarenessUpdate: () => {
                        if (destroyed) return
                        const states = provider.awareness?.getStates()
                        if (!states) return
                        const peers: MapPresenceUser[] = []
                        states.forEach((s, clientId) => {
                            if (clientId === provider.awareness?.clientID) return
                            if (s?.mapUser) peers.push(s.mapUser as MapPresenceUser)
                        })
                        setState(prev => ({ ...prev, peers }))
                    },
                })

                // Set own presence
                provider.setAwarenessField('mapUser', {
                    name: name || 'Unknown',
                    color: color || '#db001d',
                    avatar: avatar || null,
                    cursor: null,
                })

                providerRef.current = provider
            })
            .catch(() => {
                // Not logged in — view-only without realtime; component will show static data
            })

        return () => {
            destroyed = true
            layers.unobserveDeep(sync)
            layerOrder.unobserve(sync)
            annotations.unobserveDeep(sync)
            providerRef.current?.destroy()
            providerRef.current = null
        }
    }, [operationId, canEdit, ydoc, sync])

    // ── Actions ────────────────────────────────────────────────────────────────

    const actions: MapYjsActions = {
        addLayer(name, color = '#3498db') {
            if (!canEdit) return ''
            const id = uid()
            const layerMap = ydoc.getMap<Y.Map<unknown>>('mapLayers')
            const layerOrder = ydoc.getArray<string>('mapLayerOrder')
            ydoc.transact(() => {
                const entry = new Y.Map<unknown>()
                entry.set('name', name)
                entry.set('color', color)
                entry.set('visible', true)
                layerMap.set(id, entry)
                layerOrder.push([id])
            })
            return id
        },

        updateLayer(id, patch) {
            if (!canEdit) return
            const entry = ydoc.getMap<Y.Map<unknown>>('mapLayers').get(id)
            if (!entry) return
            ydoc.transact(() => {
                Object.entries(patch).forEach(([k, v]) => entry.set(k, v))
            })
        },

        removeLayer(id) {
            if (!canEdit) return
            ydoc.transact(() => {
                ydoc.getMap('mapLayers').delete(id)
                const order = ydoc.getArray<string>('mapLayerOrder')
                const idx = order.toArray().indexOf(id)
                if (idx >= 0) order.delete(idx, 1)
                // Remove all annotations on this layer
                const annMap = ydoc.getMap<Y.Map<unknown>>('mapAnnotations')
                const toDelete: string[] = []
                annMap.forEach((entry, annId) => {
                    if (entry.get('layerId') === id) toDelete.push(annId)
                })
                toDelete.forEach(annId => annMap.delete(annId))
            })
        },

        addAnnotation(layerId, type, geometry, properties) {
            if (!canEdit) return ''
            const id = uid()
            const defaults: AnnotationProperties = {
                color: '#db001d',
                weight: 2,
                fillColor: '#db001d',
                fillOpacity: 0.2,
                label: '',
                ...properties,
            }
            const entry = new Y.Map<unknown>()
            entry.set('layerId', layerId)
            entry.set('type', type)
            entry.set('geometry', JSON.stringify(geometry))
            entry.set('properties', JSON.stringify(defaults))
            ydoc.getMap<Y.Map<unknown>>('mapAnnotations').set(id, entry)
            return id
        },

        updateAnnotation(id, patch) {
            if (!canEdit) return
            const entry = ydoc.getMap<Y.Map<unknown>>('mapAnnotations').get(id)
            if (!entry) return
            ydoc.transact(() => {
                if (patch.geometry !== undefined) entry.set('geometry', JSON.stringify(patch.geometry))
                if (patch.properties !== undefined) {
                    const existing = JSON.parse(entry.get('properties') as string ?? '{}')
                    entry.set('properties', JSON.stringify({ ...existing, ...patch.properties }))
                }
            })
        },

        removeAnnotation(id) {
            if (!canEdit) return
            ydoc.getMap('mapAnnotations').delete(id)
        },

        undo() { if (canEdit) undoManagerRef.current?.undo() },
        redo() { if (canEdit) undoManagerRef.current?.redo() },

        broadcastCursor(pos) {
            const provider = providerRef.current
            if (!provider?.awareness) return
            const current = provider.awareness.getLocalState()
            if (!current?.mapUser) return
            provider.setAwarenessField('mapUser', { ...current.mapUser, cursor: pos })
        },
    }

    return [state, actions]
}
