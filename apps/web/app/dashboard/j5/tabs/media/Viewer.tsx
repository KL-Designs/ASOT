'use client'

import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { operationDisplayName } from '@/lib/gallery/naming'
import s from '@/styles/media-console.module.css'
import c from '@/styles/j5-controls.module.css'

/**
 * One item, full size, so a reviewer can actually look at it.
 *
 * Until this existed the largest view of a photograph anywhere in the console
 * was the inspector's 320px preview — double-clicking a tile toggled its
 * selection, which the tile's single click already did.
 *
 * Not the public gallery's Lightbox
 * (app/(landing)/gallery/_components/Lightbox.tsx), which was read first. Three
 * reasons, in order of weight. It renders a permanent aside carrying title,
 * label/value rows, tag chips, a vote bar and Download/Copy-link buttons; this
 * is meant to show the caption and the operation and nothing else, so reusing
 * it would mean either shipping a second inspector or adding a "console mode"
 * flag that strips most of the component out. It is styled entirely from
 * gallery.module.css, the public page's language, which is the one thing this
 * brief rules out. And it neither traps focus nor restores it on close, which
 * in a 60-tile grid loses a keyboard user's place — so the behaviour that
 * matters most here is behaviour it does not have. What is shared is the
 * reasoning, not the code: the keyed media element and the body scroll lock
 * below are both lifted from it deliberately.
 *
 * Stepping is confined to the loaded page. Paging across a fetch boundary would
 * make this a second data-loading path with its own loading and error states,
 * and the pager below the grid is where changing page belongs.
 */
export default function Viewer({ items, index, onIndex, onClose }: {
    items: AdminMediaAPI[]
    /** Index into `items`. The parent guarantees it is in range — it derives
     *  this from the open item's id and unmounts the viewer when that id is no
     *  longer on the page. */
    index: number
    onIndex: (next: number) => void
    onClose: () => void
}) {
    const panel = useRef<HTMLDivElement | null>(null)
    const closeBtn = useRef<HTMLButtonElement | null>(null)

    const item = items[index]

    const step = useCallback((delta: -1 | 1) => {
        const next = index + delta
        if (next < 0 || next >= items.length) return
        onIndex(next)
    }, [index, items.length, onIndex])

    /* Focus goes into the dialog on open and back where it came from on close.
       Captured as whatever was focused rather than as "the tile", because the
       two ways in are a double-click and Enter on a focused tile, and in both
       cases that element IS the tile — while an assumption about which element
       it is would be wrong the first time this is opened from anywhere else.
       Without the restore, closing the viewer drops focus to <body> and a
       keyboard user restarts their tab journey at the top of a 60-tile grid. */
    useEffect(() => {
        const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
        closeBtn.current?.focus()

        // The page behind an opaque overlay should not scroll with it.
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = previous
            // isConnected: the tile can have been removed from the DOM while
            // the viewer was open (a refetch after a bulk run), and focusing a
            // detached node silently sends focus to <body> instead.
            if (returnTo?.isConnected) returnTo.focus()
        }
    }, [])

    /* On the document, not the panel: the arrow keys have to work while focus
       is on the <video> element's own controls, which are in a shadow root that
       does not bubble a React synthetic event to this component's tree. */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return }
            if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return }
            if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose, step])

    /* The focus trap. Tab out of the last control wraps to the first rather
       than walking into the grid behind an opaque backdrop, where a keyboard
       user would be tabbing through sixty tiles they cannot see. Queried on
       each Tab rather than cached, because Prev and Next become disabled at the
       ends of the page and a disabled button is not a tab stop. */
    function trap(e: ReactKeyboardEvent<HTMLDivElement>) {
        if (e.key !== 'Tab' || !panel.current) return

        const stops = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), video')]
        if (stops.length === 0) return

        const first = stops[0]
        const last = stops[stops.length - 1]
        const active = document.activeElement

        if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }

    const caption = item.caption || 'Untitled'
    // Not the raw folder name: it carries the order prefix on every legacy
    // item, and a number in a folder name is a storage detail.
    const operation = operationDisplayName(item.opLabel, item.operation) || 'Unknown operation'

    return (
        <div
            ref={panel}
            className={s.view}
            role='dialog'
            aria-modal='true'
            aria-label={caption}
            onKeyDown={trap}
        >
            <div
                className={s.viewStage}
                // Clicking the backdrop closes; clicking the picture does not.
                // currentTarget-only, or every click on the image would land
                // here through the bubble and shut the viewer the moment
                // somebody clicked the thing they opened it to see.
                onClick={e => { if (e.target === e.currentTarget) onClose() }}
            >
                {item.kind === 'video' && item.source === 'upload' && item.src && (
                    /* Keyed on src, like the public lightbox's player and for
                       the same reason: without a key, stepping from one clip to
                       the next reuses this DOM node and swaps its src in place,
                       which can carry the previous clip's audio and playback
                       position into the new one. */
                    <video key={item.src} src={item.src} poster={item.poster ?? undefined} controls playsInline />
                )}

                {item.kind === 'image' && item.src && <img key={item.src} src={item.src} alt={caption} />}

                {/* A YouTube or Twitch item has no bytes here, only a provider
                    id — there is nothing to show at full size and no player is
                    being dragged into the console to pretend otherwise. Its
                    poster is what this console actually holds, so that is what
                    it shows, with one line saying why that is all there is.
                    Without it the backdrop is simply black and reads as a
                    broken viewer. */}
                {item.source !== 'upload' && (
                    item.poster
                        ? <img key={item.poster} src={item.poster} alt={caption} />
                        : <p className={s.viewNote}>Hosted on {item.source}. There is no local copy to show.</p>
                )}
            </div>

            <div className={s.viewMeta}>
                <span className={s.viewCap}>{caption}</span>
                <span className={s.viewOp}>{operation}</span>
            </div>

            {/* Prev/Next are the pointer equivalent of the arrow keys, not extra
                information — the brief's "caption and operation and nothing
                else" is about what this says, not about how it is driven. They
                disable at the ends of the page rather than wrapping, so the
                edge of the loaded page is visible instead of silently looping. */}
            <button
                type='button'
                className={`${c.btn} ${s.viewNav} ${s.viewPrev}`}
                onClick={() => step(-1)}
                disabled={index === 0}
            >Prev</button>
            <button
                type='button'
                className={`${c.btn} ${s.viewNav} ${s.viewNext}`}
                onClick={() => step(1)}
                disabled={index >= items.length - 1}
            >Next</button>
            <button
                ref={closeBtn}
                type='button'
                className={`${c.btn} ${s.viewClose}`}
                onClick={onClose}
            >Close</button>
        </div>
    )
}
