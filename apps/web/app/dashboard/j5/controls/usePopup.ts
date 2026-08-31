'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Open/closed state for a control that drops a panel below itself.
 *
 * Shared by Select and TagPicker because the three things that make a dropdown
 * feel broken are all here, and each was got wrong once when they were written
 * per-component: closing on an outside press, closing on Escape without also
 * swallowing Escape from the dialog behind it, and opening upward when there is
 * no room below. The inspector sits at the bottom of a 70vh panel, so a select
 * near its Save row has nowhere to go but up.
 */
export function usePopup() {
    const [open, setOpen] = useState(false)
    const [dropUp, setDropUp] = useState(false)
    const wrap = useRef<HTMLDivElement | null>(null)

    /* Measured before paint: deciding after would show one frame of the panel
       in the wrong place, which reads as a flicker rather than as a flip. */
    useLayoutEffect(() => {
        if (!open || !wrap.current) return
        const box = wrap.current.getBoundingClientRect()
        const below = window.innerHeight - box.bottom
        setDropUp(below < 280 && box.top > below)
    }, [open])

    useEffect(() => {
        if (!open) return

        const onPointerDown = (e: PointerEvent) => {
            if (!wrap.current || !(e.target instanceof Node)) return
            if (!wrap.current.contains(e.target)) setOpen(false)
        }
        /* Capture phase: a press on a button elsewhere in the console should
           close this and still activate that button, which it does — the
           listener only sets state. Bubble phase would let a handler that
           calls stopPropagation leave the panel open over the page. */
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
    }, [open])

    /* Escape is stopped only while we are open, so it still reaches whatever
       dialog or lightbox contains us once the panel is closed. */
    const onKeyDownEscape = useCallback((e: React.KeyboardEvent) => {
        if (e.key !== 'Escape' || !open) return false
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        return true
    }, [open])

    return { open, setOpen, dropUp, wrap, onKeyDownEscape }
}
