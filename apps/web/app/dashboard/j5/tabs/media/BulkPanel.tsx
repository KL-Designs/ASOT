'use client'

import { useState } from 'react'
import { Typography } from '@mui/material'

import { Field } from '@/app/dashboard/j5/controls/Field'
import { Select, type SelectOption } from '@/app/dashboard/j5/controls/Select'
import { TagPicker } from '@/app/dashboard/j5/controls/TagPicker'
import s from '@/styles/media-console.module.css'
import c from '@/styles/j5-controls.module.css'

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
 *
 * It carries the summary line too, because on a CLEAN run this panel is not
 * around to show it: `onDone(false)` clears the selection, which unmounts
 * this component, which destroyed the "60 changed." it had just set on its
 * own state. A successful bulk action gave no confirmation at all. The
 * summary is handed up and rendered where the panel used to be. The failure
 * path is unchanged — the selection survives, this panel stays mounted, and
 * `result` and `failed[]` render here per item.
 */

type Operation = { id: string, title: string, date: string | null }
type Failure = { id: string, error: string }

export default function BulkPanel({ ids, operations, tags, onDone }: {
    ids: string[]
    operations: Operation[]
    tags: { slug: string, label: string }[]
    onDone: (hadFailures: boolean, summary: string) => void
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

    const operationOptions: SelectOption[] = [
        // The empty option is the "nothing chosen yet" row rather than a
        // placeholder, because '' is a value the Apply button tests for.
        { value: '', label: 'Choose an operation…' },
        { value: 'unknown', label: 'Unknown' },
        // The year, for the same reason as the inspector's: operation titles
        // repeat across years and the note is what tells the two apart.
        ...operations.map(op => ({
            value: op.id,
            label: op.title,
            note: op.date ? String(new Date(op.date).getFullYear()) : undefined,
        })),
    ]

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
            const summary = itemFailures.length
                ? `${changed} changed, ${itemFailures.length} failed.`
                : `${changed} changed.`
            setResult(summary)
            onDone(itemFailures.length > 0, summary)
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

            <Select label='Move to operation' searchable value={operationId} onChange={setOperationId} options={operationOptions} />

            {operationId && (
                <div className={s.consequence}>
                    {/* "Moves N items", not "moves N files on disk": a
                        selection is a mix, and roughly a third of the archive
                        is embeds with no bytes to move. Inspector can say
                        which because it holds one item; this panel cannot know
                        the mix, so it says the thing that is true of both. */}
                    {operationId === 'unknown'
                        ? <>Moves <b>{ids.length}</b> items to <b>Unknown</b> and clears their dates. Uploads are moved on disk; embeds are relabelled in place.</>
                        : <>Moves <b>{ids.length}</b> items to <b>{target?.title}</b>
                            {target?.date ? <> and dates them <b>{new Date(target.date).toLocaleDateString('en-AU')}</b></> : null}.
                            Uploads are moved into its folder on disk; embeds are relabelled in place.</>}
                </div>
            )}

            <button type='button' className={`${c.btn} ${c.btnPrimary}`} disabled={!operationId || busy} onClick={() => run('move', { operationId })}>
                Apply to {ids.length}
            </button>

            <TagPicker
                label='Tags'
                value={chosen}
                onChange={setChosen}
                options={tags.map(t => t.slug)}
                labelFor={slug => tags.find(t => t.slug === slug)?.label ?? slug}
            />
            <div style={{ display: 'flex', gap: 6 }}>
                <button type='button' className={c.btn} disabled={!chosen.length || busy} onClick={() => run('addTags', { tags: chosen })}>Add tags</button>
                <button type='button' className={c.btn} disabled={!chosen.length || busy} onClick={() => run('removeTags', { tags: chosen })}>Remove tags</button>
            </div>

            <Field label='Set author' value={authorName} onChange={setAuthorName} />
            <button type='button' className={c.btn} disabled={busy} onClick={() => run('setAuthor', { authorName })}>
                {authorName.trim() ? `Set author on ${ids.length}` : `Clear author on ${ids.length}`}
            </button>

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
                        <button type='button' className={`${c.btn} ${c.btnDanger}`} disabled={busy} onClick={() => run('delete', {})}>
                            Delete {ids.length} for good
                        </button>
                        <button type='button' className={`${c.btn} ${c.btnGhost}`} disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
                    </>
                ) : (
                    <button type='button' className={`${c.btn} ${c.btnDanger}`} disabled={busy} onClick={() => setConfirmDelete(true)}>
                        Delete {ids.length}
                    </button>
                )}
            </div>
        </aside>
    )
}
