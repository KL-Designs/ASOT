'use client'

import { useEffect, useRef, useState } from 'react'

interface NavSection {
    id: string
    title: string
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

export default function SectionNav({ sections, themeColor, pageTheme = 'modern' }: { sections: NavSection[], themeColor: string, pageTheme?: 'modern' | 'oldfashioned' | 'scifi' }) {
    const [activeId, setActiveId] = useState<string | null>(null)
    const navRef = useRef<HTMLDivElement>(null)

    const { r, g, b } = hexToRgb(themeColor)

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

    const isOF = pageTheme === 'oldfashioned'
    const isSF = pageTheme === 'scifi'

    const outerStyle: React.CSSProperties = isOF ? {
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(230,215,185,0.97)',
        backdropFilter: 'blur(8px)',
        borderBottom: '2px solid rgba(90,55,20,0.3)',
        boxShadow: '0 2px 8px rgba(90,55,20,0.15)',
    } : isSF ? {
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: `1px solid rgba(${r},${g},${b},0.3)`,
        boxShadow: `0 2px 16px rgba(0,0,0,0.8), 0 0 8px rgba(${r},${g},${b},0.15)`,
    } : {
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
    }

    return (
        <div style={outerStyle}>
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

                    const btnStyle: React.CSSProperties = isOF ? {
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
                    } : isSF ? {
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: isActive ? `2px solid ${themeColor}` : '2px solid transparent',
                        boxShadow: isActive ? `0 2px 8px ${themeColor}` : 'none',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s, color 0.2s, box-shadow 0.2s',
                    } : {
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
                    }

                    const spanStyle: React.CSSProperties = isOF ? {
                        fontSize: '0.55rem',
                        fontWeight: 800,
                        fontFamily: 'Georgia, serif',
                        letterSpacing: '0.04em',
                        textTransform: 'none',
                        color: isActive ? '#4a2e12' : 'rgba(90,55,20,0.45)',
                        whiteSpace: 'nowrap',
                        transition: 'color 0.2s',
                    } : isSF ? {
                        fontSize: '0.55rem',
                        fontWeight: 800,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        color: isActive ? themeColor : 'rgba(237,237,237,0.28)',
                        textShadow: isActive ? `0 0 8px rgba(${r},${g},${b},0.7)` : 'none',
                        whiteSpace: 'nowrap',
                        transition: 'color 0.2s',
                    } : {
                        fontSize: '0.55rem',
                        fontWeight: 800,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        color: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.28)',
                        whiteSpace: 'nowrap',
                        transition: 'color 0.2s',
                    }

                    return (
                        <button
                            key={s.id}
                            data-id={s.id}
                            onClick={() => scrollTo(s.id)}
                            style={btnStyle}
                        >
                            <span style={spanStyle}>
                                {String(i + 1).padStart(2, '0')} {s.title}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
