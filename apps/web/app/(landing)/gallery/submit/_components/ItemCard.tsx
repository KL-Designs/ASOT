import React from 'react'

import type { Draft, Operation, Tag } from '../SubmitClient'
import type { UploadState } from '../upload'
import s from '@/styles/gallery.module.css'

const PROVIDER_LABEL: Record<string, string> = { youtube: 'YouTube', twitch: 'Twitch' }

function formatDuration(totalSec: number): string {
    const m = Math.floor(totalSec / 60)
    const sec = Math.round(totalSec % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
}

const TONE_CLASS: Record<NonNullable<Props['statusTone']>, string> = {
    progress: s.rowStateProgress,
    ok: s.rowStateOk,
    warn: s.rowStateWarn,
    error: s.rowStateError,
}

type Props = {
    draft: Draft
    operations: Operation[]
    tags: Tag[]
    onCaption: (value: string) => void
    onToggleTag: (slug: string) => void
    onOperation: (value: string) => void
    onRemove: () => void
    /** Present once the batch is under way. Its presence, not its phase, is
     *  what switches the card from the editable composer view to the
     *  read-only progress row — a card with no `upload` is always editable. */
    upload?: UploadState
    statusLabel?: string
    statusTone?: 'progress' | 'ok' | 'warn' | 'error'
    onRetry?: () => void
    /** Opens this draft full size. Not offered once the batch is under way —
     *  the card is read-only from that point, and a video's object URL would
     *  be competing with the upload reading the same file. */
    onPreview?: () => void
}

/**
 * One draft, in one of two shapes.
 *
 * Before submission it is a small form: thumbnail, caption, tag chips and an
 * operation override. Once `upload` is passed in, none of that is editable any
 * more — the FormData for this item has already been built — so the same
 * space instead holds the bar and the state line the monitor drives.
 */
export default function ItemCard({
    draft, operations, tags, onCaption, onToggleTag, onOperation, onRemove,
    upload, statusLabel, statusTone, onRetry, onPreview,
}: Props) {
    const submitting = upload !== undefined

    // A Twitch draft has no provider thumbnail, so its tile is the placeholder
    // mark — still worth opening, since the whole point is checking you picked
    // the right clip. Anything with a file or an embed can be previewed; only
    // a draft with neither (which nothing currently creates) cannot.
    const previewable = !submitting && !!onPreview && (!!draft.file || !!draft.embed)
    const isMoving = draft.durationSec !== undefined || !!draft.embed

    return (
        <div className={s.itemCard}>
            <div className={s.itemThumb}>
                {draft.thumb ? (
                    <img src={draft.thumb} alt='' />
                ) : (
                    <span className={s.itemThumbMark}>
                        {draft.embed ? PROVIDER_LABEL[draft.embed.provider] : draft.durationSec !== undefined ? 'Video' : 'Photo'}
                    </span>
                )}
                {/* Covers the tile rather than sitting inside it, so the whole
                    thumbnail is the target — but rendered before the remove
                    button below, which therefore stacks above it and keeps its
                    own corner clickable. */}
                {previewable && (
                    <button
                        type='button'
                        className={s.itemPreview}
                        onClick={onPreview}
                        aria-label={isMoving ? 'Preview this video' : 'Preview this photo'}
                    >
                        <span className={s.itemPreviewMark} aria-hidden='true'>{isMoving ? '▶' : '⤢'}</span>
                    </button>
                )}
                {draft.durationSec ? <span className={s.itemDuration}>{formatDuration(draft.durationSec)}</span> : null}
                {!submitting && (
                    <button type='button' className={s.itemRemove} onClick={onRemove} aria-label='Remove item'>×</button>
                )}
            </div>

            <div className={s.itemBody}>
                {submitting ? (
                    <>
                        <p className={s.itemCaptionRo}>{draft.caption || 'No caption'}</p>

                        <div className={s.bar}>
                            <div className={s.barFill} style={{ width: `${Math.round((upload?.progress ?? 0) * 100)}%` }} />
                        </div>

                        <div className={`${s.rowState} ${statusTone ? TONE_CLASS[statusTone] : ''}`}>
                            <span>{statusLabel}</span>
                            {statusTone === 'error' && onRetry && (
                                <button type='button' className={s.retryBtn} onClick={onRetry}>Retry</button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <textarea
                            className={s.itemCaption}
                            value={draft.caption}
                            maxLength={500}
                            placeholder="What's happening here?"
                            onChange={e => onCaption(e.target.value)}
                        />

                        {tags.length > 0 && (
                            <div className={s.itemTags}>
                                {tags.map(t => (
                                    <button
                                        key={t.slug}
                                        type='button'
                                        className={`${s.tagChip} ${draft.tags.includes(t.slug) ? s.tagChipOn : ''}`}
                                        onClick={() => onToggleTag(t.slug)}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <select
                            className={s.itemOpSelect}
                            value={draft.operationId ?? ''}
                            onChange={e => onOperation(e.target.value)}
                            aria-label='Operation for this item'
                        >
                            <option value=''>Same as batch</option>
                            <option value='unknown'>Unknown</option>
                            {operations.map(op => <option key={op.id} value={op.id}>{op.title}</option>)}
                        </select>
                    </>
                )}
            </div>
        </div>
    )
}
