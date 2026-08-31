import React, { useEffect, useState } from 'react'

import type { Draft } from '../SubmitClient'
import { embedIframeSrc } from '@/lib/gallery/embeds'
import s from '@/styles/gallery.module.css'

/**
 * One draft, full size, before it is submitted.
 *
 * Deliberately not the public gallery's `Lightbox`: that one carries Download,
 * Copy Link, a vote bar and prev/next stepping, none of which mean anything
 * for something that is not in the archive yet and may never be. What is left
 * once those are gone is small enough to own outright.
 *
 * A video draft's object URL is created here rather than held on the draft,
 * and revoked on unmount. `addFiles` deliberately revokes the blob it probes
 * the file with the moment it has the poster frame, so that twenty 500MB
 * files are not left registered for the whole session — creating one on
 * demand, for the one clip actually being watched, keeps that property.
 * Nothing extra is retained by doing so: `draft.file` holds the File for the
 * session regardless, because the upload needs it.
 */
export default function PreviewOverlay({ draft, onClose }: { draft: Draft, onClose: () => void }) {
    const [fileUrl, setFileUrl] = useState<string | null>(null)

    // Evaluated at render, not module scope: Twitch's embed refuses to play
    // unless `parent` matches the host actually framing it, and that is not
    // knowable during SSR. Same reasoning as Lightbox.tsx.
    const parentHost = typeof window === 'undefined' ? '' : window.location.hostname

    const isVideoFile = !!draft.file && draft.durationSec !== undefined

    useEffect(() => {
        if (!isVideoFile || !draft.file) return
        const url = URL.createObjectURL(draft.file)
        setFileUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [draft.file, isVideoFile])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const label = draft.file?.name ?? draft.embed?.canonicalUrl ?? 'Preview'

    return (
        <div
            className={s.previewBackdrop}
            onClick={onClose}
            role='dialog'
            aria-modal='true'
            aria-label={`Preview: ${label}`}
        >
            {/* The frame swallows the click so that using the controls, or
                dragging the scrubber and releasing outside the video, does not
                dismiss the thing being scrubbed. */}
            <div className={s.previewFrame} onClick={e => e.stopPropagation()}>
                <button type='button' className={s.previewClose} onClick={onClose} aria-label='Close preview'>×</button>

                <div className={s.previewStage}>
                    {draft.embed ? (
                        <iframe
                            className={s.previewEmbed}
                            src={embedIframeSrc(draft.embed, parentHost)}
                            allow='autoplay; fullscreen; picture-in-picture'
                            allowFullScreen
                            title={label}
                        />
                    ) : isVideoFile ? (
                        // No autoPlay: unmuted autoplay is blocked by every
                        // major browser, so the attribute would silently do
                        // nothing, and muting to make it work strips the audio
                        // from a clip whose audio is often the point of it.
                        // The poster frame with visible controls reads as
                        // intentional; a silently-failed autoplay reads broken.
                        fileUrl && (
                            <video
                                src={fileUrl}
                                poster={draft.thumb ?? undefined}
                                controls
                                playsInline
                                className={s.previewMedia}
                            />
                        )
                    ) : (
                        <img src={draft.thumb ?? undefined} alt={label} className={s.previewMedia} />
                    )}
                </div>

                <p className={s.previewLabel}>{label}</p>
            </div>
        </div>
    )
}
