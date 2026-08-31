'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import Button from '@/components/ui/Button'
import { ACCEPT_ATTRIBUTE, MAX_ITEMS_PER_SUBMISSION, checkFile, checkItemCount, kindForMime } from '@/lib/gallery/limits'
import { parseEmbedUrl, type ParsedEmbed } from '@/lib/gallery/embeds'
import type { GalleryStatus } from '@/lib/gallery/status'
import { runUploads, sendOverXhr, type SendFn, type UploadJob, type UploadState } from './upload'
import ItemCard from './_components/ItemCard'
import s from '@/styles/gallery.module.css'
import ui from '@/styles/ui.module.css'

export type Draft = {
    localId: string
    file?: File
    embed?: ParsedEmbed
    /** Object URL for a still, a canvas-grabbed frame for a video, a provider
     *  thumbnail for an embed. Null until it resolves. */
    thumb: string | null
    caption: string
    tags: string[]
    /** Overrides the batch operation for this one item. Null means "use the
     *  batch default", not "unknown" — the string `'unknown'` is the explicit
     *  override that leaves the item undated. */
    operationId: string | null
    durationSec?: number
}

export type Operation = { id: string, title: string, date: string | null }
export type Tag = { slug: string, label: string }

type Phase = 'compose' | 'uploading' | 'done'
type Reject = { id: string, name: string, reason: string }
type ServerStatus = { status: GalleryStatus, processingError: string | null }

/**
 * Reads a video's duration and first frame in the browser.
 *
 * The duration is why this exists: refusing a twelve-minute clip here costs the
 * member nothing, and refusing it after 400MB has crossed their connection
 * costs them the upload. The frame is a bonus — it gives the card a thumbnail
 * without waiting for the server to make a poster.
 *
 * The blob URL this creates to probe the file is revoked as soon as it has
 * done its job — the frame it hands back is a `data:` URI from the canvas, so
 * nothing downstream needs the blob to stay alive, and leaving it registered
 * pins the whole file (up to 500MB, up to twenty of them) in memory for the
 * rest of the session.
 *
 * Also bounded by a timeout: a stalled read, or a container the browser
 * neither loads nor errors on, would otherwise leave the promise pending
 * forever — and `addFiles` awaits this in a sequential loop, so one stuck file
 * would silently stop every file after it from being added. An unreadable
 * duration is not a refusal here either; the server re-checks with ffprobe
 * before it spends any CPU transcoding.
 */
function readVideo(file: File): Promise<{ durationSec: number, thumb: string | null }> {
    return new Promise(resolve => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true
        const objectUrl = URL.createObjectURL(file)
        video.src = objectUrl

        let settled = false
        const finish = (result: { durationSec: number, thumb: string | null }) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            URL.revokeObjectURL(objectUrl)
            resolve(result)
        }

        const timer = setTimeout(() => finish({ durationSec: 0, thumb: null }), 4000)

        video.onerror = () => finish({ durationSec: 0, thumb: null })

        video.onloadedmetadata = () => {
            const durationSec = Number.isFinite(video.duration) ? video.duration : 0
            // Seek a second in: frame zero of a game capture is very often a
            // black loading screen.
            video.currentTime = Math.min(1, durationSec / 2)
            video.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas')
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                    canvas.getContext('2d')!.drawImage(video, 0, 0)
                    finish({ durationSec, thumb: canvas.toDataURL('image/jpeg', 0.6) })
                } catch {
                    finish({ durationSec, thumb: null })
                }
            }
        }
    })
}

/** YouTube serves a stable, unauthenticated thumbnail off the video id alone.
 *  Twitch has no equivalent without an API token, so a Twitch draft falls
 *  back to the provider mark ItemCard draws when `thumb` is null. */
function embedThumb(embed: ParsedEmbed): string | null {
    return embed.provider === 'youtube' ? `https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg` : null
}

/** Only the photo path's thumb is a blob URL — a video's is a canvas `data:`
 *  URI and an embed's is a provider URL, so revoking those would be a silent
 *  no-op. Checked by prefix rather than by re-deriving "is this a photo" from
 *  the draft's other fields, which would drift the moment either path changes
 *  what it stores. */
function revokeThumb(draft: Draft) {
    if (draft.thumb?.startsWith('blob:')) URL.revokeObjectURL(draft.thumb)
}

/** Builds the request body for one draft. Shared between the initial submit
 *  and a Retry, so the two can never disagree about what a draft sends. */
function buildJob(draft: Draft, batchId: string, batchOperationId: string): UploadJob {
    const operationId = draft.operationId ?? batchOperationId

    if (draft.file) {
        const form = new FormData()
        form.set('file', draft.file)
        form.set('batchId', batchId)
        form.set('caption', draft.caption)
        form.set('tags', JSON.stringify(draft.tags))
        form.set('operationId', operationId)
        return { localId: draft.localId, body: form }
    }

    return {
        localId: draft.localId,
        body: {
            json: {
                embedUrl: draft.embed!.canonicalUrl,
                batchId,
                caption: draft.caption,
                tags: draft.tags,
                operationId,
            },
        },
    }
}

/** What a row reads while the batch is under way — driven by the local upload
 *  state until an item lands, then by whatever the monitor last polled. */
function describeRow(local: UploadState | undefined, server: ServerStatus | undefined): {
    label: string
    tone: 'progress' | 'ok' | 'warn' | 'error'
} {
    // Concurrency is 2, so a batch of twenty spends most of its life with most
    // items not yet handed to a worker — that is still "queued", not
    // "processing", which is a claim about what the server is doing.
    if (!local || local.phase === 'queued') return { label: 'Queued', tone: 'progress' }
    if (local.phase === 'failed') return { label: local.error ?? 'Upload failed.', tone: 'error' }
    if (local.phase === 'uploading') return { label: `Uploading ${Math.round(local.progress * 100)}%`, tone: 'progress' }
    if (server?.processingError) return { label: 'Needs another look', tone: 'warn' }
    if (server && server.status !== 'processing') return { label: 'Queued for review', tone: 'ok' }
    return { label: 'Processing', tone: 'progress' }
}

export default function SubmitClient({ authorName }: { authorName: string }) {
    const [operations, setOperations] = useState<Operation[]>([])
    const [tags, setTags] = useState<Tag[]>([])

    const [drafts, setDrafts] = useState<Draft[]>([])
    const [batchOperationId, setBatchOperationId] = useState<string | null>(null)
    const [batchTags, setBatchTags] = useState<string[]>([])
    const [rejects, setRejects] = useState<Reject[]>([])

    const [embedText, setEmbedText] = useState('')
    const [embedError, setEmbedError] = useState<string | null>(null)

    const [phase, setPhase] = useState<Phase>('compose')
    const [batchId, setBatchId] = useState<string | null>(null)
    const [uploadState, setUploadState] = useState<Record<string, UploadState>>({})
    const [serverStatus, setServerStatus] = useState<Record<string, ServerStatus>>({})
    // Bumped by Retry to restart the poll effect below — see its own comment
    // for why the timer can otherwise stop itself.
    const [pollGen, setPollGen] = useState(0)

    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Server ids come back from the send call, not from onChange — this is
    // where they're kept so the monitor can match a polled item back to the
    // card it belongs to.
    const serverIdByLocalId = useRef<Record<string, string>>({})
    const uploadStateRef = useRef(uploadState)
    useEffect(() => { uploadStateRef.current = uploadState }, [uploadState])

    // For the unmount cleanup below, which needs whatever `drafts` holds at
    // teardown time rather than whatever it held when the effect was set up.
    const draftsRef = useRef(drafts)
    useEffect(() => { draftsRef.current = drafts }, [drafts])

    // Every blob URL this component hands out belongs to exactly one draft's
    // thumbnail, and none of them survive the component itself.
    useEffect(() => () => { draftsRef.current.forEach(revokeThumb) }, [])

    useEffect(() => {
        fetch('/api/gallery/operations')
            .then(r => r.ok ? r.json() : { operations: [] })
            .then((json: { operations: Operation[] }) => {
                const list = json.operations ?? []
                setOperations(list)
                // Most recent first from the API — the first one whose date has
                // already passed is the default. Filtering to past dates matters:
                // without it, an operation scheduled for next week would become
                // the default and misdate everything in the batch.
                const now = Date.now()
                const recent = list.find(o => o.date && new Date(o.date).getTime() <= now)
                setBatchOperationId(recent ? recent.id : 'unknown')
            })
            .catch(() => setBatchOperationId('unknown'))

        fetch('/api/gallery/tags')
            .then(r => r.ok ? r.json() : { tags: [] })
            .then((json: { tags: Tag[] }) => setTags(json.tags ?? []))
            .catch(() => {})
    }, [])

    /* ---------- monitor: polls the batch while anything is in flight ------ */

    useEffect(() => {
        if (phase !== 'uploading' || !batchId) return
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | undefined

        async function poll() {
            try {
                const res = await fetch(`/api/gallery/submissions/status?batch=${batchId}`)
                if (res.ok && !cancelled) {
                    const json: { items: { id: string, status: GalleryStatus, processingError: string | null }[] } = await res.json()

                    const byServerId = new Map(
                        Object.entries(serverIdByLocalId.current).map(([localId, id]) => [id, localId] as const),
                    )
                    const next: Record<string, ServerStatus> = {}
                    for (const item of json.items) {
                        const localId = byServerId.get(item.id)
                        if (localId) next[localId] = { status: item.status, processingError: item.processingError }
                    }
                    setServerStatus(prev => ({ ...prev, ...next }))

                    // Every draft has to have actually been attempted before the
                    // batch can be "done" — early on, most of them have no server
                    // status yet simply because the upload hasn't reached them, not
                    // because they finished.
                    const settled = drafts.every(d => {
                        const p = uploadStateRef.current[d.localId]?.phase
                        return p === 'processing' || p === 'failed'
                    })
                    const stillProcessing = json.items.some(it => it.status === 'processing')
                    // A failed item keeps the batch open so its Retry stays live —
                    // moving on to "done" would strand it with no way back.
                    const stillFailed = drafts.some(d => uploadStateRef.current[d.localId]?.phase === 'failed')

                    if (settled && !stillProcessing && !stillFailed) {
                        setPhase('done')
                        return
                    }

                    // Bounded, not unbounded. Once every draft has actually been
                    // attempted and the server confirms nothing is still
                    // transcoding, there is nothing left the server can tell this
                    // tab that it doesn't already know — the only thing standing
                    // between here and "done" is an unretried failure, which is
                    // waiting on the member, not on a poll. Ticking every 2s
                    // against that for as long as the tab stays open is exactly
                    // the unbounded loop this guards against. `pollGen` (bumped by
                    // Retry) re-runs this effect and starts a fresh cycle once
                    // there is something new to learn.
                    if (settled && !stillProcessing) return
                }
            } catch { /* transient — the next tick tries again */ }
            if (!cancelled) timer = setTimeout(poll, 2000)
        }

        poll()
        return () => { cancelled = true; clearTimeout(timer) }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- drafts is fixed once uploading starts; re-running per keystroke would restart the poller.
    }, [phase, batchId, pollGen])

    /* ---------- composing ---------------------------------------------- */

    const addFiles = useCallback(async (files: FileList) => {
        const incoming = Array.from(files)
        const countFailure = checkItemCount(drafts.length + incoming.length)
        if (countFailure) {
            setRejects(prev => [...prev, { id: crypto.randomUUID(), name: `${incoming.length} files`, reason: countFailure.message }])
            return
        }

        for (const file of incoming) {
            const kind = kindForMime(file.type)
            const reject = (reason: string) =>
                setRejects(prev => [...prev, { id: crypto.randomUUID(), name: file.name, reason }])

            if (kind !== 'video') {
                const failure = checkFile({ mime: file.type, bytes: file.size })
                if (failure) { reject(failure.message); continue }
                setDrafts(prev => [...prev, {
                    localId: crypto.randomUUID(), file, thumb: URL.createObjectURL(file),
                    caption: '', tags: [...batchTags], operationId: null,
                }])
                continue
            }

            const preFailure = checkFile({ mime: file.type, bytes: file.size })
            if (preFailure) { reject(preFailure.message); continue }

            // Duration only comes from actually loading the file — checked before
            // it uploads, not after, so a twelve-minute clip is refused here and
            // not 400MB into the connection.
            const { durationSec, thumb } = await readVideo(file)
            const failure = checkFile({ mime: file.type, bytes: file.size, durationSec })
            if (failure) { reject(failure.message); continue }

            setDrafts(prev => [...prev, {
                localId: crypto.randomUUID(), file, thumb, durationSec,
                caption: '', tags: [...batchTags], operationId: null,
            }])
        }
    }, [drafts.length, batchTags])

    const addEmbed = useCallback(() => {
        const parsed = parseEmbedUrl(embedText)
        if (!parsed) { setEmbedError('That link is not a YouTube or Twitch video.'); return }

        const countFailure = checkItemCount(drafts.length + 1)
        if (countFailure) { setEmbedError(countFailure.message); return }

        setDrafts(prev => [...prev, {
            localId: crypto.randomUUID(), embed: parsed, thumb: embedThumb(parsed),
            caption: '', tags: [...batchTags], operationId: null,
        }])
        setEmbedText('')
        setEmbedError(null)
    }, [embedText, drafts.length, batchTags])

    const removeDraft = useCallback((localId: string) => {
        // The blob URL is released the moment its card leaves — the <img>
        // showing it is being removed in this same handler, so nothing is
        // still displaying it once this runs.
        const draft = drafts.find(d => d.localId === localId)
        if (draft) revokeThumb(draft)
        setDrafts(prev => prev.filter(d => d.localId !== localId))
    }, [drafts])

    const updateDraft = useCallback((localId: string, change: Partial<Draft>) => {
        setDrafts(prev => prev.map(d => d.localId === localId ? { ...d, ...change } : d))
    }, [])

    const toggleDraftTag = useCallback((localId: string, slug: string) => {
        setDrafts(prev => prev.map(d => {
            if (d.localId !== localId) return d
            const on = d.tags.includes(slug)
            return { ...d, tags: on ? d.tags.filter(t => t !== slug) : [...d.tags, slug] }
        }))
    }, [])

    const toggleBatchTag = useCallback((slug: string) => {
        setBatchTags(prev => prev.includes(slug) ? prev.filter(t => t !== slug) : [...prev, slug])
    }, [])

    /* ---------- submitting ------------------------------------------------ */

    const trackedSend: SendFn = useCallback(async (job, onProgress) => {
        const result = await sendOverXhr(job, onProgress)
        serverIdByLocalId.current[job.localId] = result.id
        return result
    }, [])

    const handleSubmit = useCallback(async () => {
        if (!drafts.length || phase !== 'compose') return

        const newBatchId = crypto.randomUUID()
        const opDefault = batchOperationId ?? 'unknown'
        serverIdByLocalId.current = {}
        setServerStatus({})
        setUploadState({})
        setBatchId(newBatchId)
        setPhase('uploading')

        const jobs = drafts.map(d => buildJob(d, newBatchId, opDefault))
        await runUploads({
            jobs,
            concurrency: 2,
            send: trackedSend,
            onChange: (localId, state) => setUploadState(prev => ({ ...prev, [localId]: state })),
        })
    }, [drafts, phase, batchOperationId, trackedSend])

    const retry = useCallback(async (localId: string) => {
        const draft = drafts.find(d => d.localId === localId)
        if (!draft || !batchId) return

        // Bumped before the upload starts, not after: the poll effect may
        // already have stopped its own timer while this item sat failed (see
        // its comment), and it needs to be running again in time to catch
        // this item once it reaches the server, not just once it lands.
        setPollGen(g => g + 1)

        await runUploads({
            jobs: [buildJob(draft, batchId, batchOperationId ?? 'unknown')],
            concurrency: 1,
            send: trackedSend,
            onChange: (id, state) => setUploadState(prev => ({ ...prev, [id]: state })),
        })
    }, [drafts, batchId, batchOperationId, trackedSend])

    const submitMore = useCallback(() => {
        // The cards stayed mounted with their thumbs right up to this reset —
        // this is the first point where none of them are displayed any more,
        // so it's where the remaining blob URLs get released.
        drafts.forEach(revokeThumb)
        setDrafts([])
        setRejects([])
        setUploadState({})
        setServerStatus({})
        setBatchId(null)
        setPhase('compose')
    }, [drafts])

    /* ---------- render ------------------------------------------------- */

    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }

    if (phase === 'done') {
        return (
            <div className={`${s.subPage} ${s.subPageDone}`}>
                <div className={s.subShell}>
                    <div className={s.doneCard}>
                        <span className={ui.kicker}>Submitted</span>
                        <h1 className={ui.h2}>Thanks, {authorName.split(' ')[0]}</h1>
                        <p className={s.doneText}>
                            {drafts.length} item{drafts.length === 1 ? '' : 's'} {drafts.length === 1 ? 'is' : 'are'} with J5 for review.
                        </p>
                        <div className={s.doneActions}>
                            <Button href='/gallery' variant='ghost'>Back to gallery</Button>
                            <Button onClick={submitMore} variant='red'>Submit more</Button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const submitting = phase === 'uploading'

    return (
        <div className={s.subPage}>
            <div className={s.subShell}>
                <div className={s.subHead}>
                    <span className={ui.kicker}>Gallery</span>
                    <h1 className={ui.h2}>Submit media</h1>
                    <p className={ui.lede}>
                        Drop screenshots or a clip, or paste a YouTube or Twitch link. Everything
                        goes to J5 for review before it appears in the archive.
                    </p>
                </div>

                {!submitting && (
                    <div className={s.subDefaults}>
                        <div className={s.subField}>
                            <span className={s.subFieldLabel}>Operation</span>
                            <select
                                className={s.itemOpSelect}
                                value={batchOperationId ?? 'unknown'}
                                onChange={e => setBatchOperationId(e.target.value)}
                                aria-label='Operation this batch is from'
                            >
                                <option value='unknown'>Unknown</option>
                                {operations.map(op => <option key={op.id} value={op.id}>{op.title}</option>)}
                            </select>
                        </div>

                        {tags.length > 0 && (
                            <div className={s.subField}>
                                <span className={s.subFieldLabel}>Tags</span>
                                <div className={s.itemTags}>
                                    {tags.map(t => (
                                        <button
                                            key={t.slug}
                                            type='button'
                                            className={`${s.tagChip} ${batchTags.includes(t.slug) ? s.tagChipOn : ''}`}
                                            onClick={() => toggleBatchTag(t.slug)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!submitting && (
                    <>
                        <input
                            ref={fileInputRef}
                            type='file'
                            multiple
                            accept={ACCEPT_ATTRIBUTE}
                            hidden
                            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
                        />

                        <div
                            className={`${s.dropzone} ${dragOver ? s.dropzoneOver : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                        >
                            <span className={s.dropzoneText}>Drag files here, or click to browse</span>
                            <span className={s.dropzoneSub}>
                                Photos or video · {drafts.length}/{MAX_ITEMS_PER_SUBMISSION} items
                            </span>
                        </div>

                        <div className={s.embedRow}>
                            <input
                                className={s.embedInput}
                                value={embedText}
                                onChange={e => { setEmbedText(e.target.value); setEmbedError(null) }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmbed() } }}
                                placeholder='Paste a YouTube or Twitch link…'
                                aria-label='Video link'
                            />
                            <Button variant='ghost' onClick={addEmbed}>Add link</Button>
                        </div>
                        {embedError && <p className={s.embedError}>{embedError}</p>}

                        {rejects.length > 0 && (
                            <div className={s.rejects}>
                                {rejects.map(r => (
                                    <div key={r.id} className={s.rejectRow}>
                                        <span className={s.rejectName}>{r.name}</span>
                                        <span className={s.rejectReason}>{r.reason}</span>
                                        <button
                                            type='button'
                                            onClick={() => setRejects(prev => prev.filter(x => x.id !== r.id))}
                                            aria-label='Dismiss'
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {drafts.length > 0 && (
                    <div className={s.itemsGrid}>
                        {drafts.map(d => {
                            const row = submitting ? describeRow(uploadState[d.localId], serverStatus[d.localId]) : null
                            return (
                                <ItemCard
                                    key={d.localId}
                                    draft={d}
                                    operations={operations}
                                    tags={tags}
                                    onCaption={v => updateDraft(d.localId, { caption: v })}
                                    onToggleTag={slug => toggleDraftTag(d.localId, slug)}
                                    onOperation={v => updateDraft(d.localId, { operationId: v || null })}
                                    onRemove={() => removeDraft(d.localId)}
                                    upload={submitting ? uploadState[d.localId] ?? { phase: 'queued', progress: 0 } : undefined}
                                    statusLabel={row?.label}
                                    statusTone={row?.tone}
                                    onRetry={() => retry(d.localId)}
                                />
                            )
                        })}
                    </div>
                )}

                {!submitting && (
                    <div className={s.submitBar}>
                        <span className={s.submitCount}>
                            {drafts.length} item{drafts.length === 1 ? '' : 's'} ready
                        </span>
                        <Button variant='red' onClick={handleSubmit} disabled={drafts.length === 0}>Submit</Button>
                    </div>
                )}
            </div>
        </div>
    )
}
