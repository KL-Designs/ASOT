'use client'

import { useEffect, useState } from 'react'

/**
 * On a mod-request ticket: turn a tested suggestion into a Mod Database entry.
 *
 * Asks the server two things — is there already an entry made from this
 * ticket, and may this viewer make one — and shows a link, a button, or
 * nothing. A member who cannot edit the database and whose ticket has no entry
 * sees nothing at all rather than a disabled control.
 *
 * The entry starts as "Testing" with the ticket's title and link; the status,
 * known issues and who tested it are filled in on the database page.
 */
export default function SendToModDatabase({ ticketId, title, modLink }: { ticketId: string; title: string; modLink?: string }) {
    const [state, setState] = useState<{ canEdit: boolean; entryId: string | null } | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        fetch(`/api/mods?ticketId=${ticketId}`)
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (live && d) setState({ canEdit: !!d.canEdit, entryId: d.entry?.id ?? null }) })
            .catch(() => { })
        return () => { live = false }
    }, [ticketId])

    if (!state) return null

    if (state.entryId) {
        return <a href='/dashboard/unit/mods' style={{ color: 'rgba(0,195,255,0.8)' }}>In the mod database</a>
    }
    if (!state.canEdit) return null

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
                type='button'
                disabled={busy}
                onClick={async () => {
                    setBusy(true)
                    setError(null)
                    const res = await fetch('/api/mods', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: title, workshopUrl: modLink ?? '', status: 'testing', sourceTicketId: ticketId }),
                    }).catch(() => null)
                    setBusy(false)
                    const info = await res?.json().catch(() => null)
                    if (!res?.ok) { setError(info?.error ?? 'Could not add it. Try again.'); return }
                    setState({ canEdit: true, entryId: info.id })
                }}
                style={{
                    padding: '5px 12px', background: 'rgba(0,195,255,0.08)', border: '1px solid rgba(0,195,255,0.3)', color: 'rgba(0,195,255,0.85)',
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer',
                }}
            >
                {busy ? 'Adding…' : 'Send to mod database'}
            </button>
            {error && <span style={{ color: '#ff8a80', fontSize: '0.75rem' }}>{error}</span>}
        </span>
    )
}
