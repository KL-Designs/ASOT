'use client'

import { useCallback, useEffect, useState } from 'react'
import { Typography, LinearProgress } from '@mui/material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import { Field } from '@/app/dashboard/j5/controls/Field'
import { Select, type SelectOption } from '@/app/dashboard/j5/controls/Select'
import { ACCEPTED_IMAGE_MIME, checkFile } from '@/lib/gallery/limits'
import FocalPicker from './FocalPicker'
import mc from '@/styles/media-console.module.css'
import s from '@/styles/j5-console.module.css'
import c from '@/styles/j5-controls.module.css'

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
    // Shown beside the Set button rather than in the feedback line at the top
    // of the tab, which is a full library grid's scroll away from the button
    // that caused it — an error up there read as the button doing nothing.
    const [setError, setSetError] = useState<string | null>(null)

    /* Upload-a-new-one, the other way to replace the pick. The upload becomes
       a library item first (POST /api/gallery/sotm), so it lands in the
       archive and in Past Winners like any picked one. */
    const [uploadOpen, setUploadOpen] = useState(false)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadPreview, setUploadPreview] = useState<string | null>(null)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [uploadCredit, setUploadCredit] = useState('')
    const [uploadCaption, setUploadCaption] = useState('')
    const [uploadOperation, setUploadOperation] = useState('')
    const [operations, setOperations] = useState<{ id: string, title: string, date: string | null }[] | null>(null)

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
        setSetError(null)
        setLibraryPage(0)
        setUploadOpen(false)
        setPickerOpen(true)
    }, [])

    // The operation list is the gallery's own (/api/gallery/operations), gated
    // on the gallery.* keys rather than departmentLeads.j5. A lead without
    // any of those just doesn't get the Operation field; the upload files
    // under Unknown and J5 can move it from the Media tab.
    useEffect(() => {
        if (!uploadOpen || operations !== null) return
        fetch('/api/gallery/operations')
            .then(r => (r.ok ? r.json() : null))
            .then(data => setOperations(Array.isArray(data?.operations) ? data.operations : []))
            .catch(() => setOperations([]))
    }, [uploadOpen, operations])

    // Revoke the object URL when it is replaced or the tab unmounts.
    useEffect(() => () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview) }, [uploadPreview])

    function resetUpload() {
        setUploadFile(null)
        setUploadPreview(null)
        setUploadError(null)
        setUploadCredit('')
        setUploadCaption('')
        setUploadOperation('')
    }

    function openUpload() {
        resetUpload()
        setPickerOpen(false)
        setUploadOpen(true)
    }

    function closeUpload() {
        setUploadOpen(false)
        resetUpload()
    }

    function chooseFile(file: File | null | undefined) {
        if (!file) return
        const failure = checkFile({ mime: file.type, bytes: file.size })
        const notStill = !failure && !ACCEPTED_IMAGE_MIME.has(file.type)
        if (failure || notStill) {
            setUploadFile(null)
            setUploadPreview(null)
            setUploadError(notStill ? 'Only still images can be the screenshot of the month.' : failure!.message)
            return
        }
        setUploadError(null)
        setUploadFile(file)
        setUploadPreview(URL.createObjectURL(file))
    }

    async function handleUpload() {
        if (!uploadFile || !uploadCredit.trim()) return
        setSaving(true)
        try {
            const body = new FormData()
            body.set('file', uploadFile)
            body.set('credit', uploadCredit.trim())
            if (uploadCaption.trim()) body.set('caption', uploadCaption.trim())
            if (uploadOperation) body.set('operationId', uploadOperation)
            const res = await fetch('/api/gallery/sotm', { method: 'POST', body })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                showFeedback('error', data.error ?? 'Could not upload the screenshot.')
            } else {
                showFeedback('success', 'Uploaded and set as Screenshot of the Month. It is in the gallery archive too.')
                closeUpload()
                await Promise.all([loadCurrent(), loadHistory()])
            }
        } catch {
            showFeedback('error', 'Network error. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const operationOptions: SelectOption[] = [
        { value: '', label: 'Unknown' },
        ...(operations ?? []).map(op => ({
            value: op.id,
            label: op.title,
            note: op.date ? String(new Date(op.date).getFullYear()) : undefined,
        })),
    ]

    const closePicker = useCallback(() => {
        setPickerOpen(false)
        setSelectedId(null)
        setCredit('')
    }, [])

    function pick(item: SotmMediaTileAPI) {
        setSelectedId(item.id)
        setSetError(null)
        // Prefill from the item's own author, but never over a credit J5
        // already typed — a different pick should not erase it.
        if (!credit.trim() && item.authorName) setCredit(item.authorName)
    }

    async function handleSet() {
        if (!selectedId) { setSetError('Pick a screenshot from the library first.'); return }
        if (!credit.trim()) { setSetError('Enter who took it in Credit (photographer) first.'); return }
        setSetError(null)
        setSaving(true)
        try {
            const res = await fetch('/api/gallery/sotm', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId: selectedId, credit: credit.trim() }),
            })
            const data = await res.json()
            if (!res.ok) {
                setSetError(data.error ?? 'Could not set the screenshot of the month.')
            } else {
                showFeedback('success', 'Screenshot of the Month updated.')
                closePicker()
                await Promise.all([loadCurrent(), loadHistory()])
            }
        } catch {
            setSetError('Network error. Please try again.')
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
                            <button type='button' className={`${c.btn} ${pickerOpen ? c.btnGhost : ''}`} onClick={pickerOpen ? closePicker : openPicker}>
                                {pickerOpen ? 'Cancel' : 'Replace from library'}
                            </button>
                            <button type='button' className={`${c.btn} ${uploadOpen ? c.btnGhost : ''}`} onClick={uploadOpen ? closeUpload : openUpload}>
                                {uploadOpen ? 'Cancel upload' : 'Upload new'}
                            </button>
                            {sotm && (
                                <button type='button' className={`${c.btn} ${c.btnDanger}`} disabled={clearing} onClick={handleClear}>
                                    {clearing ? 'Clearing…' : 'Clear'}
                                </button>
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

            {/* Focal point — keyed on when the pick was set, so choosing a
                different screenshot starts the picker from that one's state. */}
            {canManage && sotm && (
                <section className={s.zone}>
                    <div className={s.zoneHead}>
                        <Typography className={s.zoneTitle}>Focal Point</Typography>
                    </div>
                    <FocalPicker
                        key={sotm.setAt}
                        initialX={sotm.focalX}
                        initialY={sotm.focalY}
                        onSaved={focal => {
                            setSotm(prev => (prev ? { ...prev, focalX: focal.focalX, focalY: focal.focalY } : prev))
                            showFeedback('success', focal.focalX === undefined ? 'Focal point cleared. Crops are centred again.' : 'Focal point saved.')
                        }}
                        onError={msg => showFeedback('error', msg)}
                    />
                </section>
            )}

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
                                        onClick={() => pick(item)}
                                    >
                                        {/* .tileBox is the positioned box the caption
                                            and badge anchor to. Without it they anchored
                                            to the page, and the last caption painted a
                                            full-width bar over the Set as SOTM button. */}
                                        <span className={mc.tileBox}>
                                            <img src={item.src} alt='' loading='lazy' decoding='async' />
                                            {selectedId === item.id && <span className={mc.badges}><span className={mc.badge}>Selected</span></span>}
                                            <span className={mc.cap}>{item.caption || item.opLabel || 'Untitled'}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {hasMoreLibrary && (
                                <div className={mc.pager}>
                                    <button type='button' className={c.btn} disabled={libraryLoading} onClick={() => setLibraryPage(p => p + 1)}>
                                        Load more
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    <div className='flex gap-3 items-end flex-wrap mt-4'>
                        <Field
                            label='Credit (photographer)'
                            value={credit}
                            onChange={v => { setCredit(v); setSetError(null) }}
                            placeholder='e.g. Cpl. Smith'
                            autoComplete='off'
                            className='min-w-[240px]'
                        />
                        {/* Enabled whenever it is not mid-save: a disabled
                            button gives no reason, and that is how it came to
                            look broken. handleSet says what is missing. */}
                        <button
                            type='button'
                            className={`${c.btn} ${c.btnPrimary}`}
                            disabled={saving}
                            onClick={handleSet}
                        >
                            {saving ? 'Saving…' : 'Set as SOTM'}
                        </button>
                        {setError && <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)', alignSelf: 'center' }}>{setError}</Typography>}
                    </div>
                </section>
            )}

            {/* Replace by uploading */}
            {canManage && uploadOpen && (
                <section className={s.zone}>
                    <div className={s.zoneHead}>
                        <Typography className={s.zoneTitle}>Upload a replacement</Typography>
                        <span className={s.zoneNote} style={{ marginLeft: 'auto' }}>A still image up to 20 MB. It is added to the gallery archive and becomes the new pick.</span>
                    </div>

                    <div className='flex flex-col md:flex-row gap-5'>
                        <label
                            className={mc.preview}
                            style={{ maxWidth: 420, width: '100%', minHeight: 200, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]) }}
                        >
                            {uploadPreview
                                ? <img src={uploadPreview} alt='Upload preview' />
                                : <span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.6)', padding: 16, textAlign: 'center' }}>Drop an image here, or click to choose one.</span>}
                            <input
                                type='file'
                                accept={[...ACCEPTED_IMAGE_MIME].join(',')}
                                hidden
                                onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = '' }}
                            />
                        </label>

                        <div className='flex flex-col gap-3' style={{ flex: 1, minWidth: 240 }}>
                            {uploadFile && <Typography sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)' }}>{uploadFile.name}</Typography>}
                            {uploadError && <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)' }}>{uploadError}</Typography>}
                            <Field label='Credit (photographer)' value={uploadCredit} onChange={setUploadCredit} placeholder='e.g. Cpl. Smith' />
                            <Field label='Caption (optional)' value={uploadCaption} onChange={setUploadCaption} />
                            {operations && operations.length > 0 && (
                                <Select label='Operation (optional)' searchable value={uploadOperation} onChange={setUploadOperation} options={operationOptions} />
                            )}
                            <div>
                                <button
                                    type='button'
                                    className={`${c.btn} ${c.btnPrimary}`}
                                    disabled={saving || !uploadFile || !uploadCredit.trim()}
                                    onClick={handleUpload}
                                >
                                    {saving ? 'Uploading…' : 'Upload and set as SOTM'}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Past winners */}
            {canManage && (
                <section className={s.zone}>
                    <div className={s.zoneHead}>
                        <Typography className={s.zoneTitle}>Past winners ({history.length})</Typography>
                        <span className={s.zoneNote} style={{ marginLeft: 'auto' }}>Newest first. A pick migrated from the old sotm/ folder joins this list when it is replaced, dated by when it was set.</span>
                    </div>

                    {historyLoading ? <TacticalSkeleton rows={2} /> : history.length === 0 ? (
                        <div className={mc.empty}>No past winners recorded yet.</div>
                    ) : (
                        <div className={mc.grid}>
                            {history.map(item => (
                                <div key={item.id} className={mc.tile}>
                                    <span className={mc.tileBox}>
                                        <img src={item.src} alt='' loading='lazy' decoding='async' />
                                        <span className={mc.cap}>{fmtDate(item.sotmAt)}{item.sotmCredit ? ` — ${item.sotmCredit}` : ''}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
