'use client'

import { useEffect, useState } from 'react'
import { Autocomplete, Button, Chip, MenuItem, TextField, Typography } from '@mui/material'

import { embedIframeSrc } from '@/lib/gallery/embeds'
import s from '@/styles/media-console.module.css'

/**
 * One item, and everything a reviewer can change about it.
 *
 * The storage path is shown in full rather than summarised. The bracketed id
 * in it is the contract that lets this file be dragged into a different folder
 * in a downloaded backup and still be recognised on re-import — a reviewer who
 * can see it can trust it, and one who is only told about it cannot.
 *
 * Saving an operation moves the file — for an upload. An embed has no bytes,
 * so reassigning one only relabels it; the consequence copy below says which
 * is about to happen rather than always claiming a move, which would be false
 * for roughly a third of the archive's rows.
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

export default function Inspector({ item, operations, tags, onSaved, onDeleted }: {
    item: AdminMediaAPI
    operations: Operation[]
    tags: { slug: string, label: string }[]
    onSaved: () => void
    onDeleted: () => void
}) {
    const [caption, setCaption] = useState(item.caption ?? '')
    const [authorName, setAuthorName] = useState(item.authorName ?? '')
    const [operationId, setOperationId] = useState(item.operationId ?? 'unknown')
    const [chosen, setChosen] = useState<string[]>(item.tags)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Re-seeded when the selection changes, or the fields would keep the
    // previous item's values while showing the new item's preview. Keyed on
    // item.id specifically, not on `item` itself: `item` is `items.find(...)`
    // in MediaTab, and a fresh fetch (e.g. the refresh() a save triggers)
    // hands back a brand-new object for the SAME id — an effect keyed on the
    // object would re-fire and stomp on state the reviewer just typed, even
    // though the selection never changed.
    useEffect(() => {
        setCaption(item.caption ?? '')
        setAuthorName(item.authorName ?? '')
        setOperationId(item.operationId ?? 'unknown')
        setChosen(item.tags)
        setConfirmDelete(false)
        setError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately item.id only, see comment above
    }, [item.id])

    const movingTo = operationId !== (item.operationId ?? 'unknown')
        ? operations.find(o => o.id === operationId) ?? null
        : null

    // Only an upload with a storage key has bytes for relocateMedia to move —
    // mirrors the route's own `relocating` check (route.ts). An embed reassigned
    // to a new operation is relabelled in place; telling a reviewer it is about
    // to be "moved into a folder on disk" would describe a move that never
    // happens for it.
    const movesBytes = item.source === 'upload' && !!item.storageKey

    async function save() {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/gallery/admin/media/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption, authorName, tags: chosen, operationId }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                // The exact server message, not a generic one — a 500 here means
                // "saved but the file could not be moved," which changes what a
                // reviewer does next, and a generic message would hide that.
                setError(typeof data.error === 'string' ? data.error : 'Could not save.')
                return
            }
            onSaved()
        } catch {
            // fetch itself rejected (offline, DNS, etc.) — the reviewer still
            // needs to see that nothing was saved, not silence.
            setError('Could not reach the server.')
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/gallery/admin/media/${item.id}`, { method: 'DELETE' })
            if (res.ok) { onDeleted(); return }
            const data = await res.json().catch(() => ({}))
            setError(typeof data.error === 'string' ? data.error : 'Could not delete.')
        } catch {
            setError('Could not reach the server.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <aside className={s.insp}>
            <div className={s.inspHead}><span>Item</span></div>

            <div className={s.preview}>
                <Preview item={item} />
            </div>

            <TextField size='small' label='Caption' value={caption} onChange={e => setCaption(e.target.value)} sx={inputSx} multiline maxRows={3} />

            <TextField size='small' select label='Operation' value={operationId} onChange={e => setOperationId(e.target.value)} sx={inputSx}>
                <MenuItem value='unknown'>Unknown</MenuItem>
                {operations.map(op => <MenuItem key={op.id} value={op.id}>{op.title}</MenuItem>)}
            </TextField>

            {movingTo && (
                <div className={s.consequence}>
                    {movesBytes
                        ? <>Saving moves this file into <b>{movingTo.title}</b>&rsquo;s folder on disk{movingTo.date ? <> and dates it <b>{new Date(movingTo.date).toLocaleDateString('en-AU')}</b></> : null}.</>
                        : <>Saving relabels this item under <b>{movingTo.title}</b>{movingTo.date ? <> and dates it <b>{new Date(movingTo.date).toLocaleDateString('en-AU')}</b></> : null}. It has no file on disk to move.</>}
                </div>
            )}
            {!movingTo && operationId === 'unknown' && item.operationId && (
                <div className={s.consequence}>
                    {movesBytes
                        ? <>Saving moves this file into <b>Unknown</b> on disk and clears its date.</>
                        : <>Saving clears this item&rsquo;s operation and date. It has no file on disk to move.</>}
                </div>
            )}

            <TextField size='small' label='Author' value={authorName} onChange={e => setAuthorName(e.target.value)} sx={inputSx} />

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

            {item.storageKey && (
                <div className={s.diskBlock}>
                    <div className={s.inspHead}><span>On disk</span></div>
                    <div className={s.path}>{item.storageKey}</div>
                </div>
            )}

            <dl className={s.facts}>
                <dt>Taken</dt><dd>{item.takenAt ? new Date(item.takenAt).toLocaleDateString('en-AU') : 'Undated'}</dd>
                {item.width && item.height ? <><dt>Size</dt><dd>{item.width} × {item.height}</dd></> : null}
                {item.bytes ? <><dt>Bytes</dt><dd>{(item.bytes / 1024 / 1024).toFixed(1)} MB</dd></> : null}
                <dt>Votes</dt><dd>▲ {item.up} ▼ {item.down}</dd>
            </dl>

            {error && <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)' }}>{error}</Typography>}

            <div className={s.actions}>
                <Button size='small' variant='outlined' disabled={saving} onClick={save} sx={{ fontSize: '0.7rem' }}>Save</Button>
                {confirmDelete ? (
                    <>
                        <Button size='small' color='error' disabled={saving} onClick={remove} sx={{ fontSize: '0.7rem' }}>Delete for good</Button>
                        <Button size='small' disabled={saving} onClick={() => setConfirmDelete(false)} sx={{ fontSize: '0.7rem' }}>Cancel</Button>
                    </>
                ) : (
                    <Button size='small' color='error' disabled={saving} onClick={() => setConfirmDelete(true)} sx={{ fontSize: '0.7rem' }}>Delete</Button>
                )}
            </div>
        </aside>
    )
}

/**
 * The preview pane's contents. An upload plays or shows its own bytes; an
 * embed has none — `src` is always null for it (types/gallery.d.ts) — so it
 * renders through the same `embedIframeSrc` the public Lightbox and the J5
 * submissions queue already use rather than a blank box.
 *
 * `key={item.id}` on the video: without it, React reconciles the existing
 * `<video>` element in place and only patches its `src` attribute when the
 * selection changes to a different clip — which does not stop the previous
 * clip's audio track, already playing, from continuing under the new poster.
 * A fresh key forces a fresh element, which mounts paused.
 */
function Preview({ item }: { item: AdminMediaAPI }) {
    if (item.kind === 'video' && item.src) {
        return <video key={item.id} src={item.src} poster={item.poster ?? undefined} controls playsInline />
    }

    if (item.source !== 'upload' && item.embedId && item.embedKind) {
        const parentHost = typeof window === 'undefined' ? '' : window.location.hostname
        return (
            <iframe
                key={item.id}
                src={embedIframeSrc({ provider: item.source, kind: item.embedKind, id: item.embedId }, parentHost)}
                allow='autoplay; fullscreen; picture-in-picture'
                allowFullScreen
                title={item.caption ?? 'Embedded media'}
            />
        )
    }

    if (item.poster ?? item.src) {
        return <img src={item.poster ?? item.src ?? ''} alt='' />
    }

    return <div className={s.previewEmpty}>No preview available</div>
}
