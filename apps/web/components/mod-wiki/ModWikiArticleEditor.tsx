'use client'

import React, { useState } from 'react'
import { TextField, Select, MenuItem, FormControl, InputLabel, Button, Alert, Chip } from '@mui/material'
import { ModWikiMarkdown } from './ModWikiMarkdown'
import type { ModWikiArticleView } from '@/lib/mod-wiki/search'
import { MOD_WIKI_CATEGORIES } from '@/lib/mod-wiki/search'

interface Props {
    article: ModWikiArticleView
    onSave: (updated: ModWikiArticleView) => void
    onCancel: () => void
    isNew?: boolean
    slug?: string
}

export function ModWikiArticleEditor({ article, onSave, onCancel, isNew = false, slug: slugProp }: Props) {
    const [title, setTitle] = useState(article.title)
    const [category, setCategory] = useState<ModWikiCategory>(article.category)
    const [summary, setSummary] = useState(article.summary)
    const [body, setBody] = useState(article.body)
    const [pbosRaw, setPbosRaw] = useState(article.pbos.join(', '))
    const [requiredModsRaw, setRequiredModsRaw] = useState(article.requiredMods.join(', '))
    const [version, setVersion] = useState(article.version ?? '')
    const [keywordsRaw, setKeywordsRaw] = useState(article.keywords.join(', '))
    const [hidden, setHidden] = useState(article.hidden ?? false)
    const [preview, setPreview] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const slug = slugProp ?? article.slug

    async function save() {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/mod-wiki/articles/${slug}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title, category, summary, body,
                    pbos: pbosRaw.split(',').map(s => s.trim()).filter(Boolean),
                    requiredMods: requiredModsRaw.split(',').map(s => s.trim()).filter(Boolean),
                    version: version || undefined,
                    keywords: keywordsRaw.split(',').map(s => s.trim()).filter(Boolean),
                    hidden: hidden || undefined,
                    baseVersion: article.version_num,
                    ...(isNew ? { create: true } : {}),
                }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Save failed.'); return }
            onSave(data.article)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: '1.2em' }}>{isNew ? 'New article' : `Editing: ${article.title}`}</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setPreview(p => !p)} style={{ padding: '4px 12px', fontSize: '0.85em', background: 'none', border: '1px solid var(--line-2)', borderRadius: 4, cursor: 'pointer', color: 'var(--fg-2)' }}>
                        {preview ? 'Edit' : 'Preview'}
                    </button>
                    <Button variant='contained' size='small' onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button variant='text' size='small' onClick={onCancel} disabled={saving}>Cancel</Button>
                </div>
            </div>

            {error && <Alert severity='error' sx={{ mb: 2 }}>{error}</Alert>}

            {preview ? (
                <div style={{ border: '1px solid var(--line-1)', borderRadius: 6, padding: 20, background: 'var(--bg)' }}>
                    <ModWikiMarkdown body={body} />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12 }}>
                        <TextField label='Title' size='small' fullWidth value={title} onChange={e => setTitle(e.target.value)} />
                        <FormControl size='small' fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select label='Category' value={category} onChange={e => setCategory(e.target.value as ModWikiCategory)}>
                                {MOD_WIKI_CATEGORIES.map(c => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </div>

                    <TextField label='Summary (one line)' size='small' fullWidth value={summary} onChange={e => setSummary(e.target.value)} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <TextField label='PBOs (comma separated)' size='small' fullWidth value={pbosRaw} onChange={e => setPbosRaw(e.target.value)} placeholder='ASOT_CBRN, ASOT_Weapons' />
                        <TextField label='Required mods (comma separated)' size='small' fullWidth value={requiredModsRaw} onChange={e => setRequiredModsRaw(e.target.value)} placeholder='CBA_A3, ACE3' />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <TextField label='Version' size='small' fullWidth value={version} onChange={e => setVersion(e.target.value)} placeholder='Build G7 · November 2026' />
                        <TextField label='Keywords (comma separated)' size='small' fullWidth value={keywordsRaw} onChange={e => setKeywordsRaw(e.target.value)} />
                    </div>

                    <TextField
                        label='Article body (GFM Markdown)'
                        multiline
                        rows={24}
                        size='small'
                        fullWidth
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        sx={{ fontFamily: 'monospace', '& textarea': { fontFamily: 'monospace', fontSize: '0.88em' } }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88em', cursor: 'pointer' }}>
                            <input type='checkbox' checked={hidden} onChange={e => setHidden(e.target.checked)} />
                            Hidden from members
                        </label>
                        {article.updatedByName && (
                            <span style={{ color: 'var(--fg-3)', fontSize: '0.82em' }}>
                                Last edited by {article.updatedByName}
                                {article.updatedAt ? ` · ${new Date(article.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
