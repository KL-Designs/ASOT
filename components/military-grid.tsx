'use client'

export default function MilitaryGrid() {
    return (
        <div aria-hidden className='absolute inset-0 pointer-events-none select-none' style={{ zIndex: 0 }}>
            {/* Primary grid – 96 px cells */}
            <div className='absolute inset-0' style={{
                backgroundImage: [
                    'repeating-linear-gradient(rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, transparent 1px, transparent 96px)',
                    'repeating-linear-gradient(90deg, rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, transparent 1px, transparent 96px)',
                ].join(','),
            }} />
            {/* Sub-grid – 24 px cells */}
            <div className='absolute inset-0' style={{
                backgroundImage: [
                    'repeating-linear-gradient(rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 24px)',
                    'repeating-linear-gradient(90deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 24px)',
                ].join(','),
            }} />
        </div>
    )
}
