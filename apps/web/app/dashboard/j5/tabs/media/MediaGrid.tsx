'use client'

import { useRef } from 'react'

import s from '@/styles/media-console.module.css'

/**
 * Tiles, with selection.
 *
 * A plain <img>, not next/image: these are thousands of files served from a
 * local API route, and the optimiser would re-encode every one of them. Lazy
 * loading does the work instead.
 *
 * Shift-click extends a range from the last tile clicked, because assigning an
 * operation to a folder's worth of photographs is the tab's main job and
 * ticking sixty boxes one at a time is not a workflow.
 *
 * `lastClicked` is a ref, not a plain local: a plain local is reinitialised
 * on every render, and clicking a tile changes the selection, which re-renders
 * the grid, which would reset the local before the next click ever saw it — so
 * shift-click would extend a range only in the rare case nothing had
 * re-rendered since the previous click. A ref survives the re-render the
 * click itself causes.
 */

export default function MediaGrid({ items, selected, onToggle, onRange, onOpen }: {
    items: AdminMediaAPI[]
    selected: Set<string>
    onToggle: (id: string) => void
    onRange: (fromId: string, toId: string) => void
    onOpen: (id: string) => void
}) {
    const lastClicked = useRef<string | null>(null)

    if (items.length === 0) {
        return <div className={s.empty}>Nothing here. Try a different view, or clear the filters.</div>
    }

    return (
        <div className={s.grid}>
            {items.map(item => {
                const on = selected.has(item.id)
                return (
                    <button
                        key={item.id}
                        type='button'
                        className={`${s.tile} ${on ? s.tileOn : ''}`}
                        aria-pressed={on}
                        aria-label={item.caption || item.opLabel || 'Untitled media'}
                        onClick={e => {
                            if (e.shiftKey && lastClicked.current) onRange(lastClicked.current, item.id)
                            else { onToggle(item.id); lastClicked.current = item.id }
                        }}
                        onDoubleClick={() => onOpen(item.id)}
                    >
                        {(item.poster ?? item.src)
                            ? <img src={item.poster ?? item.src ?? ''} alt='' loading='lazy' decoding='async' />
                            : null}

                        <span className={s.check} />
                        {!item.operationId && <span className={`${s.badge} ${s.badgeWarn}`}>NO DATE</span>}
                        {item.kind === 'video' && item.operationId && <span className={s.badge}>VIDEO</span>}

                        <span className={s.cap}>{item.caption || item.opLabel || 'Untitled'}</span>
                    </button>
                )
            })}
        </div>
    )
}
