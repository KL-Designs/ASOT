'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { MapWorld } from '@/components/operations/map/types'

export default function InteractiveMapPage() {
    const router = useRouter()
    const [worlds, setWorlds] = useState<MapWorld[]>([])
    const [hovered, setHovered] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/maps/worlds')
            .then(r => r.json())
            .then(data => Array.isArray(data) && setWorlds(data))
        // Warm up the Leaflet + OperationMap bundle while the user browses the
        // world selector, so it's already parsed by the time they click through.
        import('@/components/operations/map/OperationMap').catch(() => {})
    }, [])

    return (
        <div style={{ minHeight: '60vh', padding: '48px 32px' }}>
            {/* Two columns: the worlds, and beside them how to use what you
                open. A wrapping flex row rather than a grid, so the guide
                drops underneath on a narrow screen without a media query. */}
            <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start' }}>
            <div style={{ flex: '999 1 520px', minWidth: 0 }}>

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
                                onClick={() => router.push(`/maps/${world.name}`)}
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
                                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                                        <Image
                                            src={`/map-assets/${world.name}/preview.jpg`}
                                            quality={25}
                                            alt={world.displayName}
                                            fill
                                            sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                                            style={{ objectFit: 'cover' }}
                                        />
                                    </div>
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

            <HowToUse />
            </div>
        </div>
    )
}

/**
 * What the interactive map is for and how to drive it.
 *
 * Beside the list rather than inside each map: the map itself is full-screen
 * with no room for prose, and the moment somebody wonders what this page is,
 * they are still looking at this one.
 */
function HowToUse() {
    const steps: [string, string][] = [
        ['Pick a world', 'Choose any terrain from the list to open it full screen.'],
        ['Move around', 'Drag to pan. Scroll, pinch, or use the + and − buttons to zoom.'],
        ['Read a grid', 'Grid lines get finer as you zoom in, with their numbers along every edge. Your cursor shows the 10-figure grid reference of the spot under it.'],
        ['Switch the view', 'SAT is satellite imagery. MAP is the in-game topographic map with roads, buildings and contours. TERRAIN shades the ground by height. A world only offers the views it has data for.'],
        ['Measure', 'The scale bar in the bottom right shows distance at the current zoom.'],
    ]

    return (
        <aside style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: '2px solid rgba(219,0,29,0.6)',
            background: 'rgba(255,255,255,0.025)',
            padding: '20px 22px',
            minWidth: 0,
            flex: '1 1 280px',
            maxWidth: 420,
        }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
                How to use
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.82rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' }}>
                Every terrain the unit plays on, to plan a route, check a grid reference or get to know
                the ground before an operation.
            </p>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
                {steps.map(([title, body], i) => (
                    <li key={title} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 10 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(219,0,29,0.8)', paddingTop: 2 }}>
                            {String(i + 1).padStart(2, '0')}
                        </span>
                        <span>
                            <b style={{ display: 'block', fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', letterSpacing: '0.03em', marginBottom: 2 }}>{title}</b>
                            <span style={{ fontSize: '0.78rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' }}>{body}</span>
                        </span>
                    </li>
                ))}
            </ol>
            <p style={{ margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.74rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.35)' }}>
                Looking for the plan for a particular mission? That lives on the Map tab of the
                operation itself, under Operations.
            </p>
        </aside>
    )
}
