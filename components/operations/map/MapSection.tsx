'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useMapYjs } from './useMapYjs'
import LayersPanel from './LayersPanel'
import type { DrawingTool, MapMode, MapWorld } from './types'

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

    // Auto-select first layer when layers load
    useEffect(() => {
        if (!activeLayerId && state.layers.length > 0) {
            setActiveLayerId(state.layers[0].id)
        }
    }, [state.layers, activeLayerId])

    const handleAnnotationAdd = useCallback((type: DrawingTool, geometry: number[][], properties: any) => {
        if (!activeLayerId || !type) return
        actions.addAnnotation(activeLayerId, type, geometry, properties)
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
                {/* World label */}
                <span style={{ fontSize: 12, color: world ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    {world?.displayName ?? 'No map configured'}
                </span>

                {/* MAP / SAT / TERRAIN toggle */}
                {world?.hasGeoJSON && (
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: 2 }}>
                        {(['map', 'sat', ...(currentWorld.hasTerrain ? ['terrain'] : [])] as MapMode[]).map(m => (
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

                {/* Presence indicators */}
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

                {/* Connection status */}
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
                        layers={state.layers}
                        annotations={state.annotations}
                        peers={state.peers}
                        activeTool={canEdit ? activeTool : null}
                        activeLayerId={activeLayerId}
                        activeColor={activeColor}
                        canEdit={canEdit}
                        onAnnotationAdd={handleAnnotationAdd}
                        onAnnotationUpdate={handleAnnotationUpdate}
                        onAnnotationRemove={handleAnnotationRemove}
                        onCursorMove={handleCursorMove}
                        onToolDone={handleToolDone}
                    />
                </div>

                <LayersPanel
                    layers={state.layers}
                    activeLayerId={activeLayerId}
                    activeTool={activeTool}
                    activeColor={activeColor}
                    canEdit={canEdit}
                    actions={actions}
                    onLayerSelect={setActiveLayerId}
                    onToolChange={setActiveTool}
                    onColorChange={setActiveColor}
                />
            </div>
        </div>
    )
}
