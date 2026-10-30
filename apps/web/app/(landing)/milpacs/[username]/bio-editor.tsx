'use client'

import { useState } from 'react'
import { BIO_LEVEL_LABEL, BIO_MAX_LENGTH, type BioApprovalLevel } from '@/lib/military/bio-approval'
import s from './profile.module.css'

/**
 * The Personnel Summary, for the member it belongs to.
 *
 * The read state deliberately borrows `.bio` — the very class the public view
 * renders with — rather than restating it inline. It used to restate it, and
 * the restatement left out `white-space: pre-wrap`: a member's own profile
 * collapsed their paragraphs into one block of text while everybody else saw
 * them laid out properly.
 *
 * An edit no longer publishes on save. It is submitted, and what everybody
 * else sees stays as it was until the member's chain of command approves it —
 * so this shows three things where it used to show one: the live biography,
 * the change that is waiting (and on whom), and, if the last one was sent
 * back, why.
 */
export function BiographyEditor({ initial, accent, pending: initialPending, rejected: initialRejected }: {
    initial: string | null
    accent: string
    pending?: { content: string; level: BioApprovalLevel } | null
    rejected?: { reason: string; byName: string } | null
}) {
    const live = initial ?? ''
    const [pending, setPending] = useState(initialPending ?? null)
    const [rejected, setRejected] = useState(initialRejected ?? null)
    const [editing, setEditing] = useState(false)
    // Editing picks up from the waiting change when there is one — a member
    // fixing a typo in what they submitted should not start from the old text.
    const [value, setValue] = useState(initialPending?.content ?? live)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function submit(content: string) {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch('/api/me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error ?? 'Save failed')
            setPending(data?.pending ? { content: content.trim(), level: data.level } : null)
            setRejected(null)
            setEditing(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed')
        } finally {
            setSaving(false)
        }
    }

    function handleCancel() {
        setValue(pending?.content ?? live)
        setEditing(false)
        setError(null)
    }

    /** Submitting the live text back is how a waiting change is withdrawn. */
    async function withdraw() {
        await submit(live)
        setValue(live)
    }

    const button = (primary: boolean): React.CSSProperties => ({
        padding: '5px 16px',
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: saving ? 'not-allowed' : 'pointer',
        background: primary ? `${accent}22` : 'transparent',
        border: `1px solid ${primary ? `${accent}60` : 'rgba(255,255,255,0.1)'}`,
        color: primary ? `${accent}ee` : 'rgba(237,237,237,0.4)',
    })

    if (editing) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                    value={value}
                    onChange={e => setValue(e.target.value.slice(0, BIO_MAX_LENGTH))}
                    rows={5}
                    autoFocus
                    maxLength={BIO_MAX_LENGTH}
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${accent}40`,
                        color: 'rgba(237,237,237,0.8)',
                        padding: '10px 12px',
                        fontSize: '14px',
                        lineHeight: 1.75,
                        resize: 'vertical',
                        outline: 'none',
                        fontFamily: 'inherit',
                    }}
                />
                <p style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.5, color: 'rgba(237,237,237,0.4)' }}>
                    Changes are checked by your chain of command before they appear on your milpac.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => submit(value)} disabled={saving} style={button(true)}>
                        {saving ? 'Submitting…' : 'Submit for approval'}
                    </button>
                    <button onClick={handleCancel} disabled={saving} style={button(false)}>Cancel</button>
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontFamily: 'monospace', color: value.length >= BIO_MAX_LENGTH ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.25)' }}>
                        {value.length}/{BIO_MAX_LENGTH}
                    </span>
                    {error && <span style={{ fontSize: '0.75rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                {live ? (
                    <p className={s.bio}>{live}</p>
                ) : (
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic', letterSpacing: '0.05em' }}>
                        No biography on record.
                    </p>
                )}
                <button onClick={() => setEditing(true)} style={{ ...button(false), flexShrink: 0, padding: '4px 12px', fontSize: '0.65rem', letterSpacing: '0.12em' }}>
                    Edit
                </button>
            </div>

            {pending && (
                <div style={{ border: '1px solid rgba(212,160,58,0.4)', background: 'rgba(212,160,58,0.06)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,160,58,0.9)' }}>
                        Change awaiting approval by {BIO_LEVEL_LABEL[pending.level]}
                    </div>
                    <p className={s.bio} style={{ opacity: 0.8 }}>{pending.content || <i>(biography removed)</i>}</p>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                        Only you and your approvers can see this. Everybody else still sees the version above.
                    </div>
                    <div>
                        <button onClick={withdraw} disabled={saving} style={{ ...button(false), padding: '4px 12px', fontSize: '0.65rem' }}>
                            {saving ? 'Withdrawing…' : 'Withdraw change'}
                        </button>
                    </div>
                </div>
            )}

            {rejected && !pending && (
                <div style={{ border: '1px solid rgba(219,0,29,0.35)', background: 'rgba(219,0,29,0.06)', padding: '10px 12px', fontSize: '0.78rem', lineHeight: 1.6, color: 'rgba(237,237,237,0.7)' }}>
                    <b style={{ color: 'rgba(255,140,130,0.95)' }}>Your last change was sent back by {rejected.byName}.</b> {rejected.reason}
                </div>
            )}

            {error && <span style={{ fontSize: '0.75rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}
        </div>
    )
}
