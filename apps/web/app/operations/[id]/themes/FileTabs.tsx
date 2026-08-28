'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import type { SpineDocument, SpineSection } from './OrdersSpine'
import s from './coldwar.module.css'

interface Props {
    operationId: string
    documents: SpineDocument[]
    activeDocument: string
    /** Sections of the *active* document only. */
    sections: SpineSection[]
    fromJ2: boolean
}

/**
 * The folder's tabs, down the left edge of the desk.
 *
 * A sheet of paper has no sidebar, which is the one real problem with the
 * Declassified theme — so the navigation becomes the thing a paper file
 * actually has. The open tab is cut from the same stock as the sheet and
 * reaches across the seam into it; the rest are the darker manila behind.
 *
 * Same model as `OrdersSpine`: documents are `?page=` links so each has a URL
 * somebody can paste, and sections are buttons that scroll, since a hash left
 * in the address bar would fight the scroll-spy over which one is current.
 */
export default function FileTabs({ operationId, documents, activeDocument, sections, fromJ2 }: Props) {
    const [activeSection, setActiveSection] = useState<string | null>(null)

    useEffect(() => {
        if (!sections.length) return

        const observers = sections.map(sec => {
            const el = document.getElementById(`section-${sec.id}`)
            if (!el) return null
            const observer = new IntersectionObserver(
                ([entry]) => { if (entry.isIntersecting) setActiveSection(sec.id) },
                { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
            )
            observer.observe(el)
            return observer
        })

        return () => observers.forEach(o => o?.disconnect())
    }, [sections])

    const docHref = (pageId: string): Route => {
        const params = new URLSearchParams()
        if (pageId !== 'main') params.set('page', pageId)
        if (fromJ2) params.set('from', 'j2')
        const query = params.toString()
        return (query ? `/operations/${operationId}?${query}` : `/operations/${operationId}`) as Route
    }

    const scrollTo = (sectionId: string) => {
        const el = document.getElementById(`section-${sectionId}`)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActiveSection(sectionId)
    }

    const orders = documents.filter(d => d.group === 'orders')
    const aside = documents.filter(d => d.group === 'aside')

    const renderTab = (doc: SpineDocument) => {
        const on = doc.id === activeDocument
        return (
            <div key={doc.id}>
                <Link
                    href={docHref(doc.id)}
                    className={on ? `${s.tab} ${s.tabOn}` : s.tab}
                    aria-current={on ? 'page' : undefined}
                >
                    {doc.title}
                </Link>

                {on && sections.length > 1 && (
                    <ul className={s.tabSecs}>
                        {sections.map((sec, i) => (
                            <li key={sec.id}>
                                <button
                                    type='button'
                                    className={sec.id === activeSection ? `${s.tabSec} ${s.tabSecOn}` : s.tabSec}
                                    onClick={() => scrollTo(sec.id)}
                                >
                                    <span className={s.tabSecN}>{i + 1}.</span>
                                    <span>{sec.title}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        )
    }

    return (
        <nav className={s.tabs} aria-label='Orders contents'>
            <div className={s.tabGroup}>
                <span className={s.tabGroupKey}>File</span>
                {orders.map(renderTab)}
            </div>

            {aside.length > 0 && (
                <div className={s.tabGroup}>
                    <span className={s.tabGroupKey}>Enclosures</span>
                    {aside.map(renderTab)}
                </div>
            )}
        </nav>
    )
}
