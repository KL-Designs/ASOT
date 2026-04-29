'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import type { MapMode, MapWorld } from '@/components/operations/map/types'
import FullscreenPage from '@/components/FullscreenPage'

const OperationMap = dynamic(() => import('@/components/operations/map/OperationMap'), { ssr: false })

export default function MapViewer({ world }: { world: MapWorld }) {
    const router = useRouter()
    const [mapMode, setMapMode] = useState<MapMode>(world.hasGeoJSON ? 'map' : 'sat')

    const modes: MapMode[] = [
        'sat',
        ...(world.hasGeoJSON ? ['map' as MapMode] : []),
        ...(world.hasTerrain ? ['terrain' as MapMode] : []),
    ]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0d' }}>
            <FullscreenPage />

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
                    onClick={() => router.push('/map')}
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
                    {world.displayName}
                </span>

                <div style={{ flex: 1 }} />

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

            <div style={{ flex: 1, overflow: 'hidden' }}>
                <OperationMap
                    world={world}
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
