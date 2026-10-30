'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import {
    isAwaitingReview, usableVariants,
    type AssessmentStatus, type AssessmentTemplate, type SourceOrders,
} from '@/lib/training/orders-assessment'
import type { SimilarityResult } from '@/lib/training/similarity'
import { AnswerSheet, button, input, label, OrdersBody, panel, SimilarityPanel, SimilarityPill, StatusPill } from './shared'

/**
 * Rows 372 and 373: a Leadership course's Assessment Orders page. Source
 * orders per variant (an operation on the site, so trainees learn the
 * site's orders), assigning trainees from a session, and the assessments
 * by trainee with the similarity check side by side. Each trainee writes in
 * a private copy of their variant's operation.
 */

type Tab = 'assessments' | 'assign' | 'orders'
type Standing = { isLead: boolean; isTrainingStaff: boolean; canEditConfig: boolean }
type Session = { kind: 'instance' | 'event'; id: string; label: string }
type Person = { id: string; name: string }

interface Row {
    _id: string
    traineeId: string
    traineeName: string
    trainerId: string
    trainerName: string
    variant: number
    status: AssessmentStatus
    session: Session | null
    operationId?: string | null
    submittedAt?: string | null
    similarity: { score: number; level: SimilarityResult['level'] } | null
    createdAt: string
}

interface Full {
    _id: string
    traineeName: string
    trainerName: string
    status: AssessmentStatus
    variant: number
    orders: SourceOrders
    operationId?: string | null
    template: AssessmentTemplate
    answers: Record<string, string>
    submittedAt?: string | null
    similarity?: SimilarityResult | null
    review?: { outcome: string; comment: string; byName: string; at: string } | null
    attempts: { variant: number; operationId?: string | null; template?: AssessmentTemplate; answers: Record<string, string>; submittedAt?: string | null; similarity?: SimilarityResult | null; review?: { outcome: string; comment: string; byName: string } | null }[]
    session: Session | null
}

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    if (!res) return { ok: false, error: 'Network error' }
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data: data as T } : { ok: false, error: data.error ?? `Request failed (${res.status})` }
}

const sessionKey = (s: Session | null) => s ? `${s.kind}:${s.id}` : ''

/** `embedded`: shown inside the Training Hub's Staff Assessments tab, which supplies its own heading and navigation. */
export default function AssessmentManager({ typeId, myId, initialReview, initialSession, backUrl, embedded }: { typeId: string; myId: string; initialReview: string | null; initialSession: string; backUrl: string; embedded?: boolean }) {
    const [type, setType] = useState<{ name: string; category: string } | null>(null)
    const [standing, setStanding] = useState<Standing | null>(null)
    const [orders, setOrders] = useState<SourceOrders[]>([])
    const [tab, setTab] = useState<Tab>('assessments')
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        call<{ type: { name: string; category: string }; config: { orders: SourceOrders[]; template: AssessmentTemplate }; standing: Standing }>(`/api/training/assessments/config/${typeId}`)
            .then(r => {
                if (!r.ok) { setError(r.error); return }
                setType(r.data.type); setStanding(r.data.standing)
                setOrders(r.data.config.orders)
            })
    }, [typeId])

    async function saveOrders() {
        setSaving(true); setNotice(null); setError(null)
        const r = await call<{ orders: SourceOrders[] }>(`/api/training/assessments/config/${typeId}`, 'PUT', { orders })
        setSaving(false)
        if (!r.ok) { setError(r.error); return }
        setOrders(r.data.orders)
        setNotice('Source orders saved. Copies already issued keep the version they were given.')
    }

    const tabs: [Tab, string][] = [['assessments', 'Assessments'], ...(standing?.isTrainingStaff ? [['assign', 'Assign'] as [Tab, string]] : []), ['orders', 'Source Orders']]

    return (
        <div style={{ padding: embedded ? 0 : '24px 20px', maxWidth: 1200, margin: embedded ? 0 : '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!embedded && (
                <div>
                    <Link href={backUrl as Route} style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.45)', textDecoration: 'none' }}>← Back</Link>
                    <div style={{ ...label, marginTop: 10 }}>Assessment Orders</div>
                    <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '4px 0 0' }}>{type?.name ?? 'Loading…'}</h1>
                </div>
            )}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {tabs.map(([k, l]) => (
                    <button key={k} type='button' onClick={() => setTab(k)} style={{ padding: '8px 14px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--red)' : 'transparent'}`, color: tab === k ? '#ededed' : 'rgba(237,237,237,0.45)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{l}</button>
                ))}
            </div>
            {error && <div style={{ ...panel, borderColor: 'rgba(219,0,29,0.4)', color: 'rgb(219,0,29)', fontSize: '0.75rem' }}>{error}</div>}
            {notice && <div style={{ ...panel, borderColor: 'rgba(76,175,80,0.35)', color: 'rgb(76,175,80)', fontSize: '0.75rem' }}>{notice}</div>}

            {tab === 'assessments' && <AssessmentsList typeId={typeId} myId={myId} initialReview={initialReview} initialSession={initialSession} />}
            {tab === 'assign' && standing?.isTrainingStaff && <AssignPanel typeId={typeId} isLead={standing.isLead} hasVariants={usableVariants(orders).length > 0} onDone={msg => { setNotice(msg); setTab('assessments') }} />}
            {tab === 'orders' && (
                <OrdersEditor orders={orders} editable={!!standing?.canEditConfig} onChange={setOrders} onSave={saveOrders} saving={saving} />
            )}
        </div>
    )
}

/* ── Source orders ──────────────────────────────────────────────────────── */

type OpOption = { _id: string; title: string; date?: string; status?: string }

function OrdersEditor({ orders, editable, onChange, onSave, saving }: { orders: SourceOrders[]; editable: boolean; onChange: (o: SourceOrders[]) => void; onSave: () => void; saving: boolean }) {
    const [ops, setOps] = useState<OpOption[]>([])
    useEffect(() => {
        if (!editable) return
        call<{ missions: OpOption[] }>('/api/operations?limit=300').then(r => r.ok && setOps(r.data.missions))
    }, [editable])
    const set = (i: number, patch: Partial<SourceOrders>) => onChange(orders.map((o, j) => j === i ? { ...o, ...patch } : o))
    const link = (i: number, id: string) => {
        const op = ops.find(o => o._id === id)
        set(i, id ? { operationId: id, operationTitle: op?.title ?? '' } : { operationId: undefined, operationTitle: undefined })
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>
                Each variant is a different scenario: a set of orders made on the site like any operation&apos;s. When a trainee is assigned one, they get a private copy with their name on it to write their section orders in, which only they, their trainer, J3 and J4 can open.
                Trainees in the same session are spread across the variants, and a reassessment gets one they have not had. A variant with no orders is never handed out.
            </div>
            {orders.map((o, i) => editable ? (
                <div key={i} style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input value={o.title} onChange={e => set(i, { title: e.target.value })} style={{ ...input, flex: 2 }} placeholder={`Assessment Orders ${i + 1}`} />
                        <input value={o.level} onChange={e => set(i, { level: e.target.value })} style={{ ...input, flex: 1 }} placeholder='Level (e.g. section)' />
                        {orders.length > 1 && <button type='button' onClick={() => onChange(orders.filter((_, j) => j !== i))} style={button()}>Remove</button>}
                    </div>
                    <div style={label}>Orders on the site</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={o.operationId ?? ''} onChange={e => link(i, e.target.value)} style={{ ...input, flex: 1 }}>
                            <option value=''>Choose the operation these orders are in…</option>
                            {o.operationId && !ops.some(x => x._id === o.operationId) && <option value={o.operationId}>{o.operationTitle || o.operationId}</option>}
                            {ops.map(x => <option key={x._id} value={x._id}>{x.title}{x.status === 'In Development' ? ' (in development)' : ''}{x.date ? ` · ${new Date(x.date).toLocaleDateString('en-AU')}` : ''}</option>)}
                        </select>
                        {o.operationId && <a href={`/operations/${o.operationId}/edit`} target='_blank' rel='noreferrer' style={{ ...button(), textDecoration: 'none', whiteSpace: 'nowrap' }}>Open ↗</a>}
                    </div>
                    {!o.operationId && o.body.trim() && (
                        <details>
                            <summary style={{ ...label, cursor: 'pointer' }}>Written orders from before (used until an operation is chosen)</summary>
                            <textarea value={o.body} onChange={e => set(i, { body: e.target.value })} rows={8} style={{ ...input, resize: 'vertical', marginTop: 6 }} />
                        </details>
                    )}
                </div>
            ) : <OrdersBody key={i} orders={o} />)}
            {editable && (
                <div style={{ display: 'flex', gap: 8 }}>
                    {orders.length < 12 && <button type='button' onClick={() => onChange([...orders, { variant: orders.length + 1, title: `Assessment Orders ${orders.length + 1}`, body: '', level: '' }])} style={button()}>+ Add variant</button>}
                    <button type='button' onClick={onSave} disabled={saving} style={button('red')}>{saving ? 'Saving…' : 'Save source orders'}</button>
                </div>
            )}
        </div>
    )
}

/* ── Assign ─────────────────────────────────────────────────────────────── */

function MemberSearch({ placeholder, onPick }: { placeholder: string; onPick: (p: Person) => void }) {
    const [q, setQ] = useState('')
    const [results, setResults] = useState<Person[]>([])
    useEffect(() => {
        if (q.trim().length < 2) { setResults([]); return }
        const t = setTimeout(() => {
            call<{ members: Person[] }>(`/api/training/assessments/sessions?q=${encodeURIComponent(q.trim())}`).then(r => r.ok && setResults(r.data.members))
        }, 250)
        return () => clearTimeout(t)
    }, [q])
    return (
        <div style={{ position: 'relative' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} style={input} />
            {results.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, background: '#111', border: '1px solid rgba(255,255,255,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                    {results.map(p => (
                        <button key={p.id} type='button' onClick={() => { onPick(p); setQ(''); setResults([]) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'transparent', border: 'none', color: '#ededed', fontSize: '0.75rem', cursor: 'pointer' }}>{p.name}</button>
                    ))}
                </div>
            )}
        </div>
    )
}

function AssignPanel({ typeId, isLead, hasVariants, onDone }: { typeId: string; isLead: boolean; hasVariants: boolean; onDone: (msg: string) => void }) {
    const [sessions, setSessions] = useState<Session[]>([])
    const [session, setSession] = useState('')
    const [trainees, setTrainees] = useState<Person[]>([])
    const [trainer, setTrainer] = useState<Person | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        call<{ sessions: Session[] }>(`/api/training/assessments/sessions?typeId=${typeId}`).then(r => r.ok && setSessions(r.data.sessions))
    }, [typeId])

    const add = (list: Person[]) => setTrainees(prev => [...prev, ...list.filter(p => !prev.some(x => x.id === p.id))])

    async function addSessionTrainees() {
        if (!session) return
        const r = await call<{ trainees: Person[] }>(`/api/training/assessments/sessions?session=${session}`)
        if (!r.ok) { setError(r.error); return }
        if (!r.data.trainees.length) setError('Nobody is recorded as a trainee on that session yet.')
        add(r.data.trainees)
    }

    async function assign() {
        setBusy(true); setError(null)
        const s = sessions.find(x => sessionKey(x) === session) ?? null
        const r = await call<{ created: number; skipped: number }>('/api/training/assessments', 'POST', { typeId, trainees, session: s, trainerId: trainer?.id })
        setBusy(false)
        if (!r.ok) { setError(r.error); return }
        onDone(`Assigned ${r.data.created} assessment${r.data.created === 1 ? '' : 's'}${r.data.skipped ? `; ${r.data.skipped} already had one for this session` : ''}. Each trainee has been notified.`)
    }

    if (!hasVariants) return <div style={{ ...panel, fontSize: '0.75rem' }}>Write at least one set of source orders before assigning.</div>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            <div style={panel}>
                <div style={label}>Session</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <select value={session} onChange={e => setSession(e.target.value)} style={input}>
                        <option value=''>No session</option>
                        {sessions.map(s => <option key={sessionKey(s)} value={sessionKey(s)}>{s.kind === 'instance' ? 'Course' : 'Event'} · {s.label}</option>)}
                    </select>
                    <button type='button' onClick={addSessionTrainees} disabled={!session} style={{ ...button(), whiteSpace: 'nowrap', opacity: session ? 1 : 0.4 }}>Add session trainees</button>
                </div>
            </div>
            <div style={panel}>
                <div style={label}>Trainees ({trainees.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
                    {trainees.map(t => (
                        <span key={t.id} style={{ fontSize: '0.7rem', padding: '3px 8px', border: '1px solid rgba(255,255,255,0.12)' }}>
                            {t.name} <button type='button' onClick={() => setTrainees(prev => prev.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>×</button>
                        </span>
                    ))}
                </div>
                <MemberSearch placeholder='Add a trainee by name' onPick={p => add([p])} />
            </div>
            {isLead && (
                <div style={panel}>
                    <div style={label}>Trainer</div>
                    <div style={{ fontSize: '0.72rem', margin: '6px 0' }}>{trainer ? <>{trainer.name} <button type='button' onClick={() => setTrainer(null)} style={button()}>Use me</button></> : 'You'}</div>
                    <MemberSearch placeholder='Assign a different trainer' onPick={setTrainer} />
                </div>
            )}
            {error && <div style={{ fontSize: '0.72rem', color: 'rgb(219,0,29)' }}>{error}</div>}
            <div><button type='button' onClick={assign} disabled={busy || !trainees.length} style={{ ...button('red'), opacity: trainees.length ? 1 : 0.4 }}>{busy ? 'Assigning…' : 'Assign and notify'}</button></div>
        </div>
    )
}

/* ── Assessments and review ─────────────────────────────────────────────── */

function AssessmentsList({ typeId, myId, initialReview, initialSession }: { typeId: string; myId: string; initialReview: string | null; initialSession: string }) {
    const [rows, setRows] = useState<Row[] | null>(null)
    const [session, setSession] = useState(initialSession)
    const [open, setOpen] = useState<string | null>(initialReview)

    const load = useCallback(() => {
        call<{ assessments: Row[] }>(`/api/training/assessments?typeId=${typeId}${session ? `&session=${session}` : ''}`).then(r => setRows(r.ok ? r.data.assessments : []))
    }, [typeId, session])
    useEffect(load, [load])

    const sessions = [...new Map((rows ?? []).filter(r => r.session).map(r => [sessionKey(r.session), r.session!])).values()]
    const byTrainee = [...(rows ?? []).reduce((m, r) => m.set(r.traineeId, [...(m.get(r.traineeId) ?? []), r]), new Map<string, Row[]>())]

    return (
        <div style={{ display: 'grid', gridTemplateColumns: open ? 'minmax(260px, 340px) 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select value={session} onChange={e => setSession(e.target.value)} style={input}>
                    <option value=''>All sessions</option>
                    {session && !sessions.some(s => sessionKey(s) === session) && <option value={session}>This session</option>}
                    {sessions.map(s => <option key={sessionKey(s)} value={sessionKey(s)}>{s.label}</option>)}
                </select>
                {rows === null && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>Loading…</div>}
                {rows?.length === 0 && <div style={{ ...panel, fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>No assessments yet.</div>}
                {byTrainee.map(([traineeId, list]) => (
                    <div key={traineeId} style={{ ...panel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{list[0].traineeName}</div>
                        {/* Oldest first: their first, second and third lot of orders, in order. */}
                        {[...list].reverse().map((r, n) => (
                            <button key={r._id} type='button' onClick={() => setOpen(r._id)} style={{ padding: '6px 8px', textAlign: 'left', cursor: 'pointer', color: '#ededed', background: open === r._id ? 'rgba(219,0,29,0.12)' : 'rgba(0,0,0,0.2)', border: `1px solid ${open === r._id ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.06)'}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Orders {n + 1} · variant {r.variant}</span>
                                    <StatusPill status={r.status} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'rgba(237,237,237,0.45)' }}>
                                    <span>{r.trainerId === myId ? 'you' : r.trainerName}{r.session ? ` · ${r.session.label}` : ''}</span>
                                    <SimilarityPill sim={r.similarity} />
                                </div>
                            </button>
                        ))}
                    </div>
                ))}
            </div>
            {open && <ReviewPanel id={open} onClose={() => setOpen(null)} onChanged={load} />}
        </div>
    )
}

function ReviewPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
    const [data, setData] = useState<{ assessment: Full; canReview: boolean } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [comment, setComment] = useState('')
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        setData(null)
        call<{ assessment: Full; canReview: boolean }>(`/api/training/assessments/${id}`).then(r => r.ok ? setData(r.data) : setError(r.error))
    }, [id])
    useEffect(load, [load])

    async function decide(outcome: 'passed' | 'failed' | 'reassessment_required') {
        setBusy(true); setError(null)
        const r = await call(`/api/training/assessments/${id}/review`, 'POST', { outcome, comment })
        setBusy(false)
        if (!r.ok) { setError(r.error); return }
        setComment(''); load(); onChanged()
    }

    if (error) return <div style={{ ...panel, color: 'rgb(219,0,29)', fontSize: '0.75rem' }}>{error}</div>
    if (!data) return <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>Loading…</div>
    const a = data.assessment

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 800 }}>{a.traineeName}</div>
                <StatusPill status={a.status} />
                <div style={{ flex: 1 }} />
                <button type='button' onClick={onClose} style={button()}>Close</button>
            </div>
            {a.operationId && (
                <div style={{ ...panel, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem' }}>{a.traineeName}&apos;s copy of the orders</span>
                    <a href={`/operations/${a.operationId}`} target='_blank' rel='noreferrer' style={{ ...button(), textDecoration: 'none' }}>View ↗</a>
                    <a href={`/operations/${a.operationId}/edit`} target='_blank' rel='noreferrer' style={{ ...button(), textDecoration: 'none' }}>Open in the editor ↗</a>
                </div>
            )}
            {'similarity' in a && <SimilarityPanel sim={a.similarity} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'start' }}>
                <OrdersBody orders={a.orders} />
                <div style={panel}><AnswerSheet template={a.template} answers={a.answers} /></div>
            </div>
            {a.review && (
                <div style={panel}>
                    <div style={label}>Review · {a.review.byName}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.review.comment || 'No comment.'}</div>
                </div>
            )}
            {data.canReview && isAwaitingReview(a.status) && (
                <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={label}>Your decision</div>
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} style={{ ...input, resize: 'vertical' }} placeholder='Feedback for the trainee. Required to fail or ask for a rewrite.' />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type='button' disabled={busy} onClick={() => decide('passed')} style={button('green')}>Pass</button>
                        <button type='button' disabled={busy} onClick={() => decide('reassessment_required')} style={button('amber')}>Reassess</button>
                        <button type='button' disabled={busy} onClick={() => decide('failed')} style={button('red')}>Fail</button>
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}>Reassess keeps this attempt on record and gives the trainee a fresh copy with a different variant.</div>
                </div>
            )}
            {a.attempts.length > 0 && (
                <details style={panel}>
                    <summary style={{ ...label, cursor: 'pointer' }}>Earlier attempts ({a.attempts.length})</summary>
                    {a.attempts.map((t, i) => (
                        <div key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>Attempt {i + 1} · variant {t.variant}{t.review ? ` · ${t.review.byName}: ${t.review.comment}` : ''}</div>
                            {t.operationId && <a href={`/operations/${t.operationId}`} target='_blank' rel='noreferrer' style={{ fontSize: '0.7rem', color: '#60a5fa' }}>That attempt&apos;s orders ↗</a>}
                            {'similarity' in t && t.similarity && <SimilarityPill sim={t.similarity} />}
                            <AnswerSheet template={t.template ?? a.template} answers={t.answers} />
                        </div>
                    ))}
                </details>
            )}
        </div>
    )
}
