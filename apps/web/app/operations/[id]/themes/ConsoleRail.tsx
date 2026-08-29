'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import type { SpineDocument, SpineSection } from './OrdersSpine'
import s from './scifi.module.css'

interface Props {
    operationId: string
    documents: SpineDocument[]
    activeDocument: string
    /** Sections of the *active* document only — the others aren't rendered. */
    sections: SpineSection[]
    fromJ2: boolean
}

/**
 * The console's index: documents, with the open one's sections nested beneath.
 *
 * Same model as `OrdersSpine` and `FileTabs`, and deliberately — three themes
 * drawing one navigation three ways is fine, three themes *disagreeing* about
 * what is in the file is not. Documents are `?page=` links, so each has a URL
 * somebody can paste; sections are buttons that scroll, because a hash left in
 * the address bar would fight the scroll-spy over which one is current.
 *
 * The observer band sits across the upper third of the viewport, which is what
 * makes "current" mean the section you are reading rather than whichever one
 * last touched the bottom edge.
 */
export default function ConsoleRail({ operationId, documents, activeDocument, sections, fromJ2 }: Props) {
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

    const renderDoc = (doc: SpineDocument, i: number) => {
        const on = doc.id === activeDocument
        return (
            <div key={doc.id}>
                <Link
                    href={docHref(doc.id)}
                    className={on ? `${s.doc} ${s.docOn}` : s.doc}
                    aria-current={on ? 'page' : undefined}
                >
                    <span className={s.docNum}>{String(i + 1).padStart(2, '0')}</span>
                    {doc.title}
                </Link>

                {on && sections.length > 1 && (
                    <ul className={s.secs}>
                        {sections.map((sec, n) => (
                            <li key={sec.id}>
                                <button
                                    type='button'
                                    className={sec.id === activeSection ? `${s.sec} ${s.secOn}` : s.sec}
                                    onClick={() => scrollTo(sec.id)}
                                >
                                    <span className={s.secN}>{n + 1}.</span>
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
        <nav className={s.rail} aria-label='Orders contents'>
            <span className={s.railHead}>Operation file</span>
            {orders.map(renderDoc)}

            {aside.length > 0 && (
                <>
                    <span className={`${s.railHead} ${s.railHeadLater}`}>Attached</span>
                    {aside.map((doc, i) => renderDoc(doc, orders.length + i))}
                </>
            )}
        </nav>
    )
}
