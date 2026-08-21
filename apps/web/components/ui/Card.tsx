import React from 'react'
import s from '@/styles/shell.module.css'

const SPAN = { 1: s.s1, 2: s.s2, 3: s.s3, 4: s.s4, 6: s.s6 } as const

/**
 * The content card.
 *
 * `span` is the mechanism that fixes the ragged grid the old InfoCard
 * produced: a card with more to say spans wider and flows its list into more
 * columns, so its height drops to meet its neighbours rather than towering
 * over them and leaving a hole beside itself.
 */
export default function Card({
    title, kicker, ghost, icon, span = 1, children,
}: {
    title: string
    kicker?: string
    /** The outlined numeral. Pass one only where the number is real. */
    ghost?: string
    icon?: React.ReactNode
    span?: 1 | 2 | 3 | 4 | 6
    children?: React.ReactNode
}) {
    return (
        <article className={`${s.card} ${SPAN[span]}`}>
            {ghost && <span className={s.ghost} aria-hidden='true'>{ghost}</span>}
            {kicker && <div className={s.cardK}>{kicker}</div>}
            {icon && <span className={s.cardIc}>{icon}</span>}
            <h3>{title}</h3>
            {children}
        </article>
    )
}

export function CardGrid({ columns, children }: { columns: 4 | 6, children: React.ReactNode }) {
    return <div className={columns === 6 ? s.grid6 : s.grid4}>{children}</div>
}
