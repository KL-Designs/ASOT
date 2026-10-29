'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type LinkItem = { label: string; url: string }
type Step = { id: string; title: string; body: string; links?: LinkItem[] }

interface View {
    welcomeText: string
    imageUrl: string
    links: LinkItem[]
    selectionText: string
    calendarUrl: string
    steps: Step[]
    stepsDone: string[]
    completedAt: string | null
    selectionInterest: { at: string; instanceRef?: string } | null
    next: { at: string; instanceRef: string } | null
}

const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '18px 20px' }
const eyebrow: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.75)' }

function Paragraphs({ text }: { text: string }) {
    return <>{text.split(/\n\s*\n/).filter(Boolean).map((p, i) => <p key={i} style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{p}</p>)}</>
}

function Links({ links }: { links?: LinkItem[] }) {
    if (!links?.length) return null
    return (
        <div className='flex gap-2 flex-wrap'>
            {links.map(l => {
                const style: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', padding: '5px 12px', border: '1px solid rgba(219,0,29,0.35)', color: 'var(--red)', textDecoration: 'none' }
                return l.url.startsWith('/')
                    ? <Link key={l.url + l.label} href={l.url} style={style}>{l.label}</Link>
                    : <a key={l.url + l.label} href={l.url} target='_blank' rel='noreferrer' style={style}>{l.label}</a>
            })}
        </div>
    )
}

export default function InductionClient({ name }: { name: string }) {
    const [view, setView] = useState<View | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/me/induction')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setView)
            .catch(() => setError('The induction could not be loaded. Try refreshing the page.'))
    }, [])

    // The DM's Selection link lands on #selection; scroll once the content exists.
    useEffect(() => {
        if (view && window.location.hash === '#selection') document.getElementById('selection')?.scrollIntoView({ behavior: 'smooth' })
    }, [view])

    async function act(key: string, body: Record<string, unknown>) {
        setBusy(key); setError(null)
        try {
            const res = await fetch('/api/me/induction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'That did not save. Try again.'); return }
            setView(d)
        } catch {
            setError('Network error. Try again.')
        } finally {
            setBusy(null)
        }
    }

    if (!view) {
        return <main className='max-w-3xl mx-auto px-4 py-10' style={{ color: 'rgba(237,237,237,0.6)' }}>{error ?? 'Loading…'}</main>
    }

    const done = new Set(view.stepsDone)
    const count = view.steps.filter(s => done.has(s.id)).length

    return (
        <main className='max-w-3xl mx-auto px-4 py-10 flex flex-col gap-5' style={{ color: 'rgba(237,237,237,0.85)', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <div className='flex flex-col gap-2'>
                <span style={eyebrow}>Member Induction</span>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.04em', margin: 0 }}>Welcome{name ? `, ${name}` : ''}</h1>
                {view.welcomeText && <Paragraphs text={view.welcomeText} />}
                { }
                {view.imageUrl && <img src={view.imageUrl} alt='' style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', alignSelf: 'flex-start' }} />}
                <Links links={view.links} />
            </div>

            <div className='flex items-center gap-3'>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{ width: `${view.steps.length ? (count / view.steps.length) * 100 : 0}%`, height: '100%', background: count === view.steps.length ? '#00c364' : 'var(--red)', transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>{count} of {view.steps.length} done</span>
            </div>

            {view.steps.map((s, i) => {
                const isDone = done.has(s.id)
                return (
                    <section key={s.id} style={{ ...panel, borderLeft: `2px solid ${isDone ? '#00c364' : 'rgba(219,0,29,0.5)'}` }} className='flex flex-col gap-2'>
                        <span style={eyebrow}>Step {i + 1}</span>
                        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{s.title}</h2>
                        <Paragraphs text={s.body} />
                        <Links links={s.links} />
                        <button type='button' disabled={busy === s.id} onClick={() => act(s.id, { action: 'step', stepId: s.id, done: !isDone })}
                            style={{
                                alignSelf: 'flex-start', marginTop: 4, padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                                background: isDone ? 'rgba(0,195,100,0.12)' : 'transparent', border: `1px solid ${isDone ? 'rgba(0,195,100,0.4)' : 'rgba(255,255,255,0.2)'}`,
                                color: isDone ? '#00c364' : 'rgba(237,237,237,0.75)', opacity: busy === s.id ? 0.5 : 1,
                            }}>
                            {isDone ? '✓ Done' : 'Mark as read'}
                        </button>
                    </section>
                )
            })}

            {view.completedAt && (
                <div style={{ ...panel, borderColor: 'rgba(0,195,100,0.3)', color: '#00c364' }}>Induction complete. Thanks for working through it.</div>
            )}

            <section id='selection' style={panel} className='flex flex-col gap-2'>
                <span style={eyebrow}>Next step</span>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Selection</h2>
                {view.selectionText && <Paragraphs text={view.selectionText} />}
                <div>
                    <strong>Next Selection: </strong>
                    {view.next
                        ? new Date(view.next.at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })
                        : 'To be confirmed'}
                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}> (your local time)</span>
                </div>
                {view.selectionInterest ? (
                    <div style={{ color: '#00c364' }}>
                        You registered interest on {new Date(view.selectionInterest.at).toLocaleDateString()}. J3 will confirm your place.
                    </div>
                ) : (
                    <button type='button' disabled={busy === 'selection'} onClick={() => act('selection', { action: 'selection-interest' })}
                        style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', background: 'var(--red)', border: 'none', color: '#fff', opacity: busy === 'selection' ? 0.5 : 1 }}>
                        Register interest
                    </button>
                )}
                {view.calendarUrl && <Links links={[{ label: 'Unit Training Calendar', url: view.calendarUrl }]} />}
            </section>

            {error && <div style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{error}</div>}
        </main>
    )
}
