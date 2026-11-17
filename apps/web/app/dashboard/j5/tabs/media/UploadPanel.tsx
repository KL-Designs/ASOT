'use client'

import { useEffect, useRef, useState } from 'react'
import { LinearProgress, Typography } from '@mui/material'

import { Field } from '@/app/dashboard/j5/controls/Field'
import { Select, type SelectOption } from '@/app/dashboard/j5/controls/Select'
import { TagPicker } from '@/app/dashboard/j5/controls/TagPicker'
import { ACCEPT_ATTRIBUTE, checkFile } from '@/lib/gallery/limits'
import { runUploads, sendOverXhrTo, type UploadJob } from '@/app/(landing)/gallery/submit/upload'
import s from '@/styles/media-console.module.css'
import c from '@/styles/j5-controls.module.css'

type Operation = { id: string, title: string, date: string | null }

/** Where one file is, from picked to live. `done` and `failed` are terminal. */
type Row = {
    localId: string
    file: File
    phase: 'ready' | 'uploading' | 'processing' | 'done' | 'failed'
    progress: number
    serverId?: string
    error?: string
}

// How long to keep polling for the queue to publish. A five-minute clip can
// take a few minutes to encode, and there may be others ahead of it.
const POLL_MS = 2500
const POLL_LIMIT_MS = 15 * 60 * 1000

/**
 * J5's direct upload: files straight into the archive, no review.
 *
 * Takes the inspector column while open, the same slot the bulk panel uses —
 * it is another thing done to the library, and a modal over the grid would
 * hide the tiles the reviewer is about to see appear.
 *
 * Same plumbing as the member submit page (runUploads over XHR, two at a time,
 * a bar per file, the same limits checked before a byte moves), pointed at
 * /api/gallery/admin/upload. The server publishes each item once processed;
 * this polls the submit page's own status route to say when.
 */
export default function UploadPanel({ operations, tags, onClose, onFinished }: {
    operations: Operation[]
    tags: { slug: string, label: string }[]
    onClose: () => void
    /** Called once every file has settled, with a one-line summary. */
    onFinished: (summary: string) => void
}) {
    const [rows, setRows] = useState<Row[]>([])
    const [operationId, setOperationId] = useState('')
    const [caption, setCaption] = useState('')
    const [chosenTags, setChosenTags] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const batchRef = useRef<string>('')
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // The poll runs in a timer, outside render, so it reads the latest rows
    // from here rather than from a stale closure.
    const rowsRef = useRef<Row[]>([])
    useEffect(() => { rowsRef.current = rows }, [rows])

    useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

    const operationOptions: SelectOption[] = [
        { value: '', label: 'Unknown' },
        ...operations.map(op => ({
            value: op.id,
            label: op.title,
            note: op.date ? String(new Date(op.date).getFullYear()) : undefined,
        })),
    ]

    const patch = (localId: string, change: Partial<Row>) =>
        setRows(prev => prev.map(r => (r.localId === localId ? { ...r, ...change } : r)))

    function addFiles(list: FileList | File[] | null) {
        if (!list) return
        const added: Row[] = Array.from(list).map(file => {
            const failure = checkFile({ mime: file.type, bytes: file.size })
            return {
                localId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                file,
                phase: failure ? 'failed' as const : 'ready' as const,
                progress: 0,
                error: failure?.message,
            }
        })
        setRows(prev => [...prev, ...added])
    }

    async function start() {
        const ready = rows.filter(r => r.phase === 'ready')
        if (!ready.length) return
        setBusy(true)

        const batchId = `j5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
        batchRef.current = batchId

        const jobs: UploadJob[] = ready.map(r => {
            const body = new FormData()
            body.set('file', r.file)
            body.set('batchId', batchId)
            if (operationId) body.set('operationId', operationId)
            if (caption.trim()) body.set('caption', caption.trim())
            if (chosenTags.length) body.set('tags', JSON.stringify(chosenTags))
            return { localId: r.localId, body }
        })

        // runUploads reports by localId but resolves server ids in completion
        // order, so the id is captured per job in the sender instead.
        const send = sendOverXhrTo('/api/gallery/admin/upload')
        await runUploads({
            jobs,
            concurrency: 2,
            send: async (job, onProgress) => {
                const out = await send(job, onProgress)
                patch(job.localId, { serverId: out.id })
                return out
            },
            onChange: (localId, state) => patch(localId, { phase: state.phase === 'queued' ? 'uploading' : state.phase, progress: state.progress, error: state.error }),
        })

        poll(Date.now())
    }

    function poll(startedAt: number) {
        pollRef.current = setTimeout(async () => {
            let items: { id: string, status: string, processingError: string | null }[] = []
            try {
                const res = await fetch(`/api/gallery/submissions/status?batch=${encodeURIComponent(batchRef.current)}`)
                if (res.ok) items = (await res.json()).items ?? []
            } catch { /* try again next tick */ }

            const next = rowsRef.current.map(r => {
                if (r.phase !== 'processing' || !r.serverId) return r
                const it = items.find(i => i.id === r.serverId)
                if (it?.status === 'live') return { ...r, phase: 'done' as const }
                // A plain `pending` is the moment between processed and
                // published; one carrying an error is where it stays.
                if (it?.status === 'pending' && it.processingError) {
                    return { ...r, phase: 'failed' as const, error: `${it.processingError} It is in the review queue.` }
                }
                return r
            })
            rowsRef.current = next
            setRows(next)

            const waiting = next.filter(r => r.phase === 'processing').length
            if (waiting > 0 && Date.now() - startedAt < POLL_LIMIT_MS) {
                poll(startedAt)
                return
            }
            finish(next)
        }, POLL_MS)
    }

    function finish(final: Row[]) {
        setBusy(false)
        const done = final.filter(r => r.phase === 'done').length
        const failed = final.filter(r => r.phase === 'failed').length
        const still = final.filter(r => r.phase === 'processing').length
        const parts = [`${done} uploaded and published`]
        if (failed) parts.push(`${failed} failed`)
        if (still) parts.push(`${still} still processing`)
        onFinished(`${parts.join(', ')}.`)
    }

    const readyCount = rows.filter(r => r.phase === 'ready').length
    const settled = rows.length > 0 && rows.every(r => r.phase === 'done' || r.phase === 'failed')

    return (
        <aside className={s.insp}>
            <div className={s.inspHead}>
                <span>Upload media</span>
                <button type='button' className={`${c.btn} ${c.btnGhost}`} style={{ marginLeft: 'auto' }} disabled={busy} onClick={onClose}>
                    Close
                </button>
            </div>

            <div
                role='button'
                tabIndex={0}
                onClick={() => !busy && inputRef.current?.click()}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) inputRef.current?.click() }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (!busy) addFiles(e.dataTransfer.files) }}
                style={{
                    border: `1px dashed ${dragOver ? 'var(--red-hi)' : 'rgba(237,237,237,0.25)'}`,
                    borderRadius: 4,
                    padding: '18px 12px',
                    textAlign: 'center',
                    cursor: busy ? 'default' : 'pointer',
                    fontSize: '0.78rem',
                    color: 'rgba(237,237,237,0.7)',
                }}
            >
                Drop photos or video here, or click to choose.
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)', marginTop: 4 }}>
                    Photos up to 20 MB, video up to 50 MB and 5 minutes.
                </div>
                <input
                    ref={inputRef}
                    type='file'
                    multiple
                    accept={ACCEPT_ATTRIBUTE}
                    hidden
                    onChange={e => { addFiles(e.target.files); e.target.value = '' }}
                />
            </div>

            <Select label='Operation' searchable value={operationId} onChange={setOperationId} options={operationOptions} disabled={busy} />
            <Field label='Caption (optional, applies to every file)' value={caption} onChange={setCaption} disabled={busy} />
            <TagPicker
                label='Tags'
                value={chosenTags}
                onChange={setChosenTags}
                options={tags.map(t => t.slug)}
                labelFor={slug => tags.find(t => t.slug === slug)?.label ?? slug}
                disabled={busy}
            />

            <div className={s.consequence}>
                These go straight onto the public gallery once processed, filed under the operation above. They skip the review queue.
            </div>

            {rows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rows.map(r => (
                        <div key={r.localId} style={{ fontSize: '0.74rem' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={r.file.name}>{r.file.name}</span>
                                <span style={{ color: r.phase === 'failed' ? 'var(--red-hi)' : r.phase === 'done' ? 'var(--live)' : 'rgba(237,237,237,0.5)', flexShrink: 0 }}>
                                    {r.phase === 'ready' ? 'Ready'
                                        : r.phase === 'uploading' ? `${Math.round(r.progress * 100)}%`
                                            : r.phase === 'processing' ? 'Processing…'
                                                : r.phase === 'done' ? 'Live' : 'Failed'}
                                </span>
                                {r.phase === 'ready' && !busy && (
                                    <button type='button' className={`${c.btn} ${c.btnGhost}`} onClick={() => setRows(prev => prev.filter(x => x.localId !== r.localId))}>
                                        Remove
                                    </button>
                                )}
                            </div>
                            {(r.phase === 'uploading' || r.phase === 'processing') && (
                                <LinearProgress
                                    variant={r.phase === 'processing' ? 'indeterminate' : 'determinate'}
                                    value={r.progress * 100}
                                    sx={{ mt: 0.5, backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }}
                                />
                            )}
                            {r.error && <Typography sx={{ fontSize: '0.7rem', color: 'var(--red-hi)' }}>{r.error}</Typography>}
                        </div>
                    ))}
                </div>
            )}

            <div className={s.actions}>
                {settled && !busy && (
                    <button type='button' className={`${c.btn} ${c.btnGhost}`} onClick={() => setRows([])}>
                        Clear list
                    </button>
                )}
                <button type='button' className={`${c.btn} ${c.btnPrimary}`} disabled={busy || readyCount === 0} onClick={start}>
                    {busy ? 'Uploading…' : readyCount ? `Upload ${readyCount} file${readyCount === 1 ? '' : 's'}` : 'Upload'}
                </button>
            </div>
        </aside>
    )
}
