'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import s from './modern.module.css'

export interface SpineDocument {
    id: string
    title: string
    /** Which group it belongs to — orders documents, or the staff surfaces. */
    group: 'orders' | 'aside'
}

export interface SpineSection {
    id: string
    title: string
}

interface Props {
    operationId: string
    documents: SpineDocument[]
    activeDocument: string
    /** Sections of the *active* document only — the others aren't rendered. */
    sections: SpineSection[]
    fromJ2: boolean
}

/**
 * The orders outline: documents, with the open one's sections nested beneath.
 *
 * This replaces two separate navigations — a document rail down the left and a
 * section strip across the top — that between them made you look in two places
 * to answer one question. Nesting is not decoration here: "Situation" really is
 * part of CHQ Orders rather than a sibling of it, and the old flat pair said
 * otherwise.
 *
 * Documents are links carrying `?page=`, so every document has a URL somebody
 * can paste. Sections are buttons: they scroll, and a hash in the address bar
 * that survives a reload would fight the scroll-spy for which one is current.
 */
export default function OrdersSpine({ operationId, documents, activeDocument, sections, fromJ2 }: Props) {
    const [activeSection, setActiveSection] = useState<string | null>(null)

    // Same observer shape the old section strip used: a band across the upper
    // third of the viewport, so "current" means what you are reading rather
    // than whatever last touched the bottom edge.
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

    const renderDoc = (doc: SpineDocument) => {
        const on = doc.id === activeDocument
        return (
            <div key={doc.id}>
                <Link
                    href={docHref(doc.id)}
                    className={on ? `${s.doc} ${s.docOn}` : s.doc}
                    aria-current={on ? 'page' : undefined}
                >
                    {doc.title}
                </Link>

                {on && sections.length > 1 && (
                    <ul className={s.secs}>
                        {sections.map((sec, i) => (
                            <li key={sec.id}>
                                <button
                                    type='button'
                                    className={sec.id === activeSection ? `${s.sec} ${s.secOn}` : s.sec}
                                    onClick={() => scrollTo(sec.id)}
                                >
                                    <span className={s.secNum}>{String(i + 1).padStart(2, '0')}</span>
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
        <nav className={s.spine} aria-label='Orders contents'>
            <div className={s.spineGroup}>
                <span className={s.spineKey}>Orders</span>
                {orders.map(renderDoc)}
            </div>

            {aside.length > 0 && (
                <div className={s.spineGroup}>
                    <span className={s.spineKey}>Also here</span>
                    {aside.map(renderDoc)}
                </div>
            )}
        </nav>
    )
}
