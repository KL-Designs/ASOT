'use client'

import { useRangeSelect } from './selection'
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
 * ticking sixty boxes one at a time is not a workflow. That behaviour lives in
 * useRangeSelect (./selection), shared with MediaTable — the two layouts
 * select into the same set and must extend a range the same way.
 */

export default function MediaGrid({ items, selected, onToggle, onRange, onOpen }: {
    items: AdminMediaAPI[]
    selected: Set<string>
    onToggle: (id: string) => void
    onRange: (fromId: string, toId: string) => void
    onOpen: (id: string) => void
}) {
    const click = useRangeSelect(onToggle, onRange)

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
                        onClick={e => click(item.id, e.shiftKey)}
                        onDoubleClick={() => onOpen(item.id)}
                    >
                        {/* Everything sits inside this box rather than directly
                            in the <button>, because the button cannot hold the
                            16:10 ratio: a form control takes its block size
                            from its content and drops `aspect-ratio`, which
                            flattened every tile to a letterbox sliver. .tileBox
                            is a plain block, so it keeps the ratio and gives
                            the <img> and the overlays below a definite height
                            to resolve their percentages against. A <span>, not
                            a <div>: a button's content model is phrasing
                            content. */}
                        <span className={s.tileBox}>
                            {(item.poster ?? item.src)
                                ? <img src={item.poster ?? item.src ?? ''} alt='' loading='lazy' decoding='async' />
                                : null}

                            <span className={s.check} />

                            <span className={s.badges}>
                                {/* A migrated item without operationId still
                                    carries a date — 1 January of its folder's
                                    year, written by the migration. What it
                                    lacks is a link to an operation record, so
                                    UNLINKED is the truthful label, but it is
                                    true of all 4,781 of them: in the warning
                                    colour it marked every tile and therefore
                                    marked nothing. Quiet, and still said.
                                    Amber goes to the absence that is genuinely
                                    exceptional — no takenAt at all, which the
                                    migration's 1 January rule means cannot
                                    have come from a migrated folder. That
                                    signal existed once, was dropped with the
                                    old mislabelled "NO DATE", and nothing has
                                    reported a dateless item since. */}
                                {!item.takenAt && <span className={`${s.badge} ${s.badgeWarn}`}>NO DATE</span>}
                                {!item.operationId && <span className={`${s.badge} ${s.badgeQuiet}`}>UNLINKED</span>}
                                {item.kind === 'video' && <span className={s.badge}>VIDEO</span>}
                            </span>

                            <span className={s.cap}>{item.caption || item.opLabel || 'Untitled'}</span>
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
