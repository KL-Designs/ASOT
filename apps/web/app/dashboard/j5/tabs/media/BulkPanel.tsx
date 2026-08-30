'use client'

import { useState } from 'react'
import { Autocomplete, Button, Chip, MenuItem, TextField, Typography } from '@mui/material'

import s from '@/styles/media-console.module.css'

/**
 * One action over a selection — the cleanup path for the ~1,157 files the
 * migration could not date.
 *
 * Every destructive or file-moving action states its consequence in plain
 * terms before it runs. A bulk move relocates files on disk; discovering that
 * after the fact is not acceptable for an operation over sixty photographs.
 *
 * `onDone` carries whether anything failed, rather than being a bare
 * callback: the bulk route's `failed` array (one `{ id, error }` per item the
 * loop could not finish) had no UI consumer before this panel, and a reviewer
 * who moved sixty items of which two failed needs the selection to survive so
 * they can see and retry just those two — clearing it the way a clean run
 * does would throw that away.
 */

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.8rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

type Operation = { id: string, title: string, date: string | null }
type Failure = { id: string, error: string }

export default function BulkPanel({ ids, operations, tags, onDone }: {
    ids: string[]
    operations: Operation[]
    tags: { slug: string, label: string }[]
    onDone: (hadFailures: boolean) => void
}) {
    const [operationId, setOperationId] = useState('')
    const [chosen, setChosen] = useState<string[]>([])
    const [authorName, setAuthorName] = useState('')
    const [busy, setBusy] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [result, setResult] = useState<string | null>(null)
    const [failed, setFailed] = useState<Failure[]>([])
    const [error, setError] = useState<string | null>(null)

    const target = operations.find(o => o.id === operationId) ?? null

    async function run(action: string, extra: Record<string, unknown>) {
        setBusy(true)
        setResult(null)
        setError(null)
        setFailed([])
        try {
            const res = await fetch('/api/gallery/admin/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, action, ...extra }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                // The server's exact message, not a generic one — same idiom
                // as Inspector.tsx's save(): a 400 here can mean "no such
                // operation", which changes what the reviewer does next.
                setError(typeof data.error === 'string' ? data.error : 'Failed.')
                return
            }

            // Render every failure rather than just the count — a reviewer
            // who moved sixty items of which two failed needs to know WHICH
            // two, not just that two exist.
            const itemFailures: Failure[] = Array.isArray(data.failed) ? data.failed : []
            setFailed(itemFailures)
            const changed = typeof data.changed === 'number' ? data.changed : 0
            setResult(itemFailures.length
                ? `${changed} changed, ${itemFailures.length} failed.`
                : `${changed} changed.`)
            onDone(itemFailures.length > 0)
        } catch {
            // fetch itself rejected (offline, DNS, etc.) — the reviewer still
            // needs to see that nothing happened, not silence.
            setError('Could not reach the server.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <aside className={s.insp}>
            <div className={s.inspHead}>
                <span>Bulk edit</span>
                <span style={{ marginLeft: 'auto', color: 'var(--red-hi)' }}>{ids.length} items</span>
            </div>

            <TextField size='small' select label='Move to operation' value={operationId} onChange={e => setOperationId(e.target.value)} sx={inputSx}>
                <MenuItem value=''>Choose an operation…</MenuItem>
                <MenuItem value='unknown'>Unknown</MenuItem>
                {operations.map(op => <MenuItem key={op.id} value={op.id}>{op.title}</MenuItem>)}
            </TextField>

            {operationId && (
                <div className={s.consequence}>
                    {operationId === 'unknown'
                        ? <>Moves <b>{ids.length}</b> files into <b>Unknown</b> on disk and clears their dates.</>
                        : <>Moves <b>{ids.length}</b> files into <b>{target?.title}</b>&rsquo;s folder on disk
                            {target?.date ? <> and dates them <b>{new Date(target.date).toLocaleDateString('en-AU')}</b></> : null}.</>}
                </div>
            )}

            <Button size='small' variant='outlined' disabled={!operationId || busy} onClick={() => run('move', { operationId })} sx={{ fontSize: '0.7rem' }}>
                Apply to {ids.length}
            </Button>

            <Autocomplete
                multiple
                size='small'
                options={tags.map(t => t.slug)}
                value={chosen}
                onChange={(_, value) => setChosen(value)}
                getOptionLabel={slug => tags.find(t => t.slug === slug)?.label ?? slug}
                renderTags={(value, getTagProps) => value.map((slug, index) => (
                    <Chip {...getTagProps({ index })} key={slug} size='small' label={tags.find(t => t.slug === slug)?.label ?? slug} />
                ))}
                renderInput={p => <TextField {...p} label='Tags' sx={inputSx} />}
            />
            <div style={{ display: 'flex', gap: 6 }}>
                <Button size='small' disabled={!chosen.length || busy} onClick={() => run('addTags', { tags: chosen })} sx={{ fontSize: '0.7rem' }}>Add tags</Button>
                <Button size='small' disabled={!chosen.length || busy} onClick={() => run('removeTags', { tags: chosen })} sx={{ fontSize: '0.7rem' }}>Remove tags</Button>
            </div>

            <TextField size='small' label='Set author' value={authorName} onChange={e => setAuthorName(e.target.value)} sx={inputSx} />
            <Button size='small' disabled={busy} onClick={() => run('setAuthor', { authorName })} sx={{ fontSize: '0.7rem' }}>
                {authorName.trim() ? `Set author on ${ids.length}` : `Clear author on ${ids.length}`}
            </Button>

            {result && <Typography sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.62)' }}>{result}</Typography>}
            {error && <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)' }}>{error}</Typography>}

            {failed.length > 0 && (
                <div className={s.diskBlock}>
                    <div className={s.inspHead}><span>Failed</span></div>
                    {failed.map(f => (
                        <div key={f.id} className={s.path} style={{ marginBottom: 4 }}>{f.id} — {f.error}</div>
                    ))}
                </div>
            )}

            <div className={s.actions}>
                {confirmDelete ? (
                    <>
                        <Button size='small' color='error' disabled={busy} onClick={() => run('delete', {})} sx={{ fontSize: '0.7rem' }}>
                            Delete {ids.length} for good
                        </Button>
                        <Button size='small' disabled={busy} onClick={() => setConfirmDelete(false)} sx={{ fontSize: '0.7rem' }}>Cancel</Button>
                    </>
                ) : (
                    <Button size='small' color='error' disabled={busy} onClick={() => setConfirmDelete(true)} sx={{ fontSize: '0.7rem' }}>
                        Delete {ids.length}
                    </Button>
                )}
            </div>
        </aside>
    )
}
