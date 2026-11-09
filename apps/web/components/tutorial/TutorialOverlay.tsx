'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { School } from '@mui/icons-material'
import type { TutorialRun } from './TutorialProvider'
import { onSandboxWrite } from '@/lib/tutorial/sandbox'
import { pathMatches, resolvePath } from '@/lib/tutorial/paths'

/** How long to look for a step's target before telling the member it isn't there. */
const TARGET_TIMEOUT_MS = 10_000
/** How long a step with `requires` waits for the page to settle before deciding to skip. */
const REQUIRES_SETTLE_MS = 800
/** Above MUI dialogs (1300), poppers and snackbars (1400-1500). */
const Z = 2000

interface Rect { top: number; left: number; width: number; height: number }

function sameRect(a: Rect | null, b: Rect | null) {
    if (!a || !b) return a === b
    return Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1
}

export default function TutorialOverlay({ run, onNext, onBack, onQuit, navigate }: {
    run: TutorialRun
    onNext: () => void
    onBack: () => void
    onQuit: () => void
    navigate: (path: string) => void
}) {
    const { tutorial, ctx, step: index } = run
    const step = tutorial.steps[index]
    const advance = step.advance ?? { type: 'next' as const }
    const waiting = advance.type !== 'next'
    const isLast = index === tutorial.steps.length - 1

    const [rect, setRect] = useState<Rect | null>(null)
    const [missing, setMissing] = useState(false)
    const [mounted, setMounted] = useState(false)
    const advanced = useRef(false)
    const nextRef = useRef(onNext)
    nextRef.current = onNext

    // Advance at most once per step, whatever fires.
    const advanceOnce = (delay = 0) => {
        if (advanced.current) return
        advanced.current = true
        setTimeout(() => nextRef.current(), delay)
    }

    useEffect(() => { setMounted(true) }, [])

    // Get onto the step's page.
    useEffect(() => {
        if (!step.path) return
        const want = resolvePath(step.path, ctx)
        if (!pathMatches(window.location, want)) navigate(want)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per step
    }, [])

    // Track the target, and skip the step when its `requires` never shows.
    useEffect(() => {
        if (!step.target && !step.requires) return
        const began = Date.now()
        let foundAt: number | null = null
        let scrolled = false
        let raf = 0
        let last: Rect | null = null

        const tick = () => {
            const el = step.target ? document.querySelector(step.target) as HTMLElement | null : null
            if (el) {
                if (foundAt === null) foundAt = Date.now()
                const r = el.getBoundingClientRect()
                const next = { top: r.top, left: r.left, width: r.width, height: r.height }
                if (!sameRect(last, next)) { last = next; setRect(next) }
                if (!scrolled) {
                    scrolled = true
                    if (r.top < 60 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
                }
                setMissing(false)
            } else if (last) {
                last = null
                setRect(null)
            }

            const now = Date.now()
            if (step.requires) {
                const settled = (foundAt !== null && now - foundAt > REQUIRES_SETTLE_MS) || (!step.target && now - began > REQUIRES_SETTLE_MS) || now - began > TARGET_TIMEOUT_MS
                if (settled && !document.querySelector(step.requires)) { advanceOnce(); return }
            }
            if (step.target && foundAt === null && now - began > TARGET_TIMEOUT_MS) setMissing(true)
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per step
    }, [])

    // Wait for whatever the step is waiting for.
    useEffect(() => {
        if (advance.type === 'click') {
            const selector = advance.selector ?? step.target
            if (!selector) return
            const onClick = (e: MouseEvent) => {
                if ((e.target as Element | null)?.closest?.(selector)) advanceOnce(150)
            }
            document.addEventListener('click', onClick, true)
            return () => document.removeEventListener('click', onClick, true)
        }
        if (advance.type === 'visible') {
            const id = setInterval(() => { if (document.querySelector(advance.selector)) advanceOnce(250) }, 150)
            return () => clearInterval(id)
        }
        if (advance.type === 'write') {
            return onSandboxWrite(w => {
                if (advance.method && w.method !== advance.method.toUpperCase()) return
                if (!advance.path.test(w.url.pathname)) return
                if (advance.test && !advance.test(w.body)) return
                advanceOnce(400)
            })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per step
    }, [])

    if (!mounted) return null

    const paragraphs = Array.isArray(step.body) ? step.body : [step.body]
    const pad = 6
    const spot = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }

    // Card placement: under the target when it fits, else above, else centred.
    const cardW = Math.min(360, window.innerWidth - 32)
    const vw = window.innerWidth, vh = window.innerHeight
    let cardStyle: React.CSSProperties
    if (spot) {
        const left = Math.max(16, Math.min(spot.left, vw - cardW - 16))
        const below = spot.top + spot.height + 12
        if (below + 220 < vh) cardStyle = { top: below, left }
        else if (spot.top - 12 > 240) cardStyle = { bottom: vh - spot.top + 12, left }
        else cardStyle = { bottom: 24, right: 24 }
    } else {
        cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }

    const btn: React.CSSProperties = {
        fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        padding: '6px 14px', cursor: 'pointer', borderRadius: 0, fontFamily: 'inherit',
    }

    return createPortal(
        <>
            {/* Dim everything but the target. The cut-out is a box-shadow, so it never blocks clicks. */}
            {spot ? (
                <div aria-hidden style={{
                    position: 'fixed', ...spot, zIndex: Z, pointerEvents: 'none',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', outline: '2px solid var(--red, #db001d)',
                    transition: 'top .15s, left .15s, width .15s, height .15s',
                }} />
            ) : !step.target ? (
                // A centred card with nothing to point at: hold the page still while it is read.
                <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(0,0,0,0.55)' }} />
            ) : null}

            {/* Always on screen while the sandbox is up, so nobody mistakes practice for the real thing. */}
            <div role='status' style={{
                position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: Z + 2,
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 14px', maxWidth: 'calc(100vw - 32px)',
                background: '#1a0a0c', border: '1px solid rgba(219,0,29,0.55)', color: 'var(--foreground, #ededed)',
                fontSize: '0.66rem', letterSpacing: '0.08em', boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            }}>
                <School sx={{ fontSize: '1rem', color: 'var(--red, #db001d)' }} />
                <span style={{ fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Tutorial mode</span>
                <span style={{ color: 'rgba(237,237,237,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Nothing you do here is saved</span>
                <button onClick={onQuit} style={{ ...btn, padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.8)' }}>
                    Quit
                </button>
            </div>

            <div role='dialog' aria-label={step.title} style={{
                position: 'fixed', ...cardStyle, width: cardW, zIndex: Z + 1,
                background: '#0f0f0f', border: '1px solid rgba(219,0,29,0.35)', borderTop: '2px solid var(--red, #db001d)',
                color: 'var(--foreground, #ededed)', padding: '14px 16px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)', marginBottom: 6 }}>
                    {tutorial.title} · {index + 1} / {tutorial.steps.length}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>{step.title}</div>
                {paragraphs.map((p, i) => (
                    <p key={i} style={{ fontSize: '0.8rem', lineHeight: 1.55, color: 'rgba(237,237,237,0.78)', margin: '0 0 8px' }}>{p}</p>
                ))}
                {missing ? (
                    <p style={{ fontSize: '0.74rem', lineHeight: 1.5, color: 'var(--amber, #f59e0b)', margin: '4px 0 8px' }}>
                        We can&apos;t find this on the page. It may still be loading, or your role may not have it. You can skip this step.
                    </p>
                ) : waiting && step.hint ? (
                    <p style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', fontStyle: 'italic', margin: '4px 0 8px' }}>{step.hint}</p>
                ) : null}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    {index > 0 && (
                        <button onClick={onBack} style={{ ...btn, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.6)' }}>Back</button>
                    )}
                    <span style={{ flex: 1 }} />
                    {waiting || missing ? (
                        <button onClick={() => advanceOnce()} style={{ ...btn, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.45)', textDecoration: 'underline' }}>
                            Skip step
                        </button>
                    ) : (
                        <button onClick={() => advanceOnce()} style={{ ...btn, background: 'rgba(219,0,29,0.3)', border: '1px solid rgba(219,0,29,0.6)', color: 'var(--foreground, #ededed)' }}>
                            {isLast ? 'Finish' : 'Next'}
                        </button>
                    )}
                </div>
            </div>
        </>,
        document.body,
    )
}
