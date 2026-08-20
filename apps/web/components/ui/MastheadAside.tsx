import React from 'react'
import Link from 'next/link'

import s from '@/styles/shell.module.css'

export type AsideRow = {
    label: string
    value: string
    /** Amber rather than white — for the row that is the answer, not context. */
    accent?: boolean
}

/**
 * The masthead's second column.
 *
 * Deliberately presentational: it takes resolved strings, never a query. The
 * pages that use it (/about, /join) are already server components and fetch
 * their own figures, so Container can stay synchronous for the eight
 * consumers that have no aside at all.
 */
export default function MastheadAside({
    heading,
    status,
    rows,
    cta,
}: {
    heading: string
    status?: string
    rows: AsideRow[]
    cta?: { href: string, label: string }
}) {
    return (
        <aside className={s.aside}>
            <div className={s.asideH}>
                <i />
                {heading}
                {status && <span className={s.rt}>{status}</span>}
            </div>
            <div className={s.asideRows}>
                {rows.map(row => (
                    <div key={row.label} className={s.asideRow}>
                        <span>{row.label}</span>
                        <b className={row.accent ? s.acc : undefined}>{row.value}</b>
                    </div>
                ))}
            </div>
            {cta && (
                <Link href={cta.href as any} className={s.asideCta}>{cta.label}</Link>
            )}
        </aside>
    )
}
