'use client'

import { useEffect, useState } from 'react'

/**
 * On an Objective Idea ticket: a J2 lead confirms it into Objective Suggestions.
 *
 * "Gets confirmed by J2 leads before adding" — this button is that step. The
 * entry is built server-side from the ticket's own fields, so confirming adds
 * what the member pitched; J2 tidy it afterwards in the tab.
 *
 * Shows a note once confirmed, the button to a lead beforehand, and nothing to
 * anybody else.
 */
export default function ConfirmObjectiveIdea({ ticketId }: { ticketId: string }) {
    const [state, setState] = useState<{ canConfirm: boolean; confirmed: boolean } | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        fetch(`/api/j2/objective-suggestions?ticketId=${ticketId}`)
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (live && d) setState({ canConfirm: !!d.canConfirm, confirmed: !!d.confirmed }) })
            .catch(() => { })
        return () => { live = false }
    }, [ticketId])

    if (!state) return null

    if (state.confirmed) {
        return <span style={{ fontSize: '0.75rem', color: 'rgba(120,220,150,0.9)' }}>Confirmed by J2 and added to Objective Suggestions.</span>
    }
    if (!state.canConfirm) return null

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
                type='button'
                disabled={busy}
                onClick={async () => {
                    setBusy(true)
                    setError(null)
                    const res = await fetch('/api/j2/objective-suggestions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sourceTicketId: ticketId }),
                    }).catch(() => null)
                    setBusy(false)
                    if (!res?.ok) {
                        const info = await res?.json().catch(() => null)
                        setError(info?.error ?? 'Could not add it. Try again.')
                        return
                    }
                    setState({ canConfirm: true, confirmed: true })
                }}
                style={{
                    padding: '5px 12px', background: 'rgba(0,195,255,0.08)', border: '1px solid rgba(0,195,255,0.3)', color: 'rgba(0,195,255,0.85)',
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer',
                }}
            >
                {busy ? 'Adding…' : 'Confirm and add to Objective Suggestions'}
            </button>
            {error && <span style={{ color: '#ff8a80', fontSize: '0.75rem' }}>{error}</span>}
        </span>
    )
}
