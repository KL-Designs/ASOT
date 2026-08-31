'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Typography } from '@mui/material'

import { PAGE_SIZE, type LibrarySort } from '@/lib/gallery/library-query'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { Field } from '@/app/dashboard/j5/controls/Field'
import { Select } from '@/app/dashboard/j5/controls/Select'
import BulkPanel from './BulkPanel'
import HealthView from './HealthView'
import Inspector from './Inspector'
import LibraryRail from './LibraryRail'
import MediaGrid from './MediaGrid'
import MediaTable from './MediaTable'
import Viewer from './Viewer'
import { useLibrary } from './useLibrary'
import s from '@/styles/media-console.module.css'
import c from '@/styles/j5-controls.module.css'

type Operation = { id: string, title: string, date: string | null }

// A type predicate rather than an `as` cast on the select's onChange value —
// matches lib/gallery/library-query.ts's own reasoning: a value that fails
// the check should never be treated as the narrowed type, and the four
// options below are the only source of truth for what's valid.
const SORTS: readonly LibrarySort[] = ['newest', 'oldest', 'rated', 'operation']
function isSort(value: string): value is LibrarySort {
    return SORTS.some(s => s === value)
}

// Same reasoning one filter over: the Kind select's two options are the
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
    /* Grid or table — the same query, the same selection, two layouts. Named
       `layout` rather than `view` because `filters.view` already means
       something else here (the rail's saved views), and the two being one word
       apart in the same component is how they would come to be confused. */
    const [layout, setLayout] = useState<'grid' | 'table'>('grid')
    const [operations, setOperations] = useState<Operation[]>([])
    const [tagVocab, setTagVocab] = useState<{ slug: string, label: string }[]>([])
    const [pickerError, setPickerError] = useState<string | null>(null)
    /* What just happened, shown where the inspector was. A save or a clean
       bulk run both end with the selection cleared and the panel unmounted,
       so neither had anywhere left to put its own confirmation — from the
       reviewer's seat, Save made the panel disappear and said nothing. */
    const [note, setNote] = useState<string | null>(null)
    /* The item open in the fullscreen viewer, held as an id rather than an
       index. An index would silently point at a different photograph after a
       refetch reordered or shortened the page; an id that is no longer here
       resolves to -1 below and closes the viewer, which is the honest
       outcome. */
    const [viewing, setViewing] = useState<string | null>(null)

    /* The console's height, measured rather than guessed.

       media-console.module.css gives .work one height and lets its three
       columns share it, which is what replaced the four independent 62vh/70vh
       scroll boxes the tab used to be. That height has to be "from the top of
       this box to the bottom of the window" — and nothing in CSS can say that,
       because the distance above the box is not a constant: the navbar's status
       strip collapses when the page scrolls, the quick-links rail above the
       tabs renders nothing, one row, or two depending on how many links J5 has,
       and the tab bar wraps on a narrow window. A hard `calc(100dvh - 300px)`
       would be right on exactly one machine, and wrong in the direction that
       puts the inspector's Save row back under the fold on the rest.

       Only the OFFSET is measured; the height falls out of it. Writing it back
       as a custom property keeps every rule that consumes it in the stylesheet
       where the rest of the layout lives. */
    const workRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const el = workRef.current
        if (!el) return

        let last = -1
        const measure = () => {
            /* Document-relative, not viewport-relative. getBoundingClientRect
               is measured from the top of the WINDOW, so on its own it would
               shrink the console by exactly as much as the reader had scrolled
               — the panel would shed height as you scrolled down it. Adding
               scrollY back gives the offset that does not move. */
            const top = el.getBoundingClientRect().top + window.scrollY
            const h = Math.round(window.innerHeight - top)
            /* Only on a real change. The property resizes the console, the
               console resizes the body, and the observer below fires on that —
               rewriting the same value each time is the feedback loop browsers
               report as "ResizeObserver loop completed with undelivered
               notifications". The offset itself cannot move when only .work's
               own height changes (everything it measures sits above it), so
               this converges after one pass. */
            if (Math.abs(h - last) < 1) return
            last = h
            el.style.setProperty('--console-h', `${h}px`)
        }

        measure()
        /* document.body, not .work: what moves this number is the chrome ABOVE
           the console — the quick-links rail appearing when its fetch lands,
           the tab bar wrapping, the navbar's strip collapsing — and none of
           that is inside the element being sized. */
        const observer = new ResizeObserver(measure)
        observer.observe(document.body)
        window.addEventListener('resize', measure)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [])

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

    /* The selection is page-scoped, so it has to die with the page.
       `selected` holds ids, the client only ever holds one page of them, and
       nothing used to clear it when the page or a filter changed — so paging on
       with four tiles ticked left the toolbar reading "4 SELECTED" over sixty
       different photographs, and the bulk panel still open on items the
       reviewer could no longer see or check.

       Keyed on `filters` and `page` rather than on `items`: `items` is a new
       array after every refetch, including the `refresh()` a partially failed
       bulk run does — and that one deliberately KEEPS the selection so the
       reviewer can see which ids failed and retry them. `filters` only takes a
       new identity when a filter actually changes. The guard is there because
       this fires once on mount, where an unconditional `new Set()` would be a
       fresh identity and a wasted render for nothing. */
    useEffect(() => {
        setSelected(prev => prev.size === 0 ? prev : new Set())
    }, [filters, page])

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

    /* Captions the table has saved since the last fetch.
       `items` is server state and does not change when the table PATCHes a
       caption, and the table deliberately does not refetch on every save — a
       refetch in the `nocaption` view would pull the row out from under the
       cursor mid-edit. Without this overlay the stale caption would still
       reach the inspector: select that same row and the inspector would show
       the old text and write it back on Save, quietly reverting the edit. */
    const [captionEdits, setCaptionEdits] = useState<Map<string, string>>(new Map())
    const rememberCaption = useCallback((id: string, caption: string) => {
        setCaptionEdits(prev => new Map(prev).set(id, caption))
    }, [])
    // A real fetch supersedes the overlay — it already carries these captions.
    // Guarded so it only re-renders when there is something to drop.
    useEffect(() => { setCaptionEdits(prev => prev.size === 0 ? prev : new Map()) }, [items])

    const shown = useMemo<AdminMediaAPI[]>(() => {
        if (captionEdits.size === 0) return items
        return items.map(item => {
            const edit = captionEdits.get(item.id)
            return edit === undefined ? item : { ...item, caption: edit }
        })
    }, [items, captionEdits])

    const pages = Math.ceil(total / PAGE_SIZE)
    /** Whether the loaded page is the whole of what the current filter matches
     *  — the difference between "Select all" being the truth and being a lie. */
    const pageIsEverything = total <= shown.length

    /* -1 covers both "nothing is open" and "what was open is no longer on this
       page" — a bulk run can move the viewed item out of the current filter
       while the viewer is up, and a viewer showing an item the grid behind it
       no longer contains is the state that would then step into the wrong
       photograph. Derived rather than stored, so the two can never disagree. */
    const viewIndex = viewing === null ? -1 : shown.findIndex(i => i.id === viewing)

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
            <div className={s.work} ref={workRef}>
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
                    campaign={filters.campaign}
                    campaignUnset={filters.campaignUnset}
                    operation={filters.operation}
                    operationUnset={filters.operationUnset}
                    mission={filters.mission}
                    onView={v => {
                        setParam('view', v)
                        setParam('year', null)
                        setParam('campaign', null)
                        setParam('operation', null)
                        setParam('mission', null)
                        // A saved view replaces a tree selection outright — otherwise
                        // clicking "All media" after the rail's Unknown node would
                        // leave *Unset stuck true and silently keep filtering.
                        setParam('yearUnset', false)
                        setParam('campaignUnset', false)
                        setParam('operationUnset', false)
                    }}
                    onNode={selectNode}
                />

                <div className={s.centre}>
                    <div className={s.tools}>
                        <Field
                            label='Search'
                            type='search'
                            prefix='/'
                            clearable
                            placeholder='Search captions, authors, filenames…'
                            value={filters.q ?? ''}
                            onChange={v => setParam('q', v || null)}
                            className={s.toolSearch}
                        />
                        <Select
                            label='Sort'
                            value={filters.sort}
                            onChange={v => { if (isSort(v)) setParam('sort', v) }}
                            options={[
                                { value: 'newest', label: 'Newest first' },
                                { value: 'oldest', label: 'Oldest first' },
                                { value: 'rated', label: 'Top rated' },
                                { value: 'operation', label: 'By operation' },
                            ]}
                            className={s.toolSort}
                        />
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
                        <Select
                            label='Tag'
                            searchable
                            value={filters.tag ?? ''}
                            onChange={v => setParam('tag', v || null)}
                            options={[
                                { value: '', label: 'Any tag' },
                                ...(facets?.tags ?? []).map(t => ({ value: t.slug, label: t.label, note: t.count.toLocaleString('en-AU') })),
                            ]}
                            className={s.toolTag}
                        />
                        <Select
                            label='Author'
                            searchable
                            value={filters.author ?? ''}
                            onChange={v => setParam('author', v || null)}
                            options={[
                                { value: '', label: 'Any author' },
                                ...(facets?.authors ?? []).map(a => ({ value: a.name, label: a.name, note: a.count.toLocaleString('en-AU') })),
                            ]}
                            className={s.toolAuthor}
                        />
                        <Select
                            label='Kind'
                            value={filters.kind ?? ''}
                            // An explicit kind wins over the Videos view —
                            // buildLibraryFilter applies it after the view for
                            // exactly that reason, so the grid can never
                            // disagree with the chip on screen.
                            onChange={v => setParam('kind', isKind(v) ? v : null)}
                            options={[
                                { value: '', label: 'Any kind' },
                                { value: 'image', label: 'Images' },
                                { value: 'video', label: 'Videos' },
                            ]}
                            className={s.toolKind}
                        />
                        {/* Hidden in the Health view, which replaces the list
                            entirely — a layout toggle over a report that has
                            neither layout, and a select-all over a report with
                            nothing to select, do nothing but invite a click. */}
                        {filters.view !== 'health' && (
                            <div className={c.seg} role='group' aria-label='Layout'>
                                <button
                                    type='button'
                                    className={`${c.segItem} ${layout === 'grid' ? c.segItemOn : ''}`}
                                    aria-pressed={layout === 'grid'}
                                    onClick={() => setLayout('grid')}
                                >
                                    Grid
                                </button>
                                <button
                                    type='button'
                                    className={`${c.segItem} ${layout === 'table' ? c.segItemOn : ''}`}
                                    aria-pressed={layout === 'table'}
                                    onClick={() => setLayout('table')}
                                >
                                    Table
                                </button>
                            </div>
                        )}
                        {/* The two resets, joined into one control: they undo
                            the two things this toolbar sets, they always sit
                            together, and as loose buttons they read as two
                            unrelated actions that happen to be adjacent. In the
                            health view the selection button is not rendered and
                            the group is a single button, which is correct — a
                            report has nothing to select. */}
                        <div className={c.group}>
                            {filters.view !== 'health' && (
                                <>
                                {/* One button, two jobs. Assigning an operation
                                    to a folder's worth of photographs is this
                                    tab's main task, and shift-click still asked
                                    the reviewer to find both ends of the range.
                                    The accessible name is computed rather than
                                    fixed, because the action itself changes: a
                                    name that still said "Select all" while the
                                    button cleared the selection would be worse
                                    than no name at all.

                                    The label tells the truth about reach. The
                                    library is paged at PAGE_SIZE and the client
                                    holds only the ids on screen, so this can
                                    only ever select what is loaded. For the case
                                    that prompted it — one operation's folder of
                                    27 items — that IS all of them, and it says
                                    so. When the filter matches more than a page
                                    it says "Select page" instead, so the word
                                    "all" is never a claim about 4,781 items it
                                    cannot make. */}
                                <button
                                    type='button'
                                    className={c.btn}
                                    disabled={selected.size === 0 && shown.length === 0}
                                    aria-label={
                                        selected.size > 0
                                            ? `Clear the selection of ${selected.size} items`
                                            : pageIsEverything
                                                ? `Select all ${shown.length} items`
                                                : `Select the ${shown.length} items on this page`
                                    }
                                    title={
                                        selected.size > 0 || pageIsEverything
                                            ? undefined
                                            : `Selects the ${shown.length} items on this page. ${total.toLocaleString('en-AU')} match the current filters — selecting across pages is not supported.`
                                    }
                                    onClick={() => setSelected(prev => (
                                        prev.size > 0 ? new Set() : new Set(shown.map(i => i.id))
                                    ))}
                                >
                                    {selected.size > 0
                                        ? `Clear (${selected.size})`
                                        : pageIsEverything ? 'Select all' : 'Select page'}
                                </button>
                                </>
                            )}
                            <button
                                type='button'
                                className={`${c.btn} ${c.btnGhost}`}
                                onClick={() => { clear(); setSelected(new Set()) }}
                            >
                                Clear filters
                            </button>
                        </div>
                        {/* Last in the row, and last in the tab order with it,
                            so the filter inputs and the actions that undo them
                            run uninterrupted from the left and the row ends on
                            the numbers they produced. The selected line is
                            rendered only when there is a selection — no
                            reserved empty row, which would put the item count
                            off the buttons' baseline for the whole time nothing
                            is picked. */}
                        <div className={s.count}>
                            <span>{total.toLocaleString('en-AU')} ITEMS</span>
                            {selected.size > 0 && <span>{selected.size} SELECTED</span>}
                        </div>
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
                        <div className={s.scrollPane}>
                            {/* HealthView is a plain padded div with no scroll
                                container of its own. That was survivable while
                                the console grew to fit it; now that the console
                                has one fixed height, an uncontained report
                                would simply paint over the pager and the panel
                                edge below it. */}
                            <HealthView onChanged={refresh} />
                        </div>
                    ) : loading ? <TacticalSkeleton /> : error && items.length === 0 ? null : layout === 'table' ? (
                        <MediaTable
                            items={shown}
                            selected={selected}
                            // Server-side, every time: the header sets the
                            // same `sort` the select above does and the list
                            // refetches. Sorting the sixty rows on screen
                            // would only sort this page.
                            sort={filters.sort}
                            onSort={next => setParam('sort', next)}
                            onToggle={toggle}
                            onRange={range}
                            onCaptionSaved={rememberCaption}
                        />
                    ) : (
                        <MediaGrid
                            items={shown}
                            selected={selected}
                            onToggle={toggle}
                            onRange={range}
                            // Double-click and Enter open the viewer. This
                            // used to be `toggle` — the same thing a single
                            // click does — so the console's largest view of a
                            // photograph was the inspector's 320px preview.
                            onOpen={setViewing}
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
                        // `shown`, not `items`: a caption the table saved is
                        // not in the server state yet, and the inspector
                        // would otherwise re-send the pre-edit text on Save.
                        const item = shown.find(i => selected.has(i.id))
                        /* Falls through to the empty aside when the selected
                           id is not on this page — it used to render null,
                           which blanked the whole 320px column while the
                           toolbar still said "1 SELECTED". That is the tab's
                           most common journey, not an edge case: a reviewer
                           in `Not linked to an operation` clicks a tile, assigns
                           an operation and saves; the save succeeds, so the item
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

            {/* Outside .work, because the viewer is position: fixed over the
                whole page and .work is the grid that owns the three columns —
                nesting it inside would put a fixed overlay inside a scrolling
                grid cell for no reason. */}
            {viewIndex >= 0 && (
                <Viewer
                    items={shown}
                    index={viewIndex}
                    onIndex={next => setViewing(shown[next].id)}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    )
}
