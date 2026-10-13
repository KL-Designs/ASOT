'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useMapYjs } from './useMapYjs'
import LayersPanel from './LayersPanel'
import type { DrawingTool, MapMode, MapWorld, A3ToolProps } from './types'
import { DEFAULT_A3_PROPS } from './types'
import { buildSqf } from '@/lib/sqf-export'
import SqfExportModal from './SqfExportModal'
import AnnotationEditor from './AnnotationEditor'
import { chosenVisible, pruneChoices, resolveVisibility, type LayerChoices } from '@/lib/operations/map-layers'

const OperationMap = dynamic(() => import('./OperationMap'), { ssr: false })

interface Props {
    operationId: string
    canEdit: boolean
    world: MapWorld | null
}

export default function MapSection({ operationId, canEdit, world }: Props) {
    const [state, actions] = useMapYjs(operationId, canEdit)
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
    const [activeTool, setActiveTool] = useState<DrawingTool>(null)
    const [activeColor, setActiveColor] = useState('#db001d')
    const [mapMode, setMapMode] = useState<MapMode>('map')
    const [activeA3Props, setActiveA3Props] = useState<A3ToolProps>(DEFAULT_A3_PROPS)
    const [sqfModal, setSqfModal] = useState(false)
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)

    /*
     * Which overlays this viewer has switched on or off. Their own choice, kept
     * in this browser — not in the shared document, where one person hiding a
     * layer used to hide it for everybody, and where somebody who could not
     * edit the map could not choose at all.
     */
    const choicesKey = `asot-map-layers:${operationId}`
    const [choices, setChoices] = useState<LayerChoices>({})
    useEffect(() => {
        try {
            const stored = JSON.parse(window.localStorage.getItem(choicesKey) ?? '{}')
            if (stored && typeof stored === 'object') setChoices(stored)
        } catch { /* a blocked or corrupt store just means no saved choices */ }
    }, [choicesKey])

    const toggleLayer = useCallback((id: string) => {
        setChoices(prev => {
            const layer = state.layers.find(l => l.id === id)
            if (!layer) return prev
            const next = pruneChoices({ ...prev, [id]: !chosenVisible(layer, prev) }, state.layers)
            try { window.localStorage.setItem(choicesKey, JSON.stringify(next)) } catch { /* see above */ }
            return next
        })
    }, [state.layers, choicesKey])

    // What is on the map, and what Export SQF writes: the same list.
    const viewLayers = useMemo(() => resolveVisibility(state.layers, choices), [state.layers, choices])

    const handleA3PropsChange = useCallback((patch: Partial<A3ToolProps>) => {
        setActiveA3Props(prev => ({ ...prev, ...patch }))
    }, [])

    // Auto-select first layer when layers load
    useEffect(() => {
        if (!activeLayerId && state.layers.length > 0) {
            setActiveLayerId(state.layers[0].id)
        }
    }, [state.layers, activeLayerId])

    // Undo / redo
    useEffect(() => {
        if (!canEdit) return
        const handler = (e: KeyboardEvent) => {
            if (!e.ctrlKey || e.key !== 'z') return
            e.preventDefault()
            if (e.shiftKey) actions.redo()
            else actions.undo()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [canEdit, actions])

    const handleAnnotationAdd = useCallback((type: DrawingTool, geometry: number[][], properties: any): string => {
        if (!activeLayerId || !type) return ''
        return actions.addAnnotation(activeLayerId, type, geometry, properties)
    }, [activeLayerId, actions])

    const handleAnnotationUpdate = useCallback((id: string, geometry: number[][]) => {
        actions.updateAnnotation(id, { geometry })
    }, [actions])

    const handleAnnotationRemove = useCallback((id: string) => {
        actions.removeAnnotation(id)
    }, [actions])

    const handleCursorMove = useCallback((pos: [number, number] | null) => {
        actions.broadcastCursor(pos)
    }, [actions])

    const handleToolDone = useCallback(() => {
        setActiveTool(null)
    }, [])

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: 'rgba(10,10,10,0.9)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                fontSize: 13,
                color: '#eee',
                flexShrink: 0,
            }}>
                <span style={{ fontSize: 12, color: world ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    {world?.displayName ?? 'No map configured'}
                </span>

                {world?.hasGeoJSON && (
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: 2 }}>
                        {(['map', 'sat', ...(world.hasTerrain ? ['terrain'] : [])] as MapMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setMapMode(m)}
                                style={{
                                    background: mapMode === m ? 'rgba(255,255,255,0.14)' : 'transparent',
                                    border: 'none',
                                    color: mapMode === m ? '#fff' : 'rgba(255,255,255,0.5)',
                                    borderRadius: 3,
                                    padding: '3px 10px',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: mapMode === m ? 600 : 400,
                                    letterSpacing: '0.05em',
                                }}
                            >
                                {m.toUpperCase()}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {canEdit && (
                    <button
                        onClick={() => setSqfModal(true)}
                        title="Export markers as SQF"
                        style={{
                            background: 'rgba(34,197,94,0.12)',
                            border: '1px solid rgba(34,197,94,0.35)',
                            color: '#4ade80',
                            borderRadius: 4,
                            padding: '3px 10px',
                            cursor: 'pointer',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '0.05em',
                        }}
                    >
                        EXPORT SQF
                    </button>
                )}

                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {state.peers.map(peer => (
                        <div
                            key={peer.name}
                            title={peer.name}
                            style={{
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                background: peer.avatar ? `url(${peer.avatar}) center/cover` : peer.color,
                                border: `2px solid ${peer.color}`,
                                overflow: 'hidden',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                color: '#fff',
                                fontWeight: 600,
                            }}
                        >
                            {!peer.avatar && peer.name[0]?.toUpperCase()}
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    <div style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: state.connected ? '#2ecc71' : '#e74c3c',
                    }} />
                    {state.connected ? 'Live' : 'Connecting…'}
                </div>
            </div>

            {/* Map + Layers panel */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    {selectedAnnotationId && (() => {
                        const ann = state.annotations.find(a => a.id === selectedAnnotationId)
                        return ann ? (
                            <AnnotationEditor
                                annotation={ann}
                                actions={actions}
                                onClose={() => setSelectedAnnotationId(null)}
                            />
                        ) : null
                    })()}
                    {!world && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'rgba(255,255,255,0.3)',
                            fontSize: 14,
                            zIndex: 10,
                            pointerEvents: 'none',
                        }}>
                            No map configured for this operation
                        </div>
                    )}
                    <OperationMap
                        world={world}
                        mapMode={mapMode}
                        layers={viewLayers}
                        annotations={state.annotations}
                        peers={state.peers}
                        activeTool={canEdit ? activeTool : null}
                        activeLayerId={activeLayerId}
                        activeColor={activeColor}
                        activeA3Props={activeA3Props}
                        canEdit={canEdit}
                        selectedAnnotationId={selectedAnnotationId}
                        onAnnotationAdd={handleAnnotationAdd}
                        onAnnotationUpdate={handleAnnotationUpdate}
                        onAnnotationRemove={handleAnnotationRemove}
                        onAnnotationSelect={setSelectedAnnotationId}
                        onCursorMove={handleCursorMove}
                        onToolDone={handleToolDone}
                    />
                </div>

                <LayersPanel
                    layers={state.layers}
                    choices={choices}
                    onToggleVisible={toggleLayer}
                    activeLayerId={activeLayerId}
                    activeTool={activeTool}
                    activeColor={activeColor}
                    activeA3Props={activeA3Props}
                    canEdit={canEdit}
                    actions={actions}
                    onLayerSelect={setActiveLayerId}
                    onToolChange={setActiveTool}
                    onColorChange={setActiveColor}
                    onA3PropsChange={handleA3PropsChange}
                />
            </div>

            {sqfModal && (
                <SqfExportModal
                    code={buildSqf(state.annotations, viewLayers)}
                    onClose={() => setSqfModal(false)}
                />
            )}
        </div>
    )
}
