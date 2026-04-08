'use client'

import { useState } from 'react'

export default function ZeusNotesPanel({ operationId, initialNotes }: { operationId: string; initialNotes: string }) {
    const [notes, setNotes] = useState(initialNotes)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(initialNotes)
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        setSaving(true)
        try {
            await fetch('/api/operations/zeus-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: operationId, notes: draft }),
            })
            setNotes(draft)
            setEditing(false)
        } finally {
            setSaving(false)
        }
    }

    function handleCancel() {
        setDraft(notes)
        setEditing(false)
    }

    return (
        <div style={{
                border: '1px solid rgba(0,195,255,0.2)',
                borderTop: '2px solid rgba(0,195,255,0.6)',
                background: 'rgba(0,195,255,0.03)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(0,195,255,0.12)',
                    background: 'rgba(0,195,255,0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 6, height: 6, background: 'rgba(0,195,255,0.8)', flexShrink: 0, boxShadow: '0 0 6px rgba(0,195,255,0.8)' }} />
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(0,195,255,0.8)', textShadow: '0 0 6px rgba(0,195,255,0.4)' }}>
                            Zeus Notes
                        </span>
                        <span style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(0,195,255,0.35)' }}>
                            // J6 Only
                        </span>
                    </div>
                    {!editing && (
                        <button
                            onClick={() => { setDraft(notes); setEditing(true) }}
                            style={{
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                padding: '4px 12px', cursor: 'pointer',
                                background: 'none',
                                border: '1px solid rgba(0,195,255,0.3)',
                                color: 'rgba(0,195,255,0.7)',
                                transition: 'border-color 0.15s, color 0.15s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,195,255,0.7)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,195,255,1)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,195,255,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,195,255,0.7)' }}
                        >
                            Edit
                        </button>
                    )}
                </div>

                {/* Body */}
                <div style={{ padding: '14px 16px' }}>
                    {editing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <textarea
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                rows={6}
                                placeholder='Enter zeus notes for this operation...'
                                style={{
                                    width: '100%',
                                    background: 'rgba(0,195,255,0.04)',
                                    border: '1px solid rgba(0,195,255,0.25)',
                                    color: '#ededed',
                                    fontSize: '0.82rem',
                                    lineHeight: 1.6,
                                    padding: '10px 12px',
                                    resize: 'vertical',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(0,195,255,0.6)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(0,195,255,0.25)')}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{
                                        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                        padding: '6px 18px', cursor: saving ? 'not-allowed' : 'pointer',
                                        background: saving ? 'rgba(0,195,255,0.1)' : 'rgba(0,195,255,0.15)',
                                        border: '1px solid rgba(0,195,255,0.4)',
                                        color: saving ? 'rgba(0,195,255,0.4)' : 'rgba(0,195,255,0.9)',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                    onClick={handleCancel}
                                    disabled={saving}
                                    style={{
                                        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                        padding: '6px 18px', cursor: 'pointer',
                                        background: 'none',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(237,237,237,0.4)',
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : notes ? (
                        <p style={{ fontSize: '0.82rem', lineHeight: 1.7, color: 'rgba(237,237,237,0.8)', whiteSpace: 'pre-wrap', margin: 0 }}>
                            {notes}
                        </p>
                    ) : (
                        <p style={{ fontSize: '0.78rem', color: 'rgba(0,195,255,0.3)', margin: 0, fontStyle: 'italic' }}>
                            No zeus notes recorded. Click Edit to add notes.
                        </p>
                    )}
                </div>
        </div>
    )
}
