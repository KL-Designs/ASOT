import React from 'react'
import Link from 'next/link'
import s from '@/styles/ui.module.css'

/**
 * The standard section opener: a mono kicker, a display heading, and an
 * optional "more" link pinned to the opposite end.
 *
 * Every section on a page using this gets the same vertical rhythm, which is
 * most of what makes a long page read as one document rather than a stack of
 * unrelated blocks.
 */
export default function SectionHead({ kicker, title, more, children }: {
    kicker: string
    title: string
    more?: { href: string, label: string }
    children?: React.ReactNode
}) {
    return (
        <div className={s.sectionHead}>
            <div>
                <span className={s.kicker}>{kicker}</span>
                <h2 className={s.h2}>{title}</h2>
                {children}
            </div>
            {more && (
                <Link href={more.href as any} className={s.moreLink}>{more.label} →</Link>
            )}
        </div>
    )
}

/**
 * The kicker on its own, for places that don't want the whole header block.
 *
 * `centred` mirrors its leading rule on the right. On centred copy a single
 * rule reads as an alignment mistake rather than a flourish.
 */
export function Kicker({ children, centred = false }: {
    children: React.ReactNode
    centred?: boolean
}) {
    return <span className={`${s.kicker} ${centred ? s.kickerCentred : ''}`}>{children}</span>
}

/** Body copy under a heading. */
export function Lede({ children }: { children: React.ReactNode }) {
    return <p className={s.lede}>{children}</p>
}
