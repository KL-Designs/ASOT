'use client'

import { CircularProgress, Typography } from '@mui/material'
import { Done, Close, OpenInFull, Warning } from '@mui/icons-material'

import { TextArea } from '@/app/dashboard/j5/controls/Field'
import { Select } from '@/app/dashboard/j5/controls/Select'
import { TagPicker } from '@/app/dashboard/j5/controls/TagPicker'
import { embedIframeSrc } from '@/lib/gallery/embeds'
import type { OperationOption, PatchFields, PendingItem, Tag } from './useSubmissions'
import s from '@/styles/j5-console.module.css'
import c from '@/styles/j5-controls.module.css'

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

    // No cast needed: item.source is 'upload' | 'youtube' | 'twitch', the
    // 'upload' return above already narrowed it out, and EmbedProvider is
    // exactly 'youtube' | 'twitch' — control flow gets this for free.
    const src = embedIframeSrc(
        { provider: item.source, kind: item.embedKind, id: item.embedId },
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
    /* Filtered against the live vocabulary, so a slug that has since been
       retired is not shown — and, because this is also what an edit sends
       back, is dropped from the item by the next patch. Kept exactly as the
       Autocomplete had it: whether that is right is a question about the
       queue's behaviour, not about which control draws it. */
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

                <TextArea
                    className={s.wide}
                    label='Caption'
                    value={item.caption}
                    onChange={caption => onPatch({ caption })}
                    rows={2}
                />

                <Select
                    label='Operation'
                    searchable
                    value={opValue}
                    onChange={operationId => onPatch({ operationId })}
                    options={operationOptions.map(o => ({
                        value: o.id,
                        label: o.title,
                        // The year, because operation titles repeat across
                        // them — two "Op Storm"s a year apart are otherwise
                        // the same row twice. 'unknown' has no date and so
                        // carries no note.
                        note: o.date ? String(new Date(o.date).getFullYear()) : undefined,
                    }))}
                />

                <TagPicker
                    label='Tags'
                    value={selectedTags.map(t => t.slug)}
                    onChange={slugs => onPatch({ tags: slugs })}
                    options={tags.map(t => t.slug)}
                    labelFor={slug => tags.find(t => t.slug === slug)?.label ?? slug}
                />

                <Typography className={`${s.techline} ${s.wide}`}>{techline(item)}</Typography>
            </div>

            <div className={s.actions}>
                <span className={s.saveState} data-state={saveState}>
                    {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
                </span>
                <button
                    type='button'
                    className={`${c.btn} ${c.btnPrimary}`}
                    disabled={busy || missingMedia}
                    onClick={onAccept}
                    title={missingMedia ? 'This item has no media to publish.' : undefined}
                >
                    {busy ? <CircularProgress size={12} sx={{ color: 'inherit', marginRight: '4px', verticalAlign: 'middle' }} /> : <Done fontSize='small' sx={{ fontSize: 14, marginRight: '4px', verticalAlign: 'middle' }} />}
                    Accept
                </button>
                <button type='button' className={`${c.btn} ${c.btnDanger}`} disabled={busy} onClick={onReject}>
                    <Close fontSize='small' sx={{ fontSize: 14, marginRight: '4px', verticalAlign: 'middle' }} />
                    Reject
                </button>
                <button type='button' className={`${c.btn} ${c.btnGhost}`} onClick={onExpand}>
                    <OpenInFull fontSize='small' sx={{ fontSize: 14, marginRight: '4px', verticalAlign: 'middle' }} />
                    Expand
                </button>
            </div>
        </div>
    )
}
