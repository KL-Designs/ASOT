'use client'

import { Autocomplete, Button, Chip, CircularProgress, TextField, Typography } from '@mui/material'
import { Done, Close, OpenInFull, Warning } from '@mui/icons-material'

import { embedIframeSrc, type EmbedProvider } from '@/lib/gallery/embeds'
import type { OperationOption, PatchFields, PendingItem, Tag } from './useSubmissions'
import s from '@/styles/j5-console.module.css'

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.78rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.78rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.27)',
    color: 'rgba(219,0,29,0.8)',
    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.08)' },
}

function formatDuration(totalSec: number): string {
    const m = Math.floor(totalSec / 60)
    const sec = Math.round(totalSec % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
}

/** Playable at full size, not a thumbnail — this is a review surface, not a
 *  grid. An upload plays from its own storage route; an embed goes through
 *  `embedIframeSrc`, which requires the caller's own `window.location.hostname`
 *  and nothing derived from the item, or a Twitch player refuses to load. */
function MediaPreview({ item }: { item: PendingItem }) {
    if (item.source === 'upload') {
        if (item.kind === 'image') return <img src={item.src ?? ''} alt='' />
        return <video controls poster={item.poster ?? undefined} src={item.src ?? undefined} />
    }

    if (!item.embedId || !item.embedKind) {
        return <div className={s.previewFail}>No preview available</div>
    }

    const src = embedIframeSrc(
        { provider: item.source as EmbedProvider, kind: item.embedKind, id: item.embedId },
        window.location.hostname,
    )
    return <iframe src={src} allow='autoplay; fullscreen' />
}

/** Format/dimensions/size are not shown here: the pending API
 *  (`GET /api/gallery/submissions/pending`) does not return width, height or
 *  byte size for a queued item — only `AdminMediaAPI`, a different route's
 *  shape, carries those. The brief for this row asked for them; they are not
 *  in the data this route actually returns, so the techline sticks to what
 *  is: kind, source, duration, and the date the item will publish under. */
function techline(item: PendingItem): string {
    const parts = [item.kind.toUpperCase(), item.source]
    if (item.durationSec) parts.push(formatDuration(item.durationSec))
    parts.push(item.takenAt
        ? `dated ${new Date(item.takenAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} on accept`
        : 'no date on accept — pick an operation')
    return parts.join(' · ')
}

export default function SubmissionRow({ item, tags, operations, saveState, busy, error, onPatch, onAccept, onReject, onExpand }: {
    item: PendingItem
    tags: Tag[]
    operations: OperationOption[]
    saveState: 'saving' | 'saved' | 'error' | undefined
    busy: boolean
    error: string | undefined
    onPatch: (fields: PatchFields) => void
    onAccept: () => void
    onReject: () => void
    onExpand: () => void
}) {
    const opValue = item.operationId ?? 'unknown'
    const operationOptions = [{ id: 'unknown', title: 'Unknown', date: null }, ...operations]
    const selectedTags = tags.filter(t => item.tags.includes(t.slug))

    // Publishing an item with nothing behind it is exactly the failure the
    // accept route's 409 exists to prevent (see [id]/route.ts) — the button
    // does not offer an action that cannot succeed. `!item.src` stands in for
    // "no storageKey": the pending route only ever sets `src` when the
    // document has one (see pending/route.ts), so an upload with a null src
    // has no media at all.
    const missingMedia = !!item.processingError || (item.source === 'upload' && !item.src)

    return (
        <div className={s.row}>
            <div className={s.preview}>
                <MediaPreview item={item} />
                {item.durationSec ? <span className={s.dur}>{formatDuration(item.durationSec)}</span> : null}
            </div>

            <div className={s.fields}>
                {item.processingError && (
                    <div className={`${s.warn} ${s.wide}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Warning sx={{ fontSize: 16, flexShrink: 0, marginTop: '1px' }} />
                        <span>Transcode failed — this media may be unusable: {item.processingError}</span>
                    </div>
                )}

                {/* Covers the edge case processingError doesn't: an upload that
                    reached the queue with no storageKey and no recorded error.
                    Accept is disabled below either way, but a disabled button
                    with no visible reason reads as broken, not as protective. */}
                {!item.processingError && missingMedia && (
                    <div className={`${s.warn} ${s.wide}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Warning sx={{ fontSize: 16, flexShrink: 0, marginTop: '1px' }} />
                        <span>This item has no media to publish.</span>
                    </div>
                )}

                {error && (
                    <div className={`${s.warn} ${s.wide}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Warning sx={{ fontSize: 16, flexShrink: 0, marginTop: '1px' }} />
                        <span>{error}</span>
                    </div>
                )}

                <TextField
                    className={s.wide}
                    label='Caption'
                    value={item.caption}
                    onChange={e => onPatch({ caption: e.target.value })}
                    multiline
                    minRows={2}
                    size='small'
                    fullWidth
                    sx={inputSx}
                />

                <Autocomplete
                    size='small'
                    options={operationOptions}
                    getOptionLabel={o => o.title}
                    isOptionEqualToValue={(o, v) => o.id === v.id}
                    value={operationOptions.find(o => o.id === opValue) ?? null}
                    onChange={(_, v) => onPatch({ operationId: v?.id ?? 'unknown' })}
                    renderInput={params => <TextField {...params} label='Operation' sx={inputSx} />}
                />

                <Autocomplete
                    multiple
                    size='small'
                    options={tags}
                    value={selectedTags}
                    getOptionLabel={t => t.label}
                    isOptionEqualToValue={(o, v) => o.slug === v.slug}
                    onChange={(_, v) => onPatch({ tags: v.map(t => t.slug) })}
                    renderInput={params => <TextField {...params} label='Tags' sx={inputSx} />}
                    renderTags={(value, getTagProps) =>
                        value.map((t, i) => (
                            <Chip {...getTagProps({ index: i })} key={t.slug} label={t.label} size='small' sx={{ fontSize: '0.68rem', height: 20, borderRadius: '2px' }} />
                        ))
                    }
                />

                <Typography className={`${s.techline} ${s.wide}`}>{techline(item)}</Typography>
            </div>

            <div className={s.actions}>
                <span className={s.saveState} data-state={saveState}>
                    {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
                </span>
                <Button
                    size='small'
                    variant='outlined'
                    startIcon={busy ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <Done fontSize='small' />}
                    disabled={busy || missingMedia}
                    onClick={onAccept}
                    sx={redBtn}
                    title={missingMedia ? 'This item has no media to publish.' : undefined}
                >
                    Accept
                </Button>
                <Button size='small' variant='outlined' color='error' startIcon={<Close fontSize='small' />} disabled={busy} onClick={onReject} sx={{ fontSize: '0.72rem' }}>
                    Reject
                </Button>
                <Button size='small' variant='text' startIcon={<OpenInFull fontSize='small' />} onClick={onExpand} sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>
                    Expand
                </Button>
            </div>
        </div>
    )
}
