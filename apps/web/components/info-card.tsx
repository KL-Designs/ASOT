import React from 'react'

export default function InfoCard({ title, children, icon, accentColor = 'var(--red)', accentRgb = '219,0,29' }: {
    title: string
    children: React.ReactNode
    icon?: React.ReactNode
    accentColor?: string
    accentRgb?: string
}) {
    return (
        <div
            className='flex flex-col gap-4 p-5 h-full'
            style={{
                border: '1px solid rgba(255,255,255,0.07)',
                borderTop: `2px solid ${accentColor}`,
                background: 'rgba(255,255,255,0.02)',
            }}
        >
            <div className='flex items-center gap-3'>
                {icon && (
                    <div style={{ padding: 8, background: `rgba(${accentRgb}, 0.12)`, color: accentColor, display: 'flex', flexShrink: 0 }}>
                        {icon}
                    </div>
                )}
                <span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.85rem' }}>
                    {title.toUpperCase()}
                </span>
            </div>
            <div>
                {children}
            </div>
        </div>
    )
}
