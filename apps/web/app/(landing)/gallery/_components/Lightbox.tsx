'use client'

import React, { useEffect, useState } from 'react'

import Button from '@/components/ui/Button'
import { ChevronLeft, ChevronRight, CloseIcon, DownloadIcon, LinkIcon } from './icons'
import s from '@/styles/gallery.module.css'

/**
 * One photograph, full size, with everything the archive knows about it.
 *
 * Deliberately generic over the three things this page can open — an archive
 * tile, a featured shot, the screenshot of the month. They carry different
 * metadata and only the archive has neighbours to step through, so the caller
 * builds the item and the lightbox renders whatever it was handed.
 */
export type LightboxItem = {
    src: string
    /** Small red line above the title. Null when there is nothing to say. */
    kicker: string | null
    title: string
    /** Label/value pairs. Only what is actually stored — no invented fields. */
    rows: [string, string][]
    /** Filename for the download attribute. */
    file: string
}

export default function Lightbox({ item, index, count, onClose, onStep }: {
    item: LightboxItem
    /** 0-based, or null when the item has no neighbours. */
    index: number | null
    count: number
    onClose: () => void
    onStep: (delta: -1 | 1) => void
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

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(new URL(item.src, window.location.origin).href)
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
                        aria-label='Previous photograph'
                    ><ChevronLeft /></button>
                )}

                <div className={s.lbImg}>
                    <img key={item.src} src={item.src} alt={item.title} />
                </div>

                {steppable && (
                    <button
                        type='button'
                        className={`${s.lbNav} ${s.lbNext}`}
                        onClick={() => onStep(1)}
                        disabled={index === count - 1}
                        aria-label='Next photograph'
                    ><ChevronRight /></button>
                )}

                {index !== null && <div className={s.lbIdx}>{index + 1} / {count}</div>}
            </div>

            <aside className={s.lbSide}>
                {item.kicker && <span className={s.lbK}>{item.kicker}</span>}
                <h3 className={s.lbTitle}>{item.title}</h3>

                <div className={s.lbRows}>
                    {item.rows.map(([label, value]) => (
                        <div key={label} className={s.r}><span>{label}</span><b>{value}</b></div>
                    ))}
                </div>

                <div className={s.lbActs}>
                    <Button variant='ghost' size='sm' href={item.src} download={item.file}>
                        <DownloadIcon /> Download
                    </Button>
                    <Button variant='red' size='sm' onClick={copyLink}>
                        <LinkIcon /> {copied ? 'Copied' : 'Copy link'}
                    </Button>
                </div>
            </aside>
        </div>
    )
}
