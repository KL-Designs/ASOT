'use client'

import { useEffect, useRef, useState } from 'react'

interface NavSection {
    id: string
    title: string
}

export default function SectionNav({ sections, themeColor }: { sections: NavSection[], themeColor: string }) {
    const [activeId, setActiveId] = useState<string | null>(null)
    const navRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const observers: IntersectionObserver[] = []

        sections.forEach(s => {
            const el = document.getElementById(`section-${s.id}`)
            if (!el) return

            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) setActiveId(s.id)
                },
                { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
            )
            observer.observe(el)
            observers.push(observer)
        })

        return () => observers.forEach(o => o.disconnect())
    }, [sections])

    // Scroll the active nav item into view
    useEffect(() => {
        if (!activeId || !navRef.current) return
        const btn = navRef.current.querySelector(`[data-id="${activeId}"]`) as HTMLElement
        if (btn) btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    }, [activeId])

    function scrollTo(id: string) {
        document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    if (sections.length < 2) return null

    return (
        <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            background: 'rgba(10,10,10,0.92)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
        }}>
            <div
                ref={navRef}
                className='w-full max-w-[900px] mx-auto px-4 md:px-8'
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                }}
            >
                {sections.map((s, i) => {
                    const isActive = activeId === s.id
                    return (
                        <button
                            key={s.id}
                            data-id={s.id}
                            onClick={() => scrollTo(s.id)}
                            style={{
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 16px',
                                background: 'none',
                                border: 'none',
                                borderBottom: isActive ? `2px solid ${themeColor}` : '2px solid transparent',
                                cursor: 'pointer',
                                transition: 'border-color 0.2s, color 0.2s',
                            }}
                        >
                            <span style={{
                                fontSize: '0.55rem',
                                fontWeight: 800,
                                letterSpacing: '0.22em',
                                textTransform: 'uppercase',
                                color: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.28)',
                                whiteSpace: 'nowrap',
                                transition: 'color 0.2s',
                            }}>
                                {String(i + 1).padStart(2, '0')} {s.title}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
