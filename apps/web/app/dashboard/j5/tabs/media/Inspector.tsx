'use client'

import { useEffect, useState } from 'react'
import { Typography } from '@mui/material'

import { Field, TextArea } from '@/app/dashboard/j5/controls/Field'
import { Select, type SelectOption } from '@/app/dashboard/j5/controls/Select'
import { TagPicker } from '@/app/dashboard/j5/controls/TagPicker'
import { embedIframeSrc } from '@/lib/gallery/embeds'
import s from '@/styles/media-console.module.css'
import c from '@/styles/j5-controls.module.css'

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

type Operation = { id: string, title: string, date: string | null }

/**
 * Not the string 'Unknown': that word is legitimately produced by two
 * different things here — a literal `operation: 'Unknown'` written by
 * relocate.ts, and the "no operationId at all" case this sentinel actually
 * means — and LibraryRail already had to unpick exactly that collision once
 * (its `unset` boolean, not a shared display string, is what tells its two
 * "Unknown"-labelled rows apart). A select value nobody else can produce is
 * what keeps "unlinked, but named from its folder" from ever being confused
 * with a real choice of "Unknown" typed or written elsewhere.
 */
const UNLINKED = '__unlinked__'

export default function Inspector({ item, operations, tags, onSaved, onDeleted }: {
    item: AdminMediaAPI
    operations: Operation[]
    tags: { slug: string, label: string }[]
    onSaved: () => void
    onDeleted: () => void
}) {
    // A migrated item can hold a folder-derived name (`opLabel`/`operation`)
    // with no `operationId` at all — none of the operation records in the
    // database normalise to that folder. `unlinkedName` is that name, only
    // when there is no link to show instead; it drives both the select's
    // starting value below and the extra option that displays it.
    const unlinkedName = !item.operationId ? (item.opLabel || item.operation) : null

    const [caption, setCaption] = useState(item.caption ?? '')
    const [authorName, setAuthorName] = useState(item.authorName ?? '')
    const [operationId, setOperationId] = useState(item.operationId ?? (unlinkedName ? UNLINKED : 'unknown'))
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
        setOperationId(item.operationId ?? (unlinkedName ? UNLINKED : 'unknown'))
        setChosen(item.tags)
        setConfirmDelete(false)
        setError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately item.id only, see comment above
    }, [item.id])

    // The baseline the select actually started from — UNLINKED for an
    // unlinked-but-named item, not 'unknown' — so leaving the select alone
    // never reads as a change, and picking real Unknown from an unlinked item
    // still reads as one (it clears the folder name, which is a real effect).
    const initialOperationId = item.operationId ?? (unlinkedName ? UNLINKED : 'unknown')

    const movingTo = operationId !== initialOperationId
        ? operations.find(o => o.id === operationId) ?? null
        : null

    // True only when picking Unknown actually clears something: a real link,
    // or (for an unlinked item) the folder-derived name. Landing back on
    // UNLINKED — the item's own starting point — is not this; nothing changed.
    const clearingTo = operationId === 'unknown' && operationId !== initialOperationId

    // Only an upload with a storage key has bytes for relocateMedia to move —
    // mirrors the route's own `relocating` check (route.ts). An embed reassigned
    // to a new operation is relabelled in place; telling a reviewer it is about
    // to be "moved into a folder on disk" would describe a move that never
    // happens for it.
    const movesBytes = item.source === 'upload' && !!item.storageKey

    const operationOptions: SelectOption[] = [
        /* The unlinked sentinel is only ever offered for an item that is
           actually unlinked (unlinkedName is null whenever item.operationId
           is set) — a linked item's select never gets this option, real or
           stale. Its label says both what the file has (the folder name) and
           what it lacks (a link), so picking it back after trying a real
           operation reads as "leave it as I found it," not as a second,
           unexplained kind of Unknown. `muted` is what marks it as a state
           the item is in rather than a choice on the same footing as the 522
           real operations below it. */
        ...(unlinkedName ? [{ value: UNLINKED, label: `${unlinkedName} — from folder, not linked`, muted: true }] : []),
        { value: 'unknown', label: 'Unknown' },
        ...operations.map(op => ({
            value: op.id,
            label: op.title,
            // The year, because operation titles repeat across them — two
            // "Op Storm"s a year apart are otherwise the same row twice.
            note: op.date ? String(new Date(op.date).getFullYear()) : undefined,
        })),
    ]

    async function save() {
        setSaving(true)
        setError(null)
        try {
            /* An untouched select is not a change, so its key is omitted —
               which is what keeps the route out of its `operationId !==
               undefined` branch and leaves the four facets (and, for an
               unlinked item, the folder-derived name behind them) exactly as
               they were found. Compared against the baseline rather than
               against UNLINKED alone: a linked item and a no-name unlinked
               item are just as untouched, and re-sending their id made the
               audit log's `moved: true` meaningless.

               The sentinel itself could never reach the database in any case —
               it is not a valid ObjectId (bson dropped 12-character string
               support, so `ObjectId.isValid('__unlinked__')` is false),
               operationFacets returns null for it and the route answers 400
               "No such operation" before writing anything. A 400 is the right
               failure, but not one a reviewer should ever be shown, which is
               why this comparison and not a leak-and-reject. */
            const operationIdToSend = operationId === initialOperationId ? undefined : operationId
            const res = await fetch(`/api/gallery/admin/media/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption, authorName, tags: chosen, operationId: operationIdToSend }),
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

            <TextArea label='Caption' value={caption} onChange={setCaption} rows={3} />

            <Select label='Operation' searchable value={operationId} onChange={setOperationId} options={operationOptions} />

            {movingTo && (
                <div className={s.consequence}>
                    {movesBytes
                        ? <>Saving moves this file into <b>{movingTo.title}</b>&rsquo;s folder on disk{movingTo.date ? <> and dates it <b>{new Date(movingTo.date).toLocaleDateString('en-AU')}</b></> : null}.</>
                        : <>Saving relabels this item under <b>{movingTo.title}</b>{movingTo.date ? <> and dates it <b>{new Date(movingTo.date).toLocaleDateString('en-AU')}</b></> : null}. It has no file on disk to move.</>}
                </div>
            )}
            {/* Covers both a real link being cleared and an unlinked item's
                folder name being cleared — clearingTo is only true when
                picking Unknown is a change from where this item started, so
                it can't fire while UNLINKED (unchanged) sits selected. */}
            {!movingTo && clearingTo && (
                <div className={s.consequence}>
                    {movesBytes
                        ? <>Saving moves this file into <b>Unknown</b> on disk and clears its date.</>
                        : <>Saving clears this item&rsquo;s operation and date. It has no file on disk to move.</>}
                </div>
            )}

            <Field label='Author' value={authorName} onChange={setAuthorName} />

            <TagPicker
                label='Tags'
                value={chosen}
                onChange={setChosen}
                options={tags.map(t => t.slug)}
                labelFor={slug => tags.find(t => t.slug === slug)?.label ?? slug}
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
                <button type='button' className={`${c.btn} ${c.btnPrimary}`} disabled={saving} onClick={save}>Save</button>
                {confirmDelete ? (
                    <>
                        <button type='button' className={`${c.btn} ${c.btnDanger}`} disabled={saving} onClick={remove}>Delete for good</button>
                        <button type='button' className={`${c.btn} ${c.btnGhost}`} disabled={saving} onClick={() => setConfirmDelete(false)}>Cancel</button>
                    </>
                ) : (
                    <button type='button' className={`${c.btn} ${c.btnDanger}`} disabled={saving} onClick={() => setConfirmDelete(true)}>Delete</button>
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
