'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, TextField, Typography, LinearProgress } from '@mui/material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import mc from '@/styles/media-console.module.css'
import s from '@/styles/j5-console.module.css'

/* ============================================================================
   The Screenshot of the Month tab.

   Replaces a tab that stored its own dedicated upload — a separate file, a
   separate date field, an operation search box — none of it connected to the
   archive the rest of the console curates from. This one points SOTM at a
   `gallery_media` document instead (PUT /api/gallery/sotm, built alongside
   this), the same way the Featured tab points `featuredOrder` at one: pick
   from the library rather than upload a duplicate copy of a photo that may
   already be in it.

   The route this reads from deliberately keeps departmentLeads.j5 as its
   gate rather than gallery.manage, which is why the library/history queries
   below live on that same route (view=library / view=history) instead of
   reusing /api/gallery/admin/library like the Featured tab does — that route
   is gallery.manage-gated, and a J5 lead without gallery.manage would 403 on
   the very thing this tab exists for. See the route's own comment.
   ============================================================================ */

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.27)',
    color: 'rgba(219,0,29,0.8)',
    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.08)' },
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        color: '#ededed',
        background: 'rgba(255,255,255,0.04)',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem', color: 'rgba(237,237,237,0.4)' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    '& .MuiInputBase-input': { color: '#ededed' },
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SotmTab({ canManage }: { canManage: boolean }) {
    const [sotm, setSotm] = useState<ScreenshotOfMonth | null | undefined>(undefined)
    const [history, setHistory] = useState<SotmMediaTileAPI[]>([])
    const [historyLoading, setHistoryLoading] = useState(true)

    const [pickerOpen, setPickerOpen] = useState(false)
    const [library, setLibrary] = useState<SotmMediaTileAPI[]>([])
    const [libraryPage, setLibraryPage] = useState(0)
    const [libraryTotal, setLibraryTotal] = useState(0)
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [credit, setCredit] = useState('')

    const [saving, setSaving] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

    function showFeedback(type: 'success' | 'error', msg: string) {
        setFeedback({ type, msg })
        setTimeout(() => setFeedback(null), 5000)
    }

    const loadCurrent = useCallback(async () => {
        try {
            const res = await fetch('/api/gallery/sotm')
            const data = await res.json()
            setSotm(data ?? null)
        } catch {
            setSotm(null)
        }
    }, [])

    const loadHistory = useCallback(async () => {
        if (!canManage) { setHistoryLoading(false); return }
        setHistoryLoading(true)
        try {
            const res = await fetch('/api/gallery/sotm?view=history')
            const data: SotmMediaTileAPI[] = res.ok ? await res.json() : []
            setHistory(data)
        } catch {
            setHistory([])
        } finally {
            setHistoryLoading(false)
        }
    }, [canManage])

    const loadLibrary = useCallback(async (page: number) => {
        setLibraryLoading(true)
        try {
            const res = await fetch(`/api/gallery/sotm?view=library&page=${page}`)
            const data = await res.json()
            setLibrary(prev => page === 0 ? (data.items ?? []) : [...prev, ...(data.items ?? [])])
            setLibraryTotal(data.total ?? 0)
        } finally {
            setLibraryLoading(false)
        }
    }, [])

    useEffect(() => { loadCurrent() }, [loadCurrent])
    useEffect(() => { loadHistory() }, [loadHistory])
    // Reloads on every open, not just the first: the archive keeps changing
    // (ratings, new publishes) while the picker sits closed, and the page
    // reset means reopening always starts back at the top-rated page.
    useEffect(() => {
        if (pickerOpen) loadLibrary(libraryPage)
    }, [pickerOpen, libraryPage, loadLibrary])

    const openPicker = useCallback(() => {
        setSelectedId(null)
        setCredit('')
        setLibraryPage(0)
        setPickerOpen(true)
    }, [])

    const closePicker = useCallback(() => {
        setPickerOpen(false)
        setSelectedId(null)
        setCredit('')
    }, [])

    async function handleSet() {
        if (!selectedId || !credit.trim()) return
        setSaving(true)
        try {
            const res = await fetch('/api/gallery/sotm', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId: selectedId, credit: credit.trim() }),
            })
            const data = await res.json()
            if (!res.ok) {
                showFeedback('error', data.error ?? 'Could not set the screenshot of the month.')
            } else {
                showFeedback('success', 'Screenshot of the Month updated.')
                closePicker()
                await Promise.all([loadCurrent(), loadHistory()])
            }
        } catch {
            showFeedback('error', 'Network error. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    async function handleClear() {
        setClearing(true)
        try {
            const res = await fetch('/api/gallery/sotm', { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) {
                showFeedback('error', data.error ?? 'Failed to clear.')
            } else {
                showFeedback('success', 'Screenshot of the Month cleared.')
                await Promise.all([loadCurrent(), loadHistory()])
            }
        } catch {
            showFeedback('error', 'Network error. Please try again.')
        } finally {
            setClearing(false)
        }
    }

    const hasMoreLibrary = library.length < libraryTotal

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col'>
            {(saving || clearing) && (
                <LinearProgress sx={{ mb: 2, backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />
            )}

            {feedback && (
                <Typography sx={{ fontSize: '0.75rem', color: feedback.type === 'success' ? 'var(--live)' : 'var(--red-hi)', mb: 2 }}>
                    {feedback.msg}
                </Typography>
            )}

            {/* Current pick */}
            <section className={s.zone}>
                <div className={s.zoneHead}>
                    <Typography className={s.zoneTitle}>Current Screenshot of the Month</Typography>
                    {canManage && (
                        <>
                            <Button size='small' variant='outlined' onClick={pickerOpen ? closePicker : openPicker} sx={redBtn}>
                                {pickerOpen ? 'Cancel' : 'Replace from library'}
                            </Button>
                            {sotm && (
                                <Button size='small' variant='outlined' disabled={clearing} onClick={handleClear} sx={redBtn}>
                                    {clearing ? 'Clearing…' : 'Clear'}
                                </Button>
                            )}
                        </>
                    )}
                </div>

                {sotm === undefined ? (
                    <TacticalSkeleton rows={1} />
                ) : !sotm ? (
                    <div className={mc.empty}>No screenshot of the month set.</div>
                ) : (
                    <div className='flex flex-col md:flex-row gap-5'>
                        <div className={mc.preview} style={{ maxWidth: 420, width: '100%', flexShrink: 0 }}>
                            <img src='/api/gallery/sotm/image' alt='Screenshot of the Month' />
                        </div>
                        <dl className={mc.facts}>
                            <dt>Credit</dt><dd>{sotm.credit}</dd>
                            <dt>Taken</dt><dd>{fmtDate(sotm.dateTaken)}</dd>
                            <dt>Set</dt><dd>{fmtDate(sotm.setAt)}</dd>
                            {sotm.operationTitle && <><dt>Operation</dt><dd>{sotm.operationTitle}</dd></>}
                            <dt>Source</dt>
                            <dd>{sotm.mediaId ? 'Media library' : 'Legacy upload (predates the library picker)'}</dd>
                        </dl>
                    </div>
                )}
            </section>

            {/* Replace from library */}
            {canManage && pickerOpen && (
                <section className={s.zone}>
                    <div className={s.zoneHead}>
                        <Typography className={s.zoneTitle}>Choose a replacement</Typography>
                        <span className={s.zoneNote} style={{ marginLeft: 'auto' }}>Stills only, top rated first. Pick one, then credit its photographer.</span>
                    </div>

                    {libraryLoading && library.length === 0 ? <TacticalSkeleton rows={4} /> : library.length === 0 ? (
                        <div className={mc.empty}>Nothing in the library to pick from yet.</div>
                    ) : (
                        <>
                            <div className={mc.grid}>
                                {library.map(item => (
                                    <button
                                        type='button'
                                        key={item.id}
                                        className={`${mc.tile} ${selectedId === item.id ? mc.tileOn : ''}`}
                                        onClick={() => setSelectedId(item.id)}
                                    >
                                        <img src={item.src} alt='' loading='lazy' decoding='async' />
                                        {selectedId === item.id && <span className={mc.badge}>Selected</span>}
                                        <span className={mc.cap}>{item.caption || item.opLabel || 'Untitled'}</span>
                                    </button>
                                ))}
                            </div>
                            {hasMoreLibrary && (
                                <div className={mc.pager}>
                                    <Button size='small' variant='outlined' disabled={libraryLoading} onClick={() => setLibraryPage(p => p + 1)} sx={redBtn}>
                                        Load more
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    <div className='flex gap-3 items-end flex-wrap mt-4'>
                        <TextField
                            label='Credit (photographer)'
                            value={credit}
                            onChange={e => setCredit(e.target.value)}
                            size='small'
                            sx={{ ...inputSx, minWidth: 240 }}
                            placeholder='e.g. Cpl. Smith'
                        />
                        <Button
                            variant='contained'
                            disabled={saving || !selectedId || !credit.trim()}
                            onClick={handleSet}
                            sx={{ background: 'var(--red)', '&:hover': { background: 'var(--red)' } }}
                        >
                            {saving ? 'Saving…' : 'Set as SOTM'}
                        </Button>
                    </div>
                </section>
            )}

            {/* Past winners */}
            {canManage && (
                <section className={s.zone}>
                    <div className={s.zoneHead}>
                        <Typography className={s.zoneTitle}>Past winners ({history.length})</Typography>
                        <span className={s.zoneNote} style={{ marginLeft: 'auto' }}>Newest first. A file migrated from the old sotm/ folder has no recorded date and will not appear here until it is next set.</span>
                    </div>

                    {historyLoading ? <TacticalSkeleton rows={2} /> : history.length === 0 ? (
                        <div className={mc.empty}>No past winners recorded yet.</div>
                    ) : (
                        <div className={mc.grid}>
                            {history.map(item => (
                                <div key={item.id} className={mc.tile}>
                                    <img src={item.src} alt='' loading='lazy' decoding='async' />
                                    <span className={mc.cap}>{fmtDate(item.sotmAt)}{item.sotmCredit ? ` — ${item.sotmCredit}` : ''}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
