'use client'

import { useState } from 'react'
import { useFavourites } from '@/hooks/useFavourites'

interface PinTabLabelProps {
    /** Text shown on the tab */
    label: string
    /** Label stored in favourites list, e.g. "J3 — Calendar" */
    pinLabel: string
    /** Page href, e.g. "/dashboard/j3" */
    href: string
    /** Tab index within the panel */
    tabIndex: number
}

export default function PinTabLabel({ label, pinLabel, href, tabIndex }: PinTabLabelProps) {
    const id = `${href}#tab${tabIndex}`
    const { isPinned, pin, unpin } = useFavourites()
    const [hovered, setHovered] = useState(false)
    const pinned = isPinned(id)

    return (
        <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {label}
            <span
                onClick={e => {
                    e.stopPropagation()
                    pinned ? unpin(id) : pin({ id, label: pinLabel, href, tabIndex })
                }}
                title={pinned ? 'Remove from favourites' : 'Add to favourites'}
                style={{
                    fontSize: '0.65rem',
                    lineHeight: 1,
                    color: pinned ? 'var(--red)' : 'rgba(237,237,237,0.4)',
                    cursor: 'pointer',
                    opacity: pinned ? 1 : hovered ? 0.7 : 0.18,
                    transition: 'opacity 0.15s, color 0.15s',
                    userSelect: 'none',
                }}
            >
                {pinned ? '★' : '☆'}
            </span>
        </span>
    )
}
