'use client'

import { useCallback, useEffect, useState } from 'react'
import { INDUCTION_STATUS_LABEL, type InductionStatus } from '@/lib/recruitment/induction-pack'

/**
 * Row 213, Part A: send the Induction Pack for one application, and show how
 * far the recruit has got with it. On the recruit wizard's finish screen and
 * in the application's detail view.
 */

interface PackStatus {
    sent: { sentAt: string; sentByName: string; sendCount: number } | null
    status: InductionStatus
    stepsDone: number
    stepsTotal: number
    selectionInterest: { at: string; instanceRef?: string } | null
}

const STATUS_COLOR: Record<InductionStatus, string> = {
    not_sent: 'rgba(237,237,237,0.4)',
    sent: 'var(--amber)',
    opened: 'var(--info)',
    in_progress: 'var(--info)',
    completed: '#00c364',
}

export default function InductionPackSend({ applicationId }: { applicationId: string }) {
    const [state, setState] = useState<PackStatus | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch(`/api/admin/j1/applications/${applicationId}/induction-pack`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setState)
            .catch(() => setError('Could not load the Induction Pack status.'))
    }, [applicationId])
    useEffect(load, [load])

    async function send() {
        setBusy(true); setError(null)
        try {
            const res = await fetch(`/api/admin/j1/applications/${applicationId}/induction-pack`, { method: 'POST' })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'Sending failed.'); return }
            setState(d)
        } catch {
            setError('Network error.')
        } finally {
            setBusy(false)
        }
    }

    const sent = state?.sent
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>Induction Pack</div>
            {state && (
                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                    <span style={{ color: STATUS_COLOR[state.status], fontWeight: 700 }}>{INDUCTION_STATUS_LABEL[state.status]}</span>
                    {sent && <> · sent by {sent.sentByName}, {new Date(sent.sentAt).toLocaleString()}{sent.sendCount > 1 ? ` (${sent.sendCount} times)` : ''}</>}
                    {sent && state.status !== 'completed' && <> · {state.stepsDone} of {state.stepsTotal} steps</>}
                    <br />
                    Selection: {state.selectionInterest
                        ? `interest registered ${new Date(state.selectionInterest.at).toLocaleDateString()}${state.selectionInterest.instanceRef ? ` for ${state.selectionInterest.instanceRef}` : ''}`
                        : 'not registered'}
                </div>
            )}
            <button type='button' onClick={send} disabled={busy || !state}
                style={{
                    alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: 'rgba(0,195,100,0.12)', border: '1px solid rgba(0,195,100,0.4)', color: '#00c364',
                    cursor: busy ? 'default' : 'pointer', opacity: busy || !state ? 0.5 : 1,
                }}>
                {busy ? 'Sending…' : sent ? 'Resend Induction Pack' : 'Send Induction Pack'}
            </button>
            {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>{error}</span>}
        </div>
    )
}
