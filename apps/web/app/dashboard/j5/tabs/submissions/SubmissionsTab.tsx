'use client'

import { useState } from 'react'
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { Done } from '@mui/icons-material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import SubmissionRow from './SubmissionRow'
import { useSubmissions } from './useSubmissions'
import s from '@/styles/j5-console.module.css'

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.78rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
}

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.27)',
    color: 'rgba(219,0,29,0.8)',
    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.08)' },
}

const ghostBtn = {
    fontSize: '0.72rem',
    color: 'rgba(237,237,237,0.4)',
    '&:hover': { color: 'rgba(237,237,237,0.7)' },
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
                        <div className={s.batchHead}>
                            <span className={s.who}>{batch.authorName}</span>
                            <span className={s.when}>
                                {batch.items.length} item{batch.items.length !== 1 ? 's' : ''} · {timeAgo(batch.earliest)}
                            </span>
                            <span className={s.spacer} />
                            <Button
                                size='small'
                                variant='outlined'
                                color='error'
                                disabled={batchBusy}
                                onClick={() => { setRejectTarget({ ids: batch.items.map(i => i.id) }); setRejectReason('') }}
                                sx={{ fontSize: '0.72rem' }}
                            >
                                Reject all
                            </Button>
                            <Button
                                size='small'
                                variant='outlined'
                                startIcon={batchBusy ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <Done fontSize='small' />}
                                disabled={batchBusy}
                                onClick={() => acceptBatch(batch.batchId)}
                                sx={redBtn}
                            >
                                Accept all
                            </Button>
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
                                // Wired to the real lightbox in the next commit — this
                                // rebuild's layout comes first, expanding to judge a
                                // clip properly is the very next task on top of it.
                                onExpand={() => {}}
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
                    <Button onClick={() => { setRejectTarget(null); setRejectReason('') }} disabled={rejecting} sx={ghostBtn}>Cancel</Button>
                    <Button onClick={confirmReject} variant='contained' color='error' disabled={rejecting || !rejectReason.trim()} sx={{ fontSize: '0.75rem' }}>
                        Reject
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    )
}
