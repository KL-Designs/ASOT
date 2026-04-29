'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { MapWorld, MapMode } from '@/components/operations/map/types'
import FullscreenPage from '@/components/FullscreenPage'

const OperationMap = dynamic(() => import('@/components/operations/map/OperationMap'), { ssr: false })

export default function InteractiveMapPage() {
    const [worlds, setWorlds] = useState<MapWorld[]>([])
    const [selected, setSelected] = useState<MapWorld | null>(null)
    const [mapMode, setMapMode] = useState<MapMode>('map')
    const [hovered, setHovered] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/maps/worlds')
            .then(r => r.json())
            .then(data => Array.isArray(data) && setWorlds(data))
    }, [])

    if (selected) {
        const modes: MapMode[] = [
            'sat',
            ...(selected.hasGeoJSON ? ['map' as MapMode] : []),
            ...(selected.hasTerrain ? ['terrain' as MapMode] : []),
        ]

        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0d' }}>
                <FullscreenPage />

                {/* Toolbar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '6px 16px',
                    background: 'rgba(10,10,10,0.95)',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    flexShrink: 0,
                    zIndex: 10,
                }}>
                    <button
                        onClick={() => setSelected(null)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.45)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: 0,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Maps
                    </button>

                    <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />

                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.03em' }}>
                        {selected.displayName}
                    </span>

                    <div style={{ flex: 1 }} />

                    {/* Mode toggle */}
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: 2 }}>
                        {modes.map(m => (
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
                </div>

                {/* Map */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <OperationMap
                        world={selected}
                        mapMode={mapMode}
                        layers={[]}
                        annotations={[]}
                        peers={[]}
                        activeTool={null}
                        activeLayerId={null}
                        activeColor="#db001d"
                        canEdit={false}
                        onAnnotationAdd={() => {}}
                        onAnnotationUpdate={() => {}}
                        onAnnotationRemove={() => {}}
                        onCursorMove={() => {}}
                        onToolDone={() => {}}
                    />
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '60vh', padding: '48px 32px' }}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>

                {/* Header */}
                <div style={{ marginBottom: 40 }}>
                    <h1 style={{
                        fontSize: '1.75rem',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.9)',
                        letterSpacing: '0.04em',
                        marginBottom: 6,
                    }}>
                        Interactive Map
                    </h1>
                    <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                        Select a world to explore
                    </p>
                </div>

                {/* World grid */}
                {worlds.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        color: 'rgba(255,255,255,0.2)',
                        fontSize: 14,
                        padding: '64px 0',
                    }}>
                        No maps available
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 16,
                    }}>
                        {worlds.map(world => (
                            <div
                                key={world.name}
                                onClick={() => { setSelected(world); setMapMode(world.hasGeoJSON ? 'map' : 'sat') }}
                                onMouseEnter={() => setHovered(world.name)}
                                onMouseLeave={() => setHovered(null)}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    border: hovered === world.name
                                        ? '1px solid rgba(219,0,29,0.55)'
                                        : '1px solid rgba(255,255,255,0.07)',
                                    background: 'rgba(255,255,255,0.025)',
                                    transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
                                    boxShadow: hovered === world.name
                                        ? '0 4px 20px rgba(219,0,29,0.15)'
                                        : '0 2px 8px rgba(0,0,0,0.3)',
                                    transform: hovered === world.name ? 'translateY(-3px)' : 'none',
                                }}
                            >
                                {/* Preview image */}
                                {world.hasPreview ? (
                                    <img
                                        src={`/maps/${world.name}/preview.png`}
                                        alt={world.displayName}
                                        style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '100%',
                                        aspectRatio: '16/9',
                                        background: 'rgba(255,255,255,0.04)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'rgba(255,255,255,0.15)',
                                        fontSize: 12,
                                        letterSpacing: '0.06em',
                                    }}>
                                        NO PREVIEW
                                    </div>
                                )}

                                {/* Name + size */}
                                <div style={{ padding: '10px 14px 12px' }}>
                                    <div style={{
                                        fontWeight: 600,
                                        fontSize: '0.88rem',
                                        color: hovered === world.name ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.8)',
                                        letterSpacing: '0.04em',
                                        transition: 'color 0.2s',
                                    }}>
                                        {world.displayName}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                                        {(world.worldSize / 1000).toFixed(1)} km × {(world.worldSize / 1000).toFixed(1)} km
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
