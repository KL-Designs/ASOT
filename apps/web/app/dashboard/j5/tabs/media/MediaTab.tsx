'use client'

import { useCallback, useEffect, useState } from 'react'
import { MenuItem, TextField, Typography } from '@mui/material'

import { PAGE_SIZE, type LibrarySort } from '@/lib/gallery/library-query'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import BulkPanel from './BulkPanel'
import HealthView from './HealthView'
import Inspector from './Inspector'
import LibraryRail from './LibraryRail'
import MediaGrid from './MediaGrid'
import { useLibrary } from './useLibrary'
import s from '@/styles/media-console.module.css'
import c from '@/styles/j5-controls.module.css'

type Operation = { id: string, title: string, date: string | null }

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

// A type predicate rather than an `as` cast on the select's onChange value —
// matches lib/gallery/library-query.ts's own reasoning: a value that fails
// the check should never be treated as the narrowed type, and the four
// MenuItems below are the only source of truth for what's valid.
const SORTS: readonly LibrarySort[] = ['newest', 'oldest', 'rated', 'operation']
function isSort(value: string): value is LibrarySort {
    return SORTS.some(s => s === value)
}

// Same reasoning one filter over: the Kind select's two MenuItems are the
// only valid values, and anything else means "not filtering on kind".
function isKind(value: string): value is 'image' | 'video' {
    return value === 'image' || value === 'video'
}

/**
 * The archive, and everything a reviewer can do to it.
 *
 * This tab replaces one that edited folders. The gallery stopped being a
 * folder tree when it became a database, and the thing worth editing is the
 * media — so the rail is the tree, but everything the rail selects is a query
 * against gallery_media rather than a directory listing.
 */
export default function MediaTab() {
    const { items, total, facets, filters, setParam, selectNode, clear, loading, error, retry, page, setPage, refresh } = useLibrary()
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [operations, setOperations] = useState<Operation[]>([])
    const [tagVocab, setTagVocab] = useState<{ slug: string, label: string }[]>([])
    const [pickerError, setPickerError] = useState<string | null>(null)
    /* What just happened, shown where the inspector was. A save or a clean
       bulk run both end with the selection cleared and the panel unmounted,
       so neither had anywhere left to put its own confirmation — from the
       reviewer's seat, Save made the panel disappear and said nothing. */
    const [note, setNote] = useState<string | null>(null)

    // Fetched once — the picker's own list of operations/tags rather than the
    // filter facets in `facets`, which only carry the ones already in use on
    // a media item and would never offer an operation nothing has been tagged
    // with yet.
    //
    // Both failures are surfaced. `r.ok ? r.json() : null` swallowed them, and
    // a swallowed operations fetch is indistinguishable from an archive with
    // no operations in it: the Operation select and the bulk "Move to
    // operation" both silently offer nothing but "Unknown", which is the tab
    // being unable to do its job while looking perfectly healthy. The route's
    // own gate is fixed alongside this, but a future permission drift must
    // say so rather than reproduce the same empty dropdown.
    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch('/api/gallery/operations')
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    const why = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`
                    setPickerError(`Operations could not be loaded (${why}). Assigning an operation is unavailable.`)
                    return
                }
                const data = await res.json()
                if (Array.isArray(data.operations)) setOperations(data.operations)
            } catch {
                setPickerError('Could not reach the server for the operation list. Assigning an operation is unavailable.')
            }
        })()

        void (async () => {
            try {
                const res = await fetch('/api/gallery/tags')
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    const why = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`
                    setPickerError(`Tags could not be loaded (${why}).`)
                    return
                }
                const data = await res.json()
                if (Array.isArray(data.tags)) setTagVocab(data.tags.filter((t: { retired: boolean }) => !t.retired))
            } catch {
                setPickerError('Could not reach the server for the tag list.')
            }
        })()
    }, [])

    // Cleared on a timer rather than on the next click: the reviewer's next
    // action is usually selecting the next tile, and a confirmation that
    // vanished on that click would routinely never be read.
    useEffect(() => {
        if (!note) return
        const timer = setTimeout(() => setNote(null), 5000)
        return () => clearTimeout(timer)
    }, [note])

    const toggle = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }, [])

    const range = useCallback((fromId: string, toId: string) => {
        const from = items.findIndex(i => i.id === fromId)
        const to = items.findIndex(i => i.id === toId)
        if (from < 0 || to < 0) return
        const [lo, hi] = from < to ? [from, to] : [to, from]
        setSelected(prev => {
            const next = new Set(prev)
            for (let i = lo; i <= hi; i++) next.add(items[i].id)
            return next
        })
    }, [items])

    const pages = Math.ceil(total / PAGE_SIZE)

    /* One element, two callers: the "nothing selected" column and the branch
       where the single selected id is no longer on this page. Both are the
       same state — there is no item to edit — and both are where the note
       from the last save or bulk run is read. */
    const emptyInspector = (
        <aside className={s.insp}>
            <div className={s.inspHead}><span>Inspector</span></div>
            {note && <Typography sx={{ fontSize: '0.78rem', color: 'var(--red-hi)' }}>{note}</Typography>}
            <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.38)' }}>
                Select an item to edit it.
            </Typography>
        </aside>
    )

    return (
        <div>
            <div className={s.work}>
                <CornerBrackets />
                <LibraryRail
                    facets={facets}
                    view={filters.view}
                    // Passed straight through rather than translated into
                    // the display string 'Unknown': the facets response can
                    // now carry two rows that both show that label — one for
                    // "the field is absent" (yearUnset/operationUnset), one
                    // for a document whose field literally is that word —
                    // and only the raw boolean tells LibraryRail which one
                    // the current filter actually selected. See LibraryRail's
                    // yearSelected/opSelected and facets/route.ts's tree
                    // assembly for the full reasoning.
                    year={filters.year}
                    yearUnset={filters.yearUnset}
                    operation={filters.operation}
                    operationUnset={filters.operationUnset}
                    mission={filters.mission}
                    onView={v => {
                        setParam('view', v)
                        setParam('year', null)
                        setParam('operation', null)
                        setParam('mission', null)
                        // A saved view replaces a tree selection outright — otherwise
                        // clicking "All media" after the rail's Unknown node would
                        // leave *Unset stuck true and silently keep filtering.
                        setParam('yearUnset', false)
                        setParam('operationUnset', false)
                    }}
                    onNode={selectNode}
                />

                <div className={s.centre}>
                    <div className={s.tools}>
                        <TextField
                            size='small'
                            placeholder='Search captions, authors, filenames…'
                            value={filters.q ?? ''}
                            onChange={e => setParam('q', e.target.value || null)}
                            sx={{ ...inputSx, flex: 1, minWidth: 180 }}
                        />
                        <TextField
                            size='small'
                            select
                            label='Sort'
                            value={filters.sort}
                            onChange={e => { if (isSort(e.target.value)) setParam('sort', e.target.value) }}
                            sx={{ ...inputSx, minWidth: 130 }}
                        >
                            <MenuItem value='newest'>Newest first</MenuItem>
                            <MenuItem value='oldest'>Oldest first</MenuItem>
                            <MenuItem value='rated'>Top rated</MenuItem>
                            <MenuItem value='operation'>By operation</MenuItem>
                        </TextField>
                        {/* The tag/author/kind chips. LibraryParams,
                            buildLibraryFilter and the facets route have all
                            supported these three from the start — the facets
                            route pays for two full-collection aggregations
                            (one with a $unwind) on every rail load and after
                            every edit to compute the tag and author counts —
                            and nothing rendered them, so the cost was being
                            paid for nothing. Counts are shown in the option
                            because the whole rail's argument is that a number
                            tells a reviewer whether a row is worth opening.

                            Options come from `facets`, which lists only what
                            is actually in use, so no option here can return
                            an empty grid. */}
                        <TextField
                            size='small'
                            select
                            label='Tag'
                            value={filters.tag ?? ''}
                            onChange={e => setParam('tag', e.target.value || null)}
                            sx={{ ...inputSx, minWidth: 130 }}
                        >
                            <MenuItem value=''>Any tag</MenuItem>
                            {(facets?.tags ?? []).map(t => (
                                <MenuItem key={t.slug} value={t.slug}>{t.label} · {t.count.toLocaleString('en-AU')}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            size='small'
                            select
                            label='Author'
                            value={filters.author ?? ''}
                            onChange={e => setParam('author', e.target.value || null)}
                            sx={{ ...inputSx, minWidth: 150 }}
                        >
                            <MenuItem value=''>Any author</MenuItem>
                            {(facets?.authors ?? []).map(a => (
                                <MenuItem key={a.name} value={a.name}>{a.name} · {a.count.toLocaleString('en-AU')}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            size='small'
                            select
                            label='Kind'
                            value={filters.kind ?? ''}
                            // An explicit kind wins over the Videos view —
                            // buildLibraryFilter applies it after the view for
                            // exactly that reason, so the grid can never
                            // disagree with the chip on screen.
                            onChange={e => setParam('kind', isKind(e.target.value) ? e.target.value : null)}
                            sx={{ ...inputSx, minWidth: 110 }}
                        >
                            <MenuItem value=''>Any kind</MenuItem>
                            <MenuItem value='image'>Images</MenuItem>
                            <MenuItem value='video'>Videos</MenuItem>
                        </TextField>
                        <button type='button' className={`${c.btn} ${c.btnGhost}`} onClick={() => { clear(); setSelected(new Set()) }}>
                            Clear filters
                        </button>
                        <Typography sx={{ ml: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'rgba(237,237,237,0.38)' }}>
                            {total.toLocaleString('en-AU')} ITEMS{selected.size ? ` · ${selected.size} SELECTED` : ''}
                        </Typography>
                    </div>

                    {/* Above the grid, and it suppresses the grid's own empty
                        state below: a failed fetch leaves `items` empty, and
                        "Nothing here. Try a different view, or clear the
                        filters." reads as "your 4,781-item archive is empty"
                        to someone whose session has merely expired. Same
                        shape as HealthView's error line — the server's own
                        message, with a Retry that re-runs both fetches. */}
                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                            <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)' }}>{error}</Typography>
                            <button type='button' className={c.btn} onClick={retry}>
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Not folded into the banner above: the archive can load
                        perfectly while the pickers do not, and the reviewer
                        needs to know the dropdowns are short rather than the
                        archive empty. No Retry — it is a mount-once fetch,
                        and reloading the tab is the honest remedy. */}
                    {pickerError && (
                        <div style={{ padding: '10px 12px' }}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#d8ac45' }}>{pickerError}</Typography>
                        </div>
                    )}

                    {filters.view === 'health' ? (
                        // Health is a view of the same library, not a
                        // separate screen — the rail, tools bar and
                        // inspector column stay exactly as they are; only
                        // the grid and pager give way to the report.
                        <HealthView onChanged={refresh} />
                    ) : loading ? <TacticalSkeleton /> : error && items.length === 0 ? null : (
                        <MediaGrid
                            items={items}
                            selected={selected}
                            onToggle={toggle}
                            onRange={range}
                            onOpen={toggle}
                        />
                    )}

                    {filters.view !== 'health' && pages > 1 && (
                        <div className={s.pager}>
                            <button type='button' className={c.btn} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
                            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'rgba(237,237,237,0.5)' }}>
                                {page + 1} / {pages}
                            </Typography>
                            <button type='button' className={c.btn} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
                        </div>
                    )}
                </div>

                {selected.size === 1
                    ? (() => {
                        const item = items.find(i => selected.has(i.id))
                        /* Falls through to the empty aside when the selected
                           id is not on this page — it used to render null,
                           which blanked the whole 320px column while the
                           toolbar still said "1 SELECTED". That is the tab's
                           most common journey, not an edge case: a reviewer
                           in `Unknown operation` clicks a tile, assigns an
                           operation and saves; the save succeeds, so the item
                           now HAS an operation and drops out of the view, and
                           find() misses. */
                        return item ? (
                            <Inspector
                                item={item}
                                operations={operations}
                                tags={tagVocab}
                                // The selection is cleared and the outcome
                                // said out loud: after a save the item has
                                // very often left the current view, so
                                // keeping it selected buys nothing and only
                                // leaves the toolbar counting a tile that is
                                // no longer on screen.
                                onSaved={() => { setSelected(new Set()); setNote('Saved.'); refresh() }}
                                onDeleted={() => { setSelected(new Set()); setNote('Deleted.'); refresh() }}
                            />
                        ) : emptyInspector
                    })()
                    : selected.size > 1
                        ? (
                            <BulkPanel
                                ids={[...selected]}
                                operations={operations}
                                tags={tagVocab}
                                // Selection only clears on a clean run — see
                                // BulkPanel's module comment. A partial
                                // failure keeps every originally-selected id
                                // (successes and failures alike) so the
                                // reviewer can see what happened and retry.
                                //
                                // The summary is lifted up here because
                                // clearing the selection unmounts the panel
                                // that produced it: a clean "60 changed." was
                                // destroyed in the same tick it was set.
                                onDone={(hadFailures, summary) => {
                                    if (!hadFailures) { setSelected(new Set()); setNote(summary) }
                                    refresh()
                                }}
                            />
                        )
                        : emptyInspector}
            </div>
        </div>
    )
}
