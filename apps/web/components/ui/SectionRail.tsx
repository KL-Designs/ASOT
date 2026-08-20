'use client'

import React, { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { activeRailIndex, railIndex, type RailItem } from '@/lib/shell/rail'
import s from '@/styles/shell.module.css'

/**
 * The sticky section rail.
 *
 * A client component only because it reads the pathname. Keeping that here
 * rather than in the layout is what lets `about/layout.tsx` go back to being a
 * server component — it carried 'use client' solely to pick the active tab.
 */
export default function SectionRail({ items }: { items: RailItem[] }) {
    const pathname = usePathname()
    const active = activeRailIndex(items, pathname)
    const activeRef = useRef<HTMLAnchorElement>(null)

    // Below ~900px the rail overflows to a horizontal scroll, and the active
    // cell is routinely off-screen on arrival — which reads as the rail having
    // no active cell at all.
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
    }, [active])

    return (
        <nav className={s.rail} aria-label='Section'>
            {items.map((item, i) => {
                const on = i === active
                return (
                    <Link
                        key={item.href}
                        href={item.href as any}
                        ref={on ? activeRef : undefined}
                        aria-current={on ? 'page' : undefined}
                        className={on ? `${s.railItem} ${s.railOn}` : s.railItem}
                    >
                        <span className={s.railN}>{railIndex(i)}</span>
                        <span className={s.railT}>{item.label}</span>
                    </Link>
                )
            })}
        </nav>
    )
}
