'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { MapWorld } from '@/components/operations/map/types'

export default function InteractiveMapPage() {
    const router = useRouter()
    const [worlds, setWorlds] = useState<MapWorld[]>([])
    const [hovered, setHovered] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/maps/worlds')
            .then(r => r.json())
            .then(data => Array.isArray(data) && setWorlds(data))
    }, [])

    return (
        <div style={{ minHeight: '60vh', padding: '48px 32px' }}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>

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
                                onClick={() => router.push(`/map/${world.name}`)}
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
