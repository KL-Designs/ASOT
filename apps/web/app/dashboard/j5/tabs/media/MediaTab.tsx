'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, MenuItem, TextField, Typography } from '@mui/material'

import { PAGE_SIZE, type LibrarySort } from '@/lib/gallery/library-query'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
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
    const { items, total, facets, filters, setParam, selectNode, clear, loading, page, setPage, refresh } = useLibrary()
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [operations, setOperations] = useState<Operation[]>([])
    const [tagVocab, setTagVocab] = useState<{ slug: string, label: string }[]>([])

    // Fetched once — the picker's own list of operations/tags rather than the
    // filter facets in `facets`, which only carry the ones already in use on
    // a media item and would never offer an operation nothing has been tagged
    // with yet.
    useEffect(() => {
        fetch('/api/gallery/operations').then(r => r.ok ? r.json() : null).then(d => {
            if (d?.operations) setOperations(d.operations)
        })
        fetch('/api/gallery/tags').then(r => r.ok ? r.json() : null).then(d => {
            if (d?.tags) setTagVocab(d.tags.filter((t: { retired: boolean }) => !t.retired))
        })
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
                    // LibraryRail only ever compares these against the raw
                    // strings the facets response itself uses ('Unknown' for
                    // an absent field — see selectNode's comment in
                    // useLibrary.ts) to decide which row is highlighted; it
                    // never sends them to the query. Mapping *Unset back to
                    // that display string here — the inverse of what
                    // selectNode does going in — is what keeps the Unknown
                    // row (and "All media" losing its highlight under it)
                    // showing correctly without LibraryRail needing to know
                    // the boolean flags exist at all.
                    year={filters.yearUnset ? 'Unknown' : filters.year}
                    operation={filters.operationUnset ? 'Unknown' : filters.operation}
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

                    {loading ? <TacticalSkeleton /> : (
                        <MediaGrid
                            items={items}
                            selected={selected}
                            onToggle={toggle}
                            onRange={range}
                            onOpen={toggle}
                        />
                    )}

                    {pages > 1 && (
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
                    : (
                        <aside className={s.insp}>
                            <div className={s.inspHead}><span>{selected.size === 0 ? 'Inspector' : 'Bulk edit'}</span></div>
                            <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.38)' }}>
                                {selected.size === 0 ? 'Select an item to edit it.' : `${selected.size} selected.`}
                            </Typography>
                        </aside>
                    )}
            </div>
        </div>
    )
}
