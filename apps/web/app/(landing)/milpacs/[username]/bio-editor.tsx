'use client'

import { useState } from 'react'

export function BiographyEditor({ initial, accent }: { initial: string | null; accent: string }) {
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(initial ?? '')
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSave() {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch('/api/me', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: value }),
            })
            if (!res.ok) throw new Error('Save failed')
            setSaved(true)
            setEditing(false)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    function handleCancel() {
        setValue(initial ?? '')
        setEditing(false)
        setError(null)
    }

    if (editing) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                    value={value}
                    onChange={e => setValue(e.target.value.slice(0, 2000))}
                    rows={5}
                    autoFocus
                    maxLength={2000}
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${accent}40`,
                        color: 'rgba(237,237,237,0.8)',
                        padding: '10px 12px',
                        fontSize: '0.9rem',
                        lineHeight: 1.8,
                        resize: 'vertical',
                        outline: 'none',
                        fontFamily: 'inherit',
                    }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '5px 16px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            background: `${accent}22`,
                            border: `1px solid ${accent}60`,
                            color: `${accent}ee`,
                        }}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                        onClick={handleCancel}
                        style={{
                            padding: '5px 16px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(237,237,237,0.4)',
                        }}
                    >
                        Cancel
                    </button>
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontFamily: 'monospace', color: value.length >= 2000 ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.2)' }}>
                        {value.length}/2000
                    </span>
                    {error && <span style={{ fontSize: '0.75rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                {value ? (
                    <p style={{ margin: 0, lineHeight: 1.8, color: 'rgba(237,237,237,0.65)', fontSize: '0.9rem', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                        {value}
                    </p>
                ) : (
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic', letterSpacing: '0.05em' }}>
                        No biography on record.
                    </p>
                )}
                <button
                    onClick={() => setEditing(true)}
                    style={{
                        flexShrink: 0,
                        padding: '4px 12px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(237,237,237,0.35)',
                    }}
                >
                    Edit
                </button>
            </div>
            {saved && (
                <span style={{ fontSize: '0.75rem', color: 'rgba(80,200,80,0.7)' }}>Saved.</span>
            )}
        </div>
    )
}
