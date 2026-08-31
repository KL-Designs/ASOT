'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { LibrarySort } from '@/lib/gallery/library-query'
import { useRangeSelect } from './selection'
import s from '@/styles/media-console.module.css'

/**
 * The archive as rows.
 *
 * The grid is for recognising a shot; this is for working through three
 * hundred of them — the fields a reviewer actually fixes (caption, operation,
 * author, date) side by side rather than one tile at a time in the inspector.
 *
 * Sorting is server-side. A header cell sets the `sort` parameter and the list
 * refetches; it never reorders the rows on screen, because the list is paged
 * sixty at a time and a client-side sort would only order the page in front of
 * you — page 2 would still hold items that belong on page 1. That is also why
 * only two headers are sortable: `buildLibrarySort` (lib/gallery/library-query)
 * defines the sorts that exist, and a clickable Author header that quietly
 * sorted nothing would be worse than a plain one. Mission is covered by
 * Operation, whose sort is year → operation → mission.
 */

/** Matches the submissions queue's own per-row debounce (useSubmissions.ts).
 *  A caption PATCH on an upload also renames the file on disk, so this is
 *  deliberately not a keystroke-by-keystroke save. */
const SAVE_DEBOUNCE_MS = 800

export default function MediaTable({ items, selected, sort, onToggle, onRange, onSort, onCaptionSaved }: {
    items: AdminMediaAPI[]
    selected: Set<string>
    sort: LibrarySort
    onToggle: (id: string) => void
    onRange: (fromId: string, toId: string) => void
    onSort: (sort: LibrarySort) => void
    /** Reports a caption the server has accepted, so the parent can show it on
     *  the item it hands the inspector — see MediaTab's `captionEdits`. */
    onCaptionSaved: (id: string, caption: string) => void
}) {
    const click = useRangeSelect(onToggle, onRange)

    if (items.length === 0) {
        return <div className={s.empty}>Nothing here. Try a different view, or clear the filters.</div>
    }

    const dated = sort === 'newest' || sort === 'oldest'

    return (
        <div className={s.tblWrap}>
            <table className={s.tbl}>
                <thead>
                    <tr>
                        <th scope='col' className={s.tblPick}><span className={s.srOnly}>Selected</span></th>
                        <th scope='col'><span className={s.srOnly}>Thumbnail</span></th>
                        <th scope='col'>Caption</th>
                        {/* aria-sort is on the header cell, not the button:
                            the cell is what a screen reader announces as the
                            column, and 'ascending' here is the truth about the
                            server's sort — `operation` has no descending form,
                            so clicking it again re-asserts it rather than
                            flipping to an order the API cannot produce. */}
                        <th scope='col' aria-sort={sort === 'operation' ? 'ascending' : 'none'}>
                            <button
                                type='button'
                                className={`${s.sortBtn} ${sort === 'operation' ? s.sortOn : ''}`}
                                onClick={() => onSort('operation')}
                            >
                                Operation<span className={s.sortMark}>{sort === 'operation' ? '▲' : ''}</span>
                            </button>
                        </th>
                        <th scope='col'>Mission</th>
                        <th scope='col'>Author</th>
                        <th scope='col' aria-sort={sort === 'newest' ? 'descending' : sort === 'oldest' ? 'ascending' : 'none'}>
                            <button
                                type='button'
                                className={`${s.sortBtn} ${dated ? s.sortOn : ''}`}
                                // From any other sort this lands on 'newest',
                                // the archive's default, rather than on
                                // whichever direction happened to be last.
                                onClick={() => onSort(sort === 'newest' ? 'oldest' : 'newest')}
                            >
                                Taken<span className={s.sortMark}>{sort === 'newest' ? '▼' : sort === 'oldest' ? '▲' : ''}</span>
                            </button>
                        </th>
                        <th scope='col'>Size</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <Row
                            key={item.id}
                            item={item}
                            on={selected.has(item.id)}
                            onClick={click}
                            onCaptionSaved={onCaptionSaved}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/** Width × height where the file has them, bytes where it does not (an embed
 *  has neither, and says so). Mirrors the inspector's two facts, collapsed
 *  into the one column a table can spare. */
function sizeLabel(item: AdminMediaAPI): string {
    if (item.width && item.height) return `${item.width} × ${item.height}`
    if (item.bytes) return `${(item.bytes / 1024 / 1024).toFixed(1)} MB`
    return '—'
}

function Row({ item, on, onClick, onCaptionSaved }: {
    item: AdminMediaAPI
    on: boolean
    onClick: (id: string, shiftKey: boolean) => void
    onCaptionSaved: (id: string, caption: string) => void
}) {
    /* Seeded once and deliberately not re-seeded when `item` arrives fresh
       from a refetch: `item` is a new object for the same id after every
       refresh, and re-seeding on it would stomp on a caption the reviewer is
       part-way through typing. Same reasoning as Inspector's item.id-keyed
       effect; here the row is keyed by id, so a genuinely different item is a
       different component. */
    const [caption, setCaption] = useState(item.caption ?? '')
    const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [error, setError] = useState<string | null>(null)

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    /** The value the server has accepted. Compared before every PATCH so a
     *  blur with nothing typed, or a re-focus after a save, does not re-send
     *  the same caption — which on an upload means a needless file rename. */
    const savedValue = useRef(item.caption ?? '')
    /** Read by the unmount flush below, which cannot see React state. */
    const draft = useRef(caption)
    const requestId = useRef(0)

    const save = useCallback(async (value: string) => {
        if (value === savedValue.current) return
        const id = ++requestId.current
        setState('saving')
        setError(null)
        try {
            // Caption only. The route treats every field as independently
            // optional (route.ts builds its $set from whatever is present), so
            // sending just this one cannot disturb the tags, author or
            // operation the inspector owns.
            const res = await fetch(`/api/gallery/admin/media/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption: value }),
            })
            // A superseded request must not overwrite the state of a newer
            // one — typing again while a save is in flight starts a second.
            if (id !== requestId.current) return
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                /* The server's own message, on the row. The edit stays in the
                   input either way: discarding what a reviewer typed because
                   a PATCH 403'd is how a session that expired mid-session
                   silently eats an afternoon of captioning. */
                setError(typeof data.error === 'string' ? data.error : 'Could not save this caption.')
                setState('idle')
                return
            }
            savedValue.current = value
            setState('saved')
            onCaptionSaved(item.id, value)
        } catch {
            if (id !== requestId.current) return
            setError('Could not reach the server.')
            setState('idle')
        }
    }, [item.id, onCaptionSaved])

    // The unmount flush below has to call the current `save` without listing
    // it as a dependency — depending on it would tear down and re-arm the
    // cleanup on every render, and the cleanup's whole job is to run exactly
    // once, at unmount.
    const saveRef = useRef(save)
    useEffect(() => { saveRef.current = save }, [save])

    useEffect(() => () => {
        if (!timer.current) return
        clearTimeout(timer.current)
        /* Sent rather than dropped. The row unmounts when the reviewer pages
           on or changes a filter, and a caption typed a few hundred
           milliseconds earlier would otherwise vanish with no sign it was
           ever discarded. A failure here can no longer be shown on a row that
           no longer exists — which is the argument for attempting the save,
           not for abandoning it. */
        void saveRef.current(draft.current)
    }, [])

    function change(value: string) {
        setCaption(value)
        draft.current = value
        setError(null)
        setState('idle')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => { timer.current = null; void save(value) }, SAVE_DEBOUNCE_MS)
    }

    /** Leaving the field saves now instead of waiting out the debounce — a
     *  reviewer who has moved to the next row has finished with this one. */
    function flush() {
        if (!timer.current) return
        clearTimeout(timer.current)
        timer.current = null
        void save(draft.current)
    }

    /* The same sentinel the inspector's select and the grid's UNLINKED badge
       use: an item can carry a folder-derived operation name with no link to
       an operation record at all, and 'Unknown' is a word two different
       things legitimately produce (see Inspector's UNLINKED comment). The
       column says which of the two this row is. */
    const unlinkedName = !item.operationId ? (item.opLabel || item.operation) : null
    const label = item.caption || item.opLabel || 'untitled media'

    return (
        <tr className={`${s.tblRow} ${on ? s.tblRowOn : ''}`}>
            <td className={s.tblPick}>
                {/* readOnly, with the click handler owning the state: onChange
                    cannot see the shift key, and shift-click is how a range is
                    selected. Space on a focused checkbox dispatches a click
                    too, so the keyboard path goes through the same handler. */}
                <input
                    type='checkbox'
                    checked={on}
                    readOnly
                    aria-label={`Select ${label}`}
                    onClick={e => onClick(item.id, e.shiftKey)}
                />
            </td>
            <td>
                {/* A pointer-sized target for the selection the checkbox
                    already owns. Hidden from assistive tech and out of the tab
                    order deliberately: one control per row for a keyboard or
                    screen-reader user, two identical ones for nobody. */}
                <button
                    type='button'
                    className={s.thumbBtn}
                    aria-hidden
                    tabIndex={-1}
                    onClick={e => onClick(item.id, e.shiftKey)}
                >
                    {/* The grid's thumbnail, in a 48x30 cell — the reason
                        this is `thumb` and not `src` matters more here than
                        anywhere: a table row shows the picture smaller than
                        the grid does, and it was fetching the same 3.8MB
                        original to do it. */}
                    {(item.thumb ?? item.poster ?? item.src)
                        ? <img src={item.thumb ?? item.poster ?? item.src ?? ''} alt='' loading='lazy' decoding='async' />
                        : null}
                </button>
            </td>
            <td className={s.tblCap}>
                <input
                    className={s.capInput}
                    value={caption}
                    placeholder='Untitled'
                    aria-label={`Caption for ${label}`}
                    onChange={e => change(e.target.value)}
                    onBlur={flush}
                />
                {(error || state !== 'idle') && (
                    <span className={s.capState} data-state={error ? 'error' : state}>
                        {error ?? (state === 'saving' ? 'Saving…' : 'Saved')}
                    </span>
                )}
            </td>
            <td>
                {item.operationId
                    ? (item.opLabel || item.operation || <span className={s.muted}>Unknown</span>)
                    : unlinkedName
                        ? <>{unlinkedName} <span className={s.muted}>— from folder, not linked</span></>
                        : <span className={s.muted}>Unknown</span>}
            </td>
            <td>{item.mission || <span className={s.muted}>—</span>}</td>
            <td>{item.authorName || <span className={s.muted}>—</span>}</td>
            <td className={s.tblNum}>
                {item.takenAt
                    ? new Date(item.takenAt).toLocaleDateString('en-AU')
                    : <span className={s.muted}>Undated</span>}
            </td>
            <td className={s.tblNum}>{sizeLabel(item)}</td>
        </tr>
    )
}
