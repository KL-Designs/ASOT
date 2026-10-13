'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import s from './profile.module.css'

/**
 * A member's pending biography change, for the people who can approve it.
 *
 * Mounted on every milpac for every signed-in visitor, and renders nothing for
 * nearly all of them: the API answers `{ pending: null }` both when there is no
 * change waiting and when the viewer is not somebody who may decide it, so the
 * page cannot be used to find out whether a member has an edit in the queue.
 *
 * Shown beside the live biography rather than on a separate approvals screen,
 * because the judgement is a comparison — is the new text all right to replace
 * the old on this page — and this is the page.
 */
export function BioApprovalPanel({ memberId, memberName }: { memberId: string; memberName: string }) {
    const router = useRouter()
    const [pending, setPending] = useState<{ content: string; current: string } | null>(null)
    const [reason, setReason] = useState('')
    const [rejecting, setRejecting] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        fetch(`/api/milpac/bio-approvals?member=${encodeURIComponent(memberId)}`, { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (live) setPending(d?.pending ?? null) })
            .catch(() => { /* nothing to decide is a fine thing to conclude */ })
        return () => { live = false }
    }, [memberId])

    if (!pending) return null

    async function decide(action: 'approve' | 'reject') {
        setBusy(true)
        setError(null)
        const res = await fetch('/api/milpac/bio-approvals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, action, reason }),
        }).catch(() => null)
        const data = await res?.json().catch(() => null)
        setBusy(false)
        if (!res?.ok) { setError(data?.error ?? 'That could not be saved. Try again.'); return }
        setPending(null)
        // The biography on this page is server-rendered; an approval changes it.
        router.refresh()
    }

    const btn = (tone: 'good' | 'bad' | 'plain'): React.CSSProperties => ({
        padding: '5px 14px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        cursor: busy ? 'not-allowed' : 'pointer',
        background: tone === 'good' ? 'rgba(80,200,120,0.14)' : tone === 'bad' ? 'rgba(219,0,29,0.12)' : 'transparent',
        border: `1px solid ${tone === 'good' ? 'rgba(80,200,120,0.45)' : tone === 'bad' ? 'rgba(219,0,29,0.45)' : 'rgba(255,255,255,0.12)'}`,
        color: tone === 'good' ? 'rgba(120,225,150,0.95)' : tone === 'bad' ? 'rgba(255,130,120,0.95)' : 'rgba(237,237,237,0.5)',
    })

    return (
        <div style={{ border: '1px solid rgba(212,160,58,0.45)', background: 'rgba(212,160,58,0.07)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,160,58,0.95)' }}>
                Biography change awaiting your approval
            </div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)' }}>
                {memberName} wants to replace the biography on this page with:
            </div>
            <p className={s.bio}>{pending.content || <i>(nothing: they are removing their biography)</i>}</p>

            {rejecting && (
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value.slice(0, 500))}
                    placeholder='What needs changing? The member is shown this.'
                    rows={2}
                    autoFocus
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(237,237,237,0.85)', fontFamily: 'inherit', fontSize: '0.82rem', lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
                />
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {rejecting ? (
                    <>
                        <button type='button' disabled={busy || !reason.trim()} onClick={() => decide('reject')} style={{ ...btn('bad'), opacity: reason.trim() ? 1 : 0.5 }}>Send back</button>
                        <button type='button' disabled={busy} onClick={() => { setRejecting(false); setReason('') }} style={btn('plain')}>Cancel</button>
                    </>
                ) : (
                    <>
                        <button type='button' disabled={busy} onClick={() => decide('approve')} style={btn('good')}>{busy ? 'Saving…' : 'Approve'}</button>
                        <button type='button' disabled={busy} onClick={() => setRejecting(true)} style={btn('bad')}>Send back</button>
                    </>
                )}
                {error && <span style={{ fontSize: '0.75rem', color: 'rgba(255,130,120,0.95)' }}>{error}</span>}
            </div>
        </div>
    )
}
