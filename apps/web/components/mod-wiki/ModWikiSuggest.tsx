'use client'

import React, { useState } from 'react'
import { TextField, Select, MenuItem, FormControl, InputLabel, Button, Alert } from '@mui/material'
import type { ModWikiArticleView } from '@/lib/mod-wiki/search'

interface Props {
    article: ModWikiArticleView
    onClose: () => void
}

export function ModWikiSuggest({ article, onClose }: Props) {
    const [kind, setKind] = useState<'edit' | 'bug'>('edit')
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)

    async function submit() {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch('/api/mod-wiki/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kind,
                    articleSlug: kind === 'edit' ? article.slug : undefined,
                    baseVersion: kind === 'edit' ? article.version_num : undefined,
                    title: title || (kind === 'bug' ? `Bug report: ${article.title}` : article.title),
                    body,
                    note: note || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Failed to submit.'); return }
            setDone(true)
        } finally {
            setSaving(false)
        }
    }

    if (done) return (
        <div style={{ padding: '12px 16px', background: 'rgba(47,125,50,0.1)', borderLeft: '3px solid #2f7d32', borderRadius: '0 6px 6px 0' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Suggestion sent</div>
            <div style={{ fontSize: '0.88em', color: 'var(--fg-2)', marginBottom: 10 }}>J7 and J4 will review it. You'll receive a notification when it's processed.</div>
            <button onClick={onClose} style={{ fontSize: '0.85em', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)' }}>Close</button>
        </div>
    )

    return (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 6, padding: 16, background: 'var(--ink-2)' }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Send a suggestion</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['edit', 'bug'] as const).map(k => (
                    <button
                        key={k}
                        onClick={() => setKind(k)}
                        style={{
                            padding: '4px 14px', fontSize: '0.85em', borderRadius: 4, cursor: 'pointer',
                            background: kind === k ? 'var(--accent)' : 'none',
                            color: kind === k ? '#fff' : 'var(--fg-2)',
                            border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--line-2)'}`,
                        }}
                    >
                        {k === 'edit' ? 'Suggest edit' : 'Report bug'}
                    </button>
                ))}
            </div>

            {kind === 'edit' && (
                <TextField
                    label='Proposed title'
                    size='small'
                    fullWidth
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    sx={{ mb: 1.5 }}
                    placeholder={article.title}
                />
            )}

            <TextField
                label={kind === 'edit' ? 'Proposed article text (GFM Markdown)' : 'Describe what went wrong'}
                multiline
                rows={kind === 'edit' ? 8 : 4}
                size='small'
                fullWidth
                value={body}
                onChange={e => setBody(e.target.value)}
                sx={{ mb: 1.5 }}
                placeholder={kind === 'edit' ? article.body.slice(0, 200) + '…' : 'What happened, and what should happen instead?'}
            />

            <TextField
                label='Why (optional)'
                size='small'
                fullWidth
                value={note}
                onChange={e => setNote(e.target.value)}
                sx={{ mb: 1.5 }}
                placeholder='Any context that helps the reviewer'
            />

            {error && <Alert severity='error' sx={{ mb: 1.5 }}>{error}</Alert>}

            <div style={{ display: 'flex', gap: 8 }}>
                <Button variant='contained' size='small' onClick={submit} disabled={saving || !body.trim()}>
                    {saving ? 'Sending…' : 'Send'}
                </Button>
                <Button variant='text' size='small' onClick={onClose} disabled={saving}>Cancel</Button>
            </div>
        </div>
    )
}
