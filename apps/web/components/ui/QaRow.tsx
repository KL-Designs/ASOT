import React from 'react'
import s from '@/styles/shell.module.css'

/**
 * One FAQ entry.
 *
 * Not an accordion. These answers are indexed by search engines and found with
 * Ctrl-F, and hiding them behind a click costs both for no gain the wide card
 * does not already provide.
 */
export default function QaRow({
    index, question, children,
}: {
    index: string
    question: string
    children: React.ReactNode
}) {
    return (
        <div className={s.qa}>
            <span className={s.qaN}>{index}</span>
            <div>
                <h4>{question}</h4>
                {children}
            </div>
        </div>
    )
}

export function QaStack({ columns = 1, children }: { columns?: 1 | 2, children: React.ReactNode }) {
    return (
        <div className={columns === 2 ? `${s.qaStack} ${s.qaStack2}` : s.qaStack}>
            {children}
        </div>
    )
}
