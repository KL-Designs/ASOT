'use client'

import React, { useEffect, useState } from 'react'

import Button from '@/components/ui/Button'
import VoteBar from './VoteBar'
import { ChevronLeft, ChevronRight, CloseIcon, DownloadIcon, LinkIcon } from './icons'
import { embedIframeSrc } from '@/lib/gallery/embeds'
import s from '@/styles/gallery.module.css'

/**
 * One piece of media, full size, with everything the archive knows about it.
 *
 * Deliberately generic over the four things this page can open — an archive
 * tile, a featured shot, the screenshot of the month, and (via `vote`) an
 * archive item's own rating. Only the archive has neighbours to step through
 * and a score to show, which is why `vote` is nullable and the other three
 * fields default to values that make an image behave the way it always did:
 * the featured strip and the screenshot of the month set `kind: 'image'` and
 * `source: 'upload'` for exactly that reason.
 */
export type LightboxItem = {
    src: string | null
    /** Video and embeds only — the frame shown before playback starts. */
    poster: string | null
    /** Small red line above the title. Null when there is nothing to say. */
    kicker: string | null
    title: string
    /** Label/value pairs. Only what is actually stored — no invented fields. */
    rows: [string, string][]
    /** Filename for the download attribute. */
    file: string

    kind: 'image' | 'video'
    source: 'upload' | 'youtube' | 'twitch'
    /** Embeds only. */
    embedId: string | null
    embedKind: 'video' | 'clip' | null
    /** Embeds only — the canonical provider URL. Copy Link falls back to this
     *  when there is no local `src` to build a link from. */
    embedUrl: string | null

    caption: string | null
    authorName: string | null
    /** Resolved against the tag vocabulary, not raw slugs — the chip has to
     *  show something a member wrote, not something J5 typed into a slug. */
    tags: { slug: string, label: string }[]

    /** Null for the featured strip and the screenshot of the month — neither
     *  is an archive item, so neither carries a score. */
    vote: { mediaId: string, up: number, down: number, mine: 1 | -1 | null, canVote: boolean } | null
}

export default function Lightbox({ item, index, count, onClose, onStep, onTagClick, onVote }: {
    item: LightboxItem
    /** 0-based, or null when the item has no neighbours. */
    index: number | null
    count: number
    onClose: () => void
    onStep: (delta: -1 | 1) => void
    /** A tag chip applies that tag as a filter and closes the lightbox — there
     *  is no "filter panel inside the lightbox" to update instead. */
    onTagClick?: (slug: string) => void
    onVote?: (mediaId: string, next: { up: number, down: number, mine: 1 | -1 | null }) => void
}) {
    const [copied, setCopied] = useState(false)

    useEffect(() => { setCopied(false) }, [item.src])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowLeft') onStep(-1)
            if (e.key === 'ArrowRight') onStep(1)
        }
        document.addEventListener('keydown', onKey)

        // The page behind a full-screen overlay should not scroll with it.
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = previous
        }
    }, [onClose, onStep])

    const steppable = index !== null && count > 1

    // Evaluated at render, not module scope: embedIframeSrc's `parentHost`
    // contract is exactly `window.location.hostname`, and this file can still
    // be evaluated during prerender, where `window` does not exist yet.
    const parentHost = typeof window === 'undefined' ? '' : window.location.hostname

    async function copyLink() {
        // A local file has a page-relative src to resolve against the origin;
        // an embed has no src at all, only the provider's own canonical URL,
        // which is already absolute.
        const target = item.src ?? item.embedUrl
        if (!target) return

        try {
            const href = target.startsWith('http') ? target : new URL(target, window.location.origin).href
            await navigator.clipboard.writeText(href)
            setCopied(true)
        } catch {
            // Clipboard access can simply be refused — an unchanged button is a
            // truer report of that than a "Copied!" that didn't happen.
        }
    }

    return (
        <div className={s.lb} role='dialog' aria-modal='true' aria-label={item.title}>
            <div className={s.lbStage} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
                <button type='button' className={s.lbClose} onClick={onClose} aria-label='Close'>
                    <CloseIcon />
                </button>

                {steppable && (
                    <button
                        type='button'
                        className={`${s.lbNav} ${s.lbPrev}`}
                        onClick={() => onStep(-1)}
                        disabled={index === 0}
                        aria-label='Previous item'
                    ><ChevronLeft /></button>
                )}

                <div className={s.lbImg}>
                    {/* An uploaded video plays from local storage; a YouTube or
                        Twitch item has no bytes of its own here, only a provider
                        id, so it plays through that provider's own player. */}
                    {item.kind === 'video' && item.source === 'upload' && (
                        // Keyed like the <img> below it, for the same reason:
                        // without a key, stepping from one video to the next
                        // reuses this DOM node and swaps its `src` in place,
                        // which can carry the previous clip's audio and
                        // playback position into the new one instead of
                        // mounting a fresh player.
                        //
                        // No autoPlay: unmuted autoplay is blocked by every
                        // major browser, so the attribute would silently do
                        // nothing, and muting to make it work would strip the
                        // audio from a clip whose audio is often the point of
                        // it. A poster frame with visible controls reads as
                        // intentional; a silently-failed autoplay reads as
                        // broken.
                        <video
                            key={item.src}
                            src={item.src ?? undefined}
                            poster={item.poster ?? undefined}
                            controls
                            playsInline
                            className={s.lbVideo}
                        />
                    )}
                    {item.kind === 'video' && item.source !== 'upload' && (
                        <iframe
                            className={s.lbEmbed}
                            src={embedIframeSrc({ provider: item.source, kind: item.embedKind ?? 'video', id: item.embedId! }, parentHost)}
                            allow='autoplay; fullscreen; picture-in-picture'
                            allowFullScreen
                            title={item.title}
                        />
                    )}
                    {item.kind === 'image' && <img key={item.src} src={item.src ?? undefined} alt={item.title} />}
                </div>

                {steppable && (
                    <button
                        type='button'
                        className={`${s.lbNav} ${s.lbNext}`}
                        onClick={() => onStep(1)}
                        disabled={index === count - 1}
                        aria-label='Next item'
                    ><ChevronRight /></button>
                )}

                {index !== null && <div className={s.lbIdx}>{index + 1} / {count}</div>}
            </div>

            <aside className={s.lbSide}>
                {item.kicker && <span className={s.lbK}>{item.kicker}</span>}
                <h3 className={s.lbTitle}>{item.title}</h3>

                {/* The caption is what a member actually wrote about this item —
                    body text, not another label/value row. */}
                {item.caption && <p className={s.lbCaption}>{item.caption}</p>}

                <div className={s.lbRows}>
                    {item.rows.map(([label, value]) => (
                        <div key={label} className={s.r}><span>{label}</span><b>{value}</b></div>
                    ))}
                    {item.authorName && <div className={s.r}><span>Author</span><b>{item.authorName}</b></div>}
                </div>

                {item.tags.length > 0 && (
                    <div className={s.lbTags}>
                        {item.tags.map(t => (
                            <button key={t.slug} type='button' className={s.tagChip} onClick={() => onTagClick?.(t.slug)}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}

                {item.vote && (
                    <div className={s.lbVote}>
                        <VoteBar
                            mediaId={item.vote.mediaId}
                            up={item.vote.up}
                            down={item.vote.down}
                            mine={item.vote.mine}
                            canVote={item.vote.canVote}
                            onChange={next => onVote?.(item.vote!.mediaId, next)}
                        />
                    </div>
                )}

                <div className={s.lbActs}>
                    {/* An embed has nothing local to download — there is no
                        `Download` action, and offering one over the provider's
                        own bytes would be broken by design, not by omission. */}
                    {item.source === 'upload' && (
                        <Button variant='ghost' size='sm' href={item.src ?? ''} download={item.file}>
                            <DownloadIcon /> Download
                        </Button>
                    )}
                    <Button variant='red' size='sm' onClick={copyLink}>
                        <LinkIcon /> {copied ? 'Copied' : 'Copy link'}
                    </Button>
                </div>
            </aside>
        </div>
    )
}
