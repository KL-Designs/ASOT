import React from 'react'

export default function CornerBrackets({ color = 'rgba(219,0,29,0.45)', size = 7 }: { color?: string; size?: number }) {
    const base: React.CSSProperties = { position: 'absolute', width: size, height: size }
    return (
        <>
            <span style={{ ...base, top: 0, left: 0,     borderTop:    `1.5px solid ${color}`, borderLeft:  `1.5px solid ${color}` }} />
            <span style={{ ...base, top: 0, right: 0,    borderTop:    `1.5px solid ${color}`, borderRight: `1.5px solid ${color}` }} />
            <span style={{ ...base, bottom: 0, left: 0,  borderBottom: `1.5px solid ${color}`, borderLeft:  `1.5px solid ${color}` }} />
            <span style={{ ...base, bottom: 0, right: 0, borderBottom: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}` }} />
        </>
    )
}
