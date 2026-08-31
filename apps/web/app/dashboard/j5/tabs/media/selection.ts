'use client'

import { useCallback, useRef } from 'react'

/**
 * Click-to-select with shift-click range extension.
 *
 * One implementation, shared by MediaGrid and MediaTable, because the two
 * layouts are two views of the same selection: a reviewer who ticks four
 * tiles, switches to the table and shift-clicks a row expects the range to
 * extend from the tile they last clicked, and a second copy of this logic is
 * exactly how the two would come to disagree about where a range starts.
 *
 * `lastClicked` is a ref, not a plain local: a plain local is reinitialised on
 * every render, and clicking changes the selection, which re-renders the list,
 * which would reset the local before the next click ever saw it — so
 * shift-click would extend a range only in the rare case nothing had
 * re-rendered since the previous click. A ref survives the re-render the click
 * itself causes.
 */
export function useRangeSelect(
    onToggle: (id: string) => void,
    onRange: (fromId: string, toId: string) => void,
) {
    const lastClicked = useRef<string | null>(null)

    /* The anchor deliberately does not move on a shift-click: extending from
       the same anchor is what lets a reviewer widen a range by shift-clicking
       further down, rather than having to start again from the last row they
       happened to hit. */
    return useCallback((id: string, shiftKey: boolean) => {
        if (shiftKey && lastClicked.current) onRange(lastClicked.current, id)
        else { onToggle(id); lastClicked.current = id }
    }, [onToggle, onRange])
}
