'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The "Enlist Now" transition — a full-screen fade to black, then the join
 * video.
 *
 * Shared rather than reimplemented because the navbar's ENLIST and the
 * homepage hero's button are meant to be the same action, and two copies of a
 * fade duration paired with a matching `setTimeout` drift the moment either is
 * tuned: the overlay would either flash back or land on an already-black screen.
 */

/** Kept in step with the overlay's own transition below. */
export const ENLIST_FADE_MS = 840
export const ENLIST_HREF = '/join/video'

export function useEnlistTransition() {
    const router = useRouter()
    const [fading, setFading] = useState(false)

    const enlist = useCallback(() => {
        setFading(true)
        setTimeout(() => router.push(ENLIST_HREF as any), ENLIST_FADE_MS)
    }, [router])

    return { fading, enlist }
}

/** Mount once alongside whatever triggers `enlist`. */
export function EnlistFadeOverlay({ fading }: { fading: boolean }) {
    return (
        <div
            aria-hidden='true'
            style={{
                position: 'fixed', inset: 0, background: '#000', zIndex: 9999,
                opacity: fading ? 1 : 0,
                transition: 'opacity 0.8s ease',
                pointerEvents: fading ? 'auto' : 'none',
            }}
        />
    )
}
