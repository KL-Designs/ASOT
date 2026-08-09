'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { type RecruitmentInfoContent, type RecruitRole } from '@/lib/recruitment-defaults'

const RED    = '#db001d'
const DARK   = '#080808'
const TEXT   = 'rgba(237,237,237,0.85)'
const MUTED  = 'rgba(237,237,237,0.42)'
const DIM    = 'rgba(237,237,237,0.22)'
const BORDER = 'rgba(255,255,255,0.08)'

const COUNTDOWN_SECONDS = 10

const COL_HEADER: React.CSSProperties = {
    padding: '10px 16px',
    fontSize: '0.52rem',
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    fontFamily: "'Oswald', Arial, sans-serif",
    color: TEXT,
    background: 'rgba(219,0,29,0.12)',
    borderBottom: '1px solid rgba(219,0,29,0.25)',
    whiteSpace: 'nowrap',
}

// ─── Roles Modal ──────────────────────────────────────────────────────────────
function RolesModal({ onClose, roles }: { onClose: () => void; roles: RecruitRole[] }) {
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#0d0d0d', border: `1px solid ${RED}30`, borderTop: `3px solid ${RED}`, width: '100%', maxWidth: 960, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: '0.46rem', fontWeight: 700, letterSpacing: '0.28em', color: `${RED}90`, fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 3 }}>ASOT — Call Signs</div>
                        <h2 style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEXT, margin: 0 }}>
                            Available Roles &amp; Specialist Training
                        </h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '1.2rem', lineHeight: 1, padding: 4 }}>✕</button>
                </div>

                {/* Table */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '22%' }} />
                            <col style={{ width: '39%' }} />
                            <col style={{ width: '39%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={{ ...COL_HEADER, borderRight: `1px solid rgba(255,255,255,0.06)` }}>Role</th>
                                <th style={{ ...COL_HEADER, borderRight: `1px solid rgba(255,255,255,0.06)` }}>Qualification Trainings</th>
                                <th style={COL_HEADER}>Specialist Role Trainings</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((row, i) => (
                                <tr
                                    key={row.role}
                                    style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
                                >
                                    {/* Role name */}
                                    <td style={{ padding: '14px 16px', borderBottom: `1px solid rgba(255,255,255,0.05)`, borderRight: `1px solid rgba(255,255,255,0.05)`, verticalAlign: 'top' }}>
                                        <span style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', color: TEXT }}>
                                            {row.role}
                                        </span>
                                    </td>
                                    {/* Qualification Trainings */}
                                    <td style={{ padding: '14px 16px', borderBottom: `1px solid rgba(255,255,255,0.05)`, borderRight: `1px solid rgba(255,255,255,0.05)`, verticalAlign: 'top' }}>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {row.qual.map(item => (
                                                <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                                                    <span style={{ color: RED, fontSize: '0.42rem', flexShrink: 0, marginTop: '0.35em' }}>◆</span>
                                                    <span style={{ color: MUTED, fontSize: '0.78rem', lineHeight: 1.55, fontFamily: 'Arial, sans-serif' }}>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                    {/* Specialist Trainings */}
                                    <td style={{ padding: '14px 16px', borderBottom: `1px solid rgba(255,255,255,0.05)`, verticalAlign: 'top' }}>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {row.specialist.map(item => (
                                                <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                                                    <span style={{ color: `${RED}80`, fontSize: '0.42rem', flexShrink: 0, marginTop: '0.35em' }}>▸</span>
                                                    <span style={{ color: `${MUTED}cc`, fontSize: '0.78rem', lineHeight: 1.55, fontFamily: 'Arial, sans-serif' }}>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer note */}
                <div style={{ padding: '10px 24px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', color: DIM, fontFamily: 'Arial, sans-serif' }}>
                        Role and specialist availability is subject to call sign vacancies at the time of your Reinforcement Cycle completion.
                    </p>
                </div>
            </div>
        </div>
    )
}

// ─── Step card ────────────────────────────────────────────────────────────────
function StepCard({ id, sectionRef, num, total, title, children }: {
    id: string
    sectionRef: (el: HTMLElement | null) => void
    num: number
    total: number
    title: string
    children: React.ReactNode
}) {
    return (
        <section
            id={id}
            ref={sectionRef}
            style={{
                position: 'relative',
                border: `1px solid rgba(255,255,255,0.07)`,
                borderLeft: `3px solid ${RED}55`,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(6px)',
                marginBottom: 18,
                overflow: 'hidden',
            }}
        >
            {/* Header band */}
            <div style={{
                padding: '12px 24px',
                background: 'rgba(0,0,0,0.35)',
                borderBottom: `1px solid rgba(255,255,255,0.06)`,
                display: 'flex', alignItems: 'center', gap: 14,
            }}>
                <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: `${RED}15`, border: `1.5px solid ${RED}55`, color: RED,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Oswald', Arial, sans-serif", fontWeight: 700, fontSize: '0.8rem',
                }}>
                    {num}
                </div>
                <div>
                    <div style={{ fontSize: '0.42rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: `${RED}60`, fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 2 }}>
                        Step {num} of {total}
                    </div>
                    <h2 style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: 'clamp(0.95rem, 2.2vw, 1.2rem)', fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: TEXT, margin: 0, lineHeight: 1.15 }}>
                        {title}
                    </h2>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 28px' }}>
                {children}
            </div>
        </section>
    )
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
            <span style={{ color: RED, flexShrink: 0, marginTop: '0.3em', fontSize: '0.5rem' }}>◆</span>
            <span style={{ color: MUTED, fontSize: '0.86rem', lineHeight: 1.7, fontFamily: 'Arial, sans-serif' }}>{children}</span>
        </div>
    )
}

function Note({ title, bullets }: { title: string; bullets: string[] }) {
    return (
        <div style={{ padding: '12px 16px', background: `${RED}08`, border: `1px solid ${RED}20`, borderLeft: `3px solid ${RED}60`, marginTop: 16, fontSize: '0.8rem', color: MUTED, lineHeight: 1.65, fontFamily: 'Arial, sans-serif' }}>
            {title && <strong style={{ color: TEXT, display: 'block', marginBottom: 6 }}>{title}</strong>}
            {bullets.map((b, i) => <Bullet key={i}>{b}</Bullet>)}
        </div>
    )
}

// ─── Generic step body renderer ───────────────────────────────────────────────
function StepBody({ step, onViewRoles }: {
    step: import('@/lib/recruitment-defaults').RecruitStep
    onViewRoles: () => void
}) {
    return (
        <>
            {step.extraParagraphs.length > 0 && step.extraParagraphs.map((p, i) => (
                <p key={i} style={{ color: MUTED, fontSize: '0.86rem', lineHeight: 1.75, fontFamily: 'Arial, sans-serif', marginBottom: 14 }}>
                    {p}
                </p>
            ))}
            {step.intro && (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <p dangerouslySetInnerHTML={{ __html: step.intro as any }} style={{ color: MUTED, fontSize: '0.86rem', lineHeight: 1.75, fontFamily: 'Arial, sans-serif', marginBottom: 14 }} />
            )}
            {step.gridItems.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px 24px', marginBottom: 14 }}>
                    {step.gridItems.map((item, i) => <Bullet key={i}>{item}</Bullet>)}
                </div>
            )}
            {step.bullets.length > 0 && step.bullets.map((b, i) => <Bullet key={i}>{b}</Bullet>)}
            {step.followText && (
                <p style={{ color: MUTED, fontSize: '0.82rem', lineHeight: 1.75, fontFamily: 'Arial, sans-serif', marginTop: 14 }}>
                    {step.followText}
                </p>
            )}
            {(step.noteTitle || step.noteBullets.length > 0) && (
                <Note title={step.noteTitle} bullets={step.noteBullets} />
            )}
            {step.id === 'callsign' && (
                <button
                    onClick={onViewRoles}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 20px', background: `${RED}12`, border: `1px solid ${RED}45`, color: RED, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'Oswald', Arial, sans-serif", marginTop: 4 }}
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <path d="M7 1.5L11.5 3.5V7C11.5 9.5 9.5 11.7 7 12.5C4.5 11.7 2.5 9.5 2.5 7V3.5L7 1.5Z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                        <path d="M4.8 7L6.5 8.7L9.2 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    View Available Roles &amp; Specialist Training
                </button>
            )}
        </>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InfoPageClient({ info }: { info: RecruitmentInfoContent }) {
    const router = useRouter()
    const [visible,   setVisible]   = useState(false)
    const [fading,    setFading]    = useState(false)
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
    const [checked,   setChecked]   = useState(false)
    const [activeId,  setActiveId]  = useState(info.steps[0]?.id ?? 'apply')
    const [showRoles, setShowRoles] = useState(false)

    const intervalRef  = useRef<NodeJS.Timeout | null>(null)
    const sectionRefs  = useRef<Record<string, HTMLElement | null>>({})

    // Derive STEPS list from info.steps for TOC + background crossfade
    const STEPS = info.steps.map((s, i) => ({ id: s.id, num: i + 1, title: s.title }))

    // Fade in
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 20)
        return () => clearTimeout(t)
    }, [])

    // 10-second countdown
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            setCountdown(c => {
                if (c <= 1) { clearInterval(intervalRef.current!); return 0 }
                return c - 1
            })
        }, 1000)
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [])

    // Scroll-spy (TOC active state)
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActiveId(entry.target.id)
                }
            },
            { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
        )
        Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el) })
        return () => observer.disconnect()
    }, [])

    const scrollTo = (id: string) => {
        sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const handleAcknowledge = () => {
        if (countdown > 0 || !checked) return
        setFading(true)
        setTimeout(() => router.push('/join'), 840)
    }

    const setRef = (id: string) => (el: HTMLElement | null) => { sectionRefs.current[id] = el }

    const canProceed = countdown === 0 && checked

    return (
        <>
            {showRoles && createPortal(
                <RolesModal onClose={() => setShowRoles(false)} roles={info.roles} />,
                document.body
            )}

            {/* ── Page content ── */}
            <div style={{
                minHeight: '100dvh',
                background: DARK,
                opacity: visible && !fading ? 1 : 0,
                transition: 'opacity 0.8s ease',
                display: 'flex',
                flexDirection: 'column',
            }}>

                {/* ── Top bar ── */}
                <div style={{
                    borderBottom: `1px solid ${RED}40`,
                    padding: '12px 32px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    flexShrink: 0,
                    background: 'rgba(8,8,8,0.72)',
                    backdropFilter: 'blur(14px)',
                }}>
                    <div style={{ width: 3, height: 20, background: RED, flexShrink: 0 }} />
                    <div style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: `${RED}70`, fontFamily: "'Oswald', Arial, sans-serif" }}>
                        Australian Special Operations Taskforce — Recruitment Information
                    </div>
                </div>

                {/* ── Body: sidebar + scroll content ── */}
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                    {/* ── Left TOC sidebar ── */}
                    <div style={{
                        width: 240, flexShrink: 0,
                        borderRight: `1px solid ${BORDER}`,
                        padding: '36px 0',
                        position: 'sticky', top: 0, height: '100vh',
                        overflowY: 'auto',
                        display: 'flex', flexDirection: 'column',
                        background: 'rgba(8,8,8,0.72)',
                        backdropFilter: 'blur(14px)',
                    }}>
                        <div style={{ padding: '0 24px', marginBottom: 28 }}>
                            <div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: DIM, fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 6 }}>
                                Your Path Into ASOT
                            </div>
                            <div style={{ height: 1, background: `${RED}30` }} />
                        </div>

                        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', paddingLeft: 24 }}>
                            <div style={{ position: 'absolute', left: 36, top: 8, bottom: 8, width: 1, background: `${RED}18` }} />

                            {STEPS.map(step => {
                                const isActive = activeId === step.id
                                return (
                                    <button
                                        key={step.id}
                                        onClick={() => scrollTo(step.id)}
                                        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 16px 8px 0', position: 'relative' }}
                                    >
                                        <div style={{
                                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                            background: isActive ? RED : 'transparent',
                                            border: `1.5px solid ${isActive ? RED : `${RED}35`}`,
                                            color: isActive ? '#fff' : `${RED}70`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontFamily: "'Oswald', Arial, sans-serif", fontWeight: 700, fontSize: '0.65rem',
                                            transition: 'all 0.2s', zIndex: 1,
                                        }}>
                                            {step.num}
                                        </div>
                                        <div style={{
                                            fontSize: '0.68rem', lineHeight: 1.4, paddingTop: 4,
                                            color: isActive ? TEXT : MUTED,
                                            fontWeight: isActive ? 700 : 400,
                                            fontFamily: 'Arial, sans-serif',
                                            transition: 'color 0.2s',
                                        }}>
                                            {step.title}
                                        </div>
                                    </button>
                                )
                            })}

                            {/* Fully Qualified Member — scrolls to acknowledgement */}
                            <button
                                onClick={() => scrollTo('acknowledge')}
                                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 16px 8px 0', marginTop: 4, position: 'relative' }}
                            >
                                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: `${RED}18`, border: `1.5px solid ${RED}50`, color: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', zIndex: 1 }}>✓</div>
                                <div style={{ fontSize: '0.68rem', lineHeight: 1.4, paddingTop: 4, color: `${RED}80`, fontWeight: 700, fontFamily: 'Arial, sans-serif' }}>Fully Qualified Member</div>
                            </button>
                        </div>

                        <div style={{ flex: 1 }} />

                        <button onClick={() => scrollTo('acknowledge')} style={{ all: 'unset', cursor: 'pointer', margin: '0 16px 20px', padding: '9px 14px', border: `1px solid ${RED}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${RED}80`, fontFamily: "'Oswald', Arial, sans-serif" }}>
                                {countdown > 0 ? `Proceed to Acknowledgement (${countdown}s)` : 'Proceed to Acknowledgement'}
                            </span>
                        </button>
                    </div>

                    {/* ── Scrollable content pane ── */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {/* ── Page header — centered column ── */}
                        <div style={{ maxWidth: 1024, margin: '0 auto', padding: 'clamp(40px, 5vw, 64px) clamp(24px, 5vw, 48px) 0' }}>
                            <div style={{ marginBottom: 40 }}>
                                <div style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.32em', textTransform: 'uppercase', color: `${RED}75`, fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 10 }}>
                                    Australian Special Operations Taskforce
                                </div>
                                <h1 style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: 'clamp(1.8rem, 4.5vw, 2.8rem)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT, margin: '0 0 16px', lineHeight: 1.05 }}>
                                    What Happens Next
                                </h1>
                                <div style={{ width: 56, height: 3, background: RED, marginBottom: 22 }} />
                                <p style={{ fontSize: '0.9rem', color: MUTED, lineHeight: 1.8, fontFamily: 'Arial, sans-serif', margin: 0, borderLeft: `3px solid ${RED}45`, paddingLeft: 16 }}>
                                    {info.introText}
                                </p>
                            </div>
                        </div>

                        {/* ── Steps — full-width image zones, step cards centered ── */}
                        {/* Each image spans the full viewport width and covers its two steps.
                            Top/bottom gradients fade to DARK so adjacent zones blend smoothly. */}
                        {[0, 1, 2].map(gi => {
                            const pair = info.steps.slice(gi * 2, gi * 2 + 2)
                            const src  = (info.sectionImages ?? ['', '', ''])[gi]
                            const posY = (info.sectionImagePositions ?? [50, 50, 50])[gi]
                            return (
                                <div key={gi} style={{ position: 'relative' }}>
                                    {src && (
                                        <>
                                            {/* Full-width background image */}
                                            <div style={{
                                                position: 'absolute', inset: 0, zIndex: 0,
                                                backgroundImage: `url(${src})`,
                                                backgroundSize: 'cover',
                                                backgroundPosition: `center ${posY}%`,
                                            }} />
                                            {/* Gradient: fades image to page background at top & bottom edges */}
                                            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: `linear-gradient(to bottom, ${DARK} 0%, transparent 20%, transparent 80%, ${DARK} 100%)` }} />
                                            {/* Subtle uniform tint for text readability */}
                                            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(8,8,8,0.28)' }} />
                                        </>
                                    )}
                                    {/* Step cards — max-width centered column */}
                                    <div style={{ position: 'relative', zIndex: 2, maxWidth: 1024, margin: '0 auto', padding: '0 clamp(24px, 5vw, 48px)' }}>
                                        {pair.map((step, idx) => (
                                            <StepCard
                                                key={step.id}
                                                id={step.id}
                                                sectionRef={setRef(step.id)}
                                                num={gi * 2 + idx + 1}
                                                total={info.steps.length}
                                                title={step.title}
                                            >
                                                <StepBody step={step} onViewRoles={() => setShowRoles(true)} />
                                            </StepCard>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}

                        {/* ── Acknowledgement — centered column ── */}
                        <div style={{ maxWidth: 1024, margin: '0 auto', padding: '0 clamp(24px, 5vw, 48px) clamp(40px, 5vw, 64px)' }}>
                        <section
                            id='acknowledge'
                            ref={setRef('acknowledge')}
                            style={{ padding: '28px 24px', border: `1px solid ${RED}25`, borderTop: `3px solid ${RED}`, background: 'rgba(8,8,8,0.6)', backdropFilter: 'blur(6px)', marginBottom: 60 }}
                        >
                                <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: `${RED}80`, fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 6 }}>
                                    Acknowledgement
                                </div>
                                <div style={{ fontSize: '0.48rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: DIM, fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 20 }}>
                                    {countdown > 0
                                        ? `Please read the above before proceeding — ${countdown}s remaining`
                                        : 'Please check the box below to continue'}
                                </div>

                                <label
                                    htmlFor='ack-checkbox'
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 14,
                                        padding: '16px 18px',
                                        background: `${RED}08`,
                                        border: `1px solid ${checked ? `${RED}50` : `${RED}20`}`,
                                        marginBottom: 24,
                                        cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                                        transition: 'border-color 0.2s',
                                    }}
                                >
                                    <input
                                        id='ack-checkbox'
                                        type='checkbox'
                                        checked={checked}
                                        disabled={countdown > 0}
                                        onChange={e => setChecked(e.target.checked)}
                                        style={{
                                            width: 17, height: 17, flexShrink: 0, marginTop: 3,
                                            accentColor: RED,
                                            cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                                            opacity: countdown > 0 ? 0.35 : 1,
                                        }}
                                    />
                                    <span style={{ color: TEXT, fontSize: '0.84rem', lineHeight: 1.75, fontFamily: 'Arial, sans-serif' }}>
                                        {info.acknowledgeText}
                                    </span>
                                </label>

                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <button
                                    onClick={handleAcknowledge}
                                    disabled={!canProceed}
                                    style={{
                                        padding: '14px 36px',
                                        background: canProceed ? RED : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${canProceed ? RED : BORDER}`,
                                        color: canProceed ? '#fff' : DIM,
                                        fontSize: '0.7rem', fontWeight: 800,
                                        letterSpacing: '0.18em', textTransform: 'uppercase',
                                        cursor: canProceed ? 'pointer' : 'not-allowed',
                                        fontFamily: "'Oswald', Arial, sans-serif",
                                        transition: 'background 0.35s, color 0.35s, border-color 0.35s',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}
                                >
                                    {countdown > 0 ? (
                                        <>
                                            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 16, textAlign: 'center', fontSize: '0.85rem' }}>{countdown}</span>
                                            <span>Please read the above before continuing</span>
                                        </>
                                    ) : !checked ? (
                                        'Please acknowledge above to continue'
                                    ) : (
                                        'I Acknowledge — Proceed to Application'
                                    )}
                                </button>
                                </div>
                        </section>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
