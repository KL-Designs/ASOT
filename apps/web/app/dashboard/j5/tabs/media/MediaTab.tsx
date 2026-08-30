'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, MenuItem, TextField, Typography } from '@mui/material'

import { PAGE_SIZE, type LibrarySort } from '@/lib/gallery/library-query'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import BulkPanel from './BulkPanel'
import HealthView from './HealthView'
import Inspector from './Inspector'
import LibraryRail from './LibraryRail'
import MediaGrid from './MediaGrid'
import { useLibrary } from './useLibrary'
import s from '@/styles/media-console.module.css'

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

    return (
        <div>
            <div className={s.work}>
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
                        <Button size='small' onClick={() => { clear(); setSelected(new Set()) }} sx={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)' }}>
                            Clear filters
                        </Button>
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
                            <Button size='small' variant='outlined' onClick={retry} sx={{ fontSize: '0.7rem' }}>
                                Retry
                            </Button>
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
                            <Button size='small' disabled={page === 0} onClick={() => setPage(page - 1)} sx={{ fontSize: '0.7rem' }}>Previous</Button>
                            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'rgba(237,237,237,0.5)' }}>
                                {page + 1} / {pages}
                            </Typography>
                            <Button size='small' disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} sx={{ fontSize: '0.7rem' }}>Next</Button>
                        </div>
                    )}
                </div>

                {selected.size === 1
                    ? (() => {
                        const item = items.find(i => selected.has(i.id))
                        return item ? (
                            <Inspector
                                item={item}
                                operations={operations}
                                tags={tagVocab}
                                onSaved={() => { refresh() }}
                                onDeleted={() => { setSelected(new Set()); refresh() }}
                            />
                        ) : null
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
                                onDone={hadFailures => { if (!hadFailures) setSelected(new Set()); refresh() }}
                            />
                        )
                        : (
                            <aside className={s.insp}>
                                <div className={s.inspHead}><span>Inspector</span></div>
                                <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.38)' }}>
                                    Select an item to edit it.
                                </Typography>
                            </aside>
                        )}
            </div>
        </div>
    )
}
