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
 * What it loads is `item.thumb` — a ~400px WebP the thumbnail route resizes
 * once and caches, not the original. The tile is about 178px wide and the
 * archive's originals average 3.8MB, so at sixty a page this element used to
 * pull roughly 200MB and hand the browser sixty 4K screenshots to downscale.
 * That was the lag, and it is why the fallback chain below ends at `src`
 * rather than starting there.
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
    /** Opens the fullscreen viewer — double-click, or Enter on a focused tile.
     *  Not the same gesture as selection, which is a single click. */
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
                        // Enter opens the viewer; Space still selects. A
                        // <button>'s default action for Enter is to fire a
                        // click, which here means toggling selection, so this
                        // has to preventDefault — without it the viewer would
                        // open on top of a selection nobody asked for, and
                        // closing it would leave that tile ticked. Space is
                        // untouched and remains the keyboard path to the
                        // selection the single click already owns.
                        onKeyDown={e => {
                            if (e.key !== 'Enter') return
                            e.preventDefault()
                            onOpen(item.id)
                        }}
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
                            {/* No width/height attributes, deliberately.
                                They exist to reserve space before the bytes
                                arrive, and .tileBox already gives this element
                                a definite 16:10 box that object-fit crops into
                                — so there is no layout shift to prevent, and
                                stating a size the file does not have would be
                                a lie the decoder acts on. `poster` and `src`
                                remain as fallbacks for the one case `thumb` is
                                null: an embed whose poster fetch failed. */}
                            {(item.thumb ?? item.poster ?? item.src)
                                ? <img src={item.thumb ?? item.poster ?? item.src ?? ''} alt='' loading='lazy' decoding='async' />
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
