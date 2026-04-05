'use client'

import React from 'react'

interface Props {
    rows?: number
    className?: string
}

export default function TacticalSkeleton({ rows = 5, className }: Props) {
    const widths = [100, 82, 95, 68, 88, 74, 91, 78]
    return (
        <div className={className} style={{ padding: '20px 4px' }}>
            <style>{`
                @keyframes ts-shimmer {
                    0%   { background-position: -600px 0 }
                    100% { background-position: 600px 0 }
                }
                .ts-row {
                    background: linear-gradient(
                        90deg,
                        rgba(255,255,255,0.03) 25%,
                        rgba(219,0,29,0.07) 50%,
                        rgba(255,255,255,0.03) 75%
                    );
                    background-size: 600px 100%;
                    animation: ts-shimmer 1.8s ease-in-out infinite;
                    border-radius: 2px;
                }
            `}</style>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                            className='ts-row'
                            style={{
                                width: 4,
                                height: 4,
                                borderRadius: '50%',
                                flexShrink: 0,
                                animationDelay: `${i * 0.06}s`,
                            }}
                        />
                        <div
                            className='ts-row'
                            style={{
                                height: 9,
                                width: `${widths[i % widths.length]}%`,
                                animationDelay: `${i * 0.06}s`,
                            }}
                        />
                    </div>
                ))}
            </div>
            <div style={{
                marginTop: 18,
                height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(219,0,29,0.08), transparent)',
            }} />
        </div>
    )
}
