'use client'

import { useCallback, useEffect, useState } from 'react'
import { CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { Done } from '@mui/icons-material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import Lightbox, { type LightboxItem } from '@/app/(landing)/gallery/_components/Lightbox'
import SubmissionRow from './SubmissionRow'
import { useSubmissions, type PendingItem, type Tag } from './useSubmissions'
import s from '@/styles/j5-console.module.css'
import c from '@/styles/j5-controls.module.css'

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.78rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
}

function timeAgo(iso: string) {
    const diff  = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins  < 1)  return 'just now'
    if (mins  < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
}

/**
 * A pending submission is not an archive item — it has no votes yet, and the
 * only neighbours worth stepping through are the rest of its own batch, not
 * the whole queue. `vote: null` hides VoteBar the same way it does for the
 * featured strip and the screenshot of the month in useGalleryData.ts.
 */
function toLightboxItem(item: PendingItem, tags: Tag[]): LightboxItem {
    return {
        // An embed has no bytes of its own to play from here — same
        // distinction Lightbox itself draws on `source` for the video/iframe
        // branch and the Download button.
        src: item.source === 'upload' ? item.src : null,
        poster: item.poster,
        kicker: 'Pending review',
        title: item.opLabel ?? 'Pending submission',
        rows: [
            ['Submitter', item.authorName],
            ['Operation', item.opLabel ?? 'Unknown operation'],
        ],
        // Pending items live flat under media/<id>.<ext> until accept files
        // them into the readable tree (see [id]/route.ts's relocateMedia
        // comment) — there is no readable filename yet, only the id the
        // pending route's own `src` URL already carries.
        file: item.id,

        kind: item.kind,
        source: item.source,
        embedId: item.embedId,
        embedKind: item.embedKind,
        embedUrl: item.embedUrl,

        caption: item.caption,
        authorName: item.authorName,
        tags: item.tags.map(slug => ({ slug, label: tags.find(t => t.slug === slug)?.label ?? slug })),

        vote: null,
    }
}

/** A single item id, or a whole batch's ids — the reject dialog collects one
 *  reason either way and applies it to every id in the target. Reject All is
 *  new in this rebuild (the old tab only ever rejected one item at a time);
 *  reusing the same dialog for both keeps there being exactly one place that
 *  enforces "a reason is required". */
type RejectTarget = { ids: string[] } | null

export default function SubmissionsTab() {
    const { batches, tags, operations, loading, patch, accept, acceptBatch, reject, saveState, busy, error } = useSubmissions()

    const [rejectTarget, setRejectTarget] = useState<RejectTarget>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [rejecting, setRejecting]       = useState(false)

    // Which item Expand opened, kept as a (batch, id) pair rather than a
    // snapshot of the item itself: `batches` is recomputed from live state on
    // every accept/reject/patch, so re-deriving the item and its neighbours
    // from the current `batches` on every render is what lets a reviewer step
    // through a batch that is still being edited underneath the overlay.
    const [lightboxTarget, setLightboxTarget] = useState<{ batchId: string, id: string } | null>(null)
    const lightboxBatch = lightboxTarget ? batches.find(b => b.batchId === lightboxTarget.batchId) ?? null : null
    const lightboxIndex = lightboxBatch ? lightboxBatch.items.findIndex(i => i.id === lightboxTarget?.id) : -1
    const lightboxItem  = lightboxBatch && lightboxIndex >= 0 ? lightboxBatch.items[lightboxIndex] : null

    // The item Expand opened can vanish out from under the overlay (accepted
    // or rejected elsewhere is not possible from inside the modal itself, but
    // an id that no longer resolves should never leave the target dangling
    // open on nothing) — close rather than render a Lightbox with no item.
    useEffect(() => {
        if (lightboxTarget && !lightboxItem) setLightboxTarget(null)
    }, [lightboxTarget, lightboxItem])

    const stepLightbox = useCallback((delta: -1 | 1) => {
        setLightboxTarget(prev => {
            if (!prev) return prev
            const batch = batches.find(b => b.batchId === prev.batchId)
            if (!batch) return prev
            const idx = batch.items.findIndex(i => i.id === prev.id)
            const next = idx + delta
            if (idx < 0 || next < 0 || next >= batch.items.length) return prev
            return { batchId: prev.batchId, id: batch.items[next].id }
        })
    }, [batches])

    async function confirmReject() {
        if (!rejectTarget || !rejectReason.trim()) return
        setRejecting(true)
        try {
            // One reason, applied to every id in the target — same fields, same
            // concurrency shape as acceptBatch, so a multi-item reject can't
            // half-succeed without the reviewer being able to see which items
            // are left (a per-item error is left in place by `reject` itself).
            const results = await Promise.all(rejectTarget.ids.map(id => reject(id, rejectReason)))
            if (results.every(Boolean)) {
                setRejectTarget(null)
                setRejectReason('')
            }
        } finally {
            setRejecting(false)
        }
    }

    if (loading) return <TacticalSkeleton rows={8} className='p-8' />

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-2' style={{ overflowY: 'auto' }}>
            {batches.length === 0 ? (
                <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.3)', textAlign: 'center', padding: '32px 0' }}>
                    Nothing waiting for review.
                </Typography>
            ) : batches.map(batch => {
                const batchBusy = batch.items.some(i => busy[i.id])
                return (
                    <div key={batch.batchId} className={s.batch}>
                        <CornerBrackets />
                        <div className={s.batchHead}>
                            <span className={s.who}>{batch.authorName}</span>
                            <span className={s.when}>
                                {batch.items.length} item{batch.items.length !== 1 ? 's' : ''} · {timeAgo(batch.earliest)}
                            </span>
                            <span className={s.spacer} />
                            <button
                                type='button'
                                className={`${c.btn} ${c.btnDanger}`}
                                disabled={batchBusy}
                                onClick={() => { setRejectTarget({ ids: batch.items.map(i => i.id) }); setRejectReason('') }}
                            >
                                Reject all
                            </button>
                            <button
                                type='button'
                                className={`${c.btn} ${c.btnPrimary}`}
                                disabled={batchBusy}
                                onClick={() => acceptBatch(batch.batchId)}
                            >
                                {batchBusy ? <CircularProgress size={12} sx={{ color: 'inherit', marginRight: '6px', verticalAlign: 'middle' }} /> : <Done fontSize='small' sx={{ fontSize: 14, marginRight: '4px', verticalAlign: 'middle' }} />}
                                Accept all
                            </button>
                        </div>

                        {batch.items.map(item => (
                            <SubmissionRow
                                key={item.id}
                                item={item}
                                tags={tags}
                                operations={operations}
                                saveState={saveState[item.id]}
                                busy={!!busy[item.id]}
                                error={error[item.id]}
                                onPatch={fields => patch(item.id, fields)}
                                onAccept={() => accept(item.id)}
                                onReject={() => { setRejectTarget({ ids: [item.id] }); setRejectReason('') }}
                                onExpand={() => setLightboxTarget({ batchId: batch.batchId, id: item.id })}
                            />
                        ))}
                    </div>
                )
            })}

            <Dialog open={!!rejectTarget} onClose={() => { if (!rejecting) { setRejectTarget(null); setRejectReason('') } }} PaperProps={{ style: { background: '#181818', border: '1px solid rgba(219,0,29,0.32)', minWidth: 380 } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', pb: 1 }}>
                    {rejectTarget && rejectTarget.ids.length > 1 ? `Reject ${rejectTarget.ids.length} Items` : 'Reject Submission'}
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.5)' }}>
                        The file is deleted and the submitter is notified with this reason. This cannot be undone.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        minRows={2}
                        size='small'
                        label='Reason (required)'
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        sx={inputSx}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <button type='button' className={`${c.btn} ${c.btnGhost}`} onClick={() => { setRejectTarget(null); setRejectReason('') }} disabled={rejecting}>Cancel</button>
                    <button type='button' className={`${c.btn} ${c.btnDanger}`} onClick={confirmReject} disabled={rejecting || !rejectReason.trim()}>
                        Reject
                    </button>
                </DialogActions>
            </Dialog>

            {/* Judging a clip from a 190px preview does not work — the same
                overlay the public gallery uses, stepping within this item's
                own batch (onStep clamps at the batch's ends, matching the
                disabled state of Lightbox's own prev/next buttons) rather
                than closing to expand the next item one at a time. */}
            {lightboxItem && (
                <Lightbox
                    item={toLightboxItem(lightboxItem, tags)}
                    index={lightboxIndex}
                    count={lightboxBatch?.items.length ?? 1}
                    onClose={() => setLightboxTarget(null)}
                    onStep={stepLightbox}
                />
            )}
        </div>
    )
}
