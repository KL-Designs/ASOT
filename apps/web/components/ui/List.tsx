import React from 'react'
import s from '@/styles/shell.module.css'

/**
 * A real list, with a hanging indent and a rule as its marker.
 *
 * The pages this replaces rendered their bullets as sibling <Typography>
 * elements each opening with a hyphen, so a wrapped line ran back underneath
 * its own dash and a screen reader was read thirteen paragraphs rather than a
 * list of thirteen items.
 */
export default function List({
    items, columns = 1,
}: {
    items: React.ReactNode[]
    columns?: 1 | 2 | 3
}) {
    const cls = columns === 3 ? `${s.list} ${s.list3}`
        : columns === 2 ? `${s.list} ${s.list2}`
            : s.list

    return (
        <ul className={cls}>
            {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
    )
}
