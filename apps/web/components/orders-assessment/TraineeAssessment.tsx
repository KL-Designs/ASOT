'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { isOpenForTrainee, type AssessmentStatus, type AssessmentTemplate, type SourceOrders } from '@/lib/training/orders-assessment'
import { AnswerSheet, button, label, OrdersBody, panel, StatusPill } from './shared'

interface View {
    _id: string
    trainingTypeId: string
    trainingTypeName: string
    trainerName: string
    status: AssessmentStatus
    orders: SourceOrders
    operationId?: string | null
    template: AssessmentTemplate
    answers: Record<string, string>
    review?: { outcome: string; comment: string; byName: string } | null
    attempts: { review?: { comment: string; byName: string } | null }[]
}

/**
 * Row 373: the trainee's page. Their copy of the source orders and the
 * template, saved as they type, then submitted. Nothing about the
 * similarity check reaches this page; the API strips it.
 */
export default function TraineeAssessment({ id }: { id: string }) {
    const [view, setView] = useState<View | null>(null)
    const [isTrainee, setIsTrainee] = useState(false)
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const load = useCallback(() => {
        fetch(`/api/training/assessments/${id}`).then(async r => {
            const d = await r.json().catch(() => ({}))
            if (!r.ok) { setError(d.error ?? 'Could not load this assessment.'); return }
            setView(d.assessment); setAnswers(d.assessment.answers ?? {}); setIsTrainee(d.isTrainee)
        }).catch(() => setError('Network error'))
    }, [id])
    useEffect(load, [load])

    const editable = !!view && isTrainee && isOpenForTrainee(view.status)

    function change(field: string, value: string) {
        const next = { ...answers, [field]: value }
        setAnswers(next)
        setSaved('saving')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
            fetch(`/api/training/assessments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: next }) })
                .then(r => setSaved(r.ok ? 'saved' : 'idle')).catch(() => setSaved('idle'))
        }, 800)
    }

    async function submit() {
        if (timer.current) clearTimeout(timer.current)
        setBusy(true); setError(null)
        const r = await fetch(`/api/training/assessments/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) }).catch(() => null)
        const d = await r?.json().catch(() => ({}))
        setBusy(false); setConfirming(false)
        if (!r?.ok) { setError(d?.error ?? 'Could not submit.'); return }
        load()
    }

    if (error && !view) return <div style={{ padding: 24 }}><div style={{ ...panel, color: 'rgb(219,0,29)', fontSize: '0.78rem' }}>{error}</div></div>
    if (!view) return <div style={{ padding: 24, fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>Loading…</div>

    const lastReview = view.review ?? view.attempts[view.attempts.length - 1]?.review ?? null

    return (
        <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
                <Link href={(isTrainee ? '/me/assessments' : `/dashboard/unit/training-hub/assessment/${view.trainingTypeId}?review=${view._id}`) as Route} style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.45)', textDecoration: 'none' }}>← {isTrainee ? 'My assessments' : 'Open in the review page'}</Link>
                <div style={{ ...label, marginTop: 10 }}>Orders assessment · {view.trainerName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>{view.trainingTypeName}</h1>
                    <StatusPill status={view.status} />
                </div>
            </div>

            {lastReview && (lastReview.comment || view.review) && (
                <div style={{ ...panel, borderColor: view.status === 'passed' ? 'rgba(76,175,80,0.35)' : 'rgba(245,158,11,0.35)' }}>
                    <div style={label}>Feedback from {lastReview.byName}</div>
                    <div style={{ fontSize: '0.78rem', marginTop: 6, whiteSpace: 'pre-wrap' }}>{lastReview.comment || 'No comment.'}</div>
                    {view.status === 'reassessment_required' && <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)', marginTop: 8 }}>You have been given a new set of source orders. Write fresh orders from them{view.operationId ? ' in your new copy' : ' below'}.</div>}
                </div>
            )}

            {view.operationId && (
                <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={label}>Your orders</div>
                    <div style={{ fontSize: '0.78rem' }}>
                        {editable
                            ? 'You have your own copy of the orders, with your name on it. Write your section orders in it the way you would on any operation. Only you, your trainer, J3 and J4 can see it.'
                            : 'Your copy of the orders, as you wrote them.'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <a href={`/operations/${view.operationId}/edit`} target='_blank' rel='noreferrer' style={{ ...button(editable ? 'red' : 'ghost'), textDecoration: 'none' }}>{editable ? 'Open and write my orders ↗' : 'Open my orders ↗'}</a>
                        <a href={`/operations/${view.operationId}`} target='_blank' rel='noreferrer' style={{ ...button(), textDecoration: 'none' }}>Preview ↗</a>
                        {editable && (confirming ? (
                            <>
                                <span style={{ fontSize: '0.72rem' }}>Submit for review? You cannot edit after this.</span>
                                <button type='button' disabled={busy} onClick={submit} style={button('red')}>{busy ? 'Submitting…' : 'Submit'}</button>
                                <button type='button' onClick={() => setConfirming(false)} style={button()}>Cancel</button>
                            </>
                        ) : (
                            <button type='button' onClick={() => setConfirming(true)} style={button()}>Submit for review</button>
                        ))}
                    </div>
                    {error && <div style={{ fontSize: '0.72rem', color: 'rgb(219,0,29)' }}>{error}</div>}
                </div>
            )}

            {!view.operationId && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, alignItems: 'start' }}>
                <OrdersBody orders={view.orders} />
                <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <AnswerSheet template={view.template} answers={answers} onChange={editable ? change : undefined} />
                    {editable && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                            {confirming ? (
                                <>
                                    <span style={{ fontSize: '0.72rem' }}>Submit for review? You cannot edit after this.</span>
                                    <button type='button' disabled={busy} onClick={submit} style={button('red')}>{busy ? 'Submitting…' : 'Submit'}</button>
                                    <button type='button' onClick={() => setConfirming(false)} style={button()}>Cancel</button>
                                </>
                            ) : (
                                <button type='button' onClick={() => setConfirming(true)} style={button('red')}>Submit for review</button>
                            )}
                            <div style={{ flex: 1 }} />
                            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)' }}>{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Draft saved' : ''}</span>
                        </div>
                    )}
                    {error && <div style={{ fontSize: '0.72rem', color: 'rgb(219,0,29)' }}>{error}</div>}
                </div>
            </div>}
        </div>
    )
}
