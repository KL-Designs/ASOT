'use client'

import { useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'asot.opsdeck.collapsed'

// Below this the shell doesn't have room to push the deck's 340px alongside
// the tab content (spec §8: "1024–1279px: deck collapses fully, expanding as
// an overlay on click" / "<1024px: … overlay drawers"). Both bands get the
// same treatment here — collapsing to nothing but the pull-tab, then
// expanding as a floating overlay rather than pushing layout — since nothing
// in the spec's two rows distinguishes deck behaviour between them, only the
// (out-of-scope-for-this-file) documents rail does.
const WIDE_QUERY = '(min-width: 1280px)'

/**
 * True once the viewport is wide enough to push-layout the deck instead of
 * overlaying it. Starts `true` (matches the >=1600px/1280-1599px rows, the
 * common case) rather than reading matchMedia during render — the server
 * has no viewport, so reading it synchronously on the client's first render
 * would still risk a hydration mismatch on a client that boots narrow.
 */
function useIsWide(): boolean {
    const [wide, setWide] = useState(true)
    useEffect(() => {
        const mq = window.matchMedia(WIDE_QUERY)
        const update = () => setWide(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])
    return wide
}

export default function MissionDeck({ strip, children }: {
    strip: ReactNode
    children: ReactNode
}) {
    const isWide = useIsWide()

    // The user's manual preference — meaningful only at >=1280px, where the
    // deck pushes layout and the old collapse/expand toggle behaves exactly
    // as it always has.
    const [collapsedPref, setCollapsedPref] = useState(false)

    // The overlay's open/closed state below 1280px. Deliberately separate
    // from collapsedPref and never persisted: an overlay drawer that
    // remembered "open" would auto-cover the tab content on every load on a
    // narrow screen, which is worse than just re-opening it each time.
    const [overlayOpen, setOverlayOpen] = useState(false)

    // Read persisted collapse state after mount only — the server render has
    // no localStorage, so reading it during render (or synchronously on the
    // initial client render) would make the very first client markup depend
    // on a value the server couldn't have produced, a hydration mismatch.
    useEffect(() => {
        setCollapsedPref(window.localStorage.getItem(STORAGE_KEY) === '1')
    }, [])

    // Crossing back into the narrow band always starts from closed, per the
    // no-persistence note above — covers both "resized narrow" and "loaded
    // narrow" (the latter via isWide's own mount-time matchMedia read).
    useEffect(() => {
        if (!isWide) setOverlayOpen(false)
    }, [isWide])

    function toggleCollapsedPref() {
        setCollapsedPref(c => {
            window.localStorage.setItem(STORAGE_KEY, c ? '0' : '1')
            return !c
        })
    }

    const collapsed = isWide ? collapsedPref : !overlayOpen
    const overlay = !isWide && !collapsed

    if (collapsed) {
        // Width 0, no border, no background — nothing of the deck itself is
        // visible or occupies layout; the editor column reclaims the full
        // width. `overflow: visible` (the default, stated explicitly here
        // because the expanded case below has to override its own scroll
        // rule to get the same effect) lets the pull-tab, which is
        // `position: absolute` and sits mostly outside this 0-width box,
        // still render — nothing about a 0-width ancestor clips a child that
        // paints outside its bounds unless that ancestor also clips overflow.
        return (
            <aside style={{ width: 0, flexShrink: 0, position: 'relative', overflow: 'visible' }}>
                <CollapseTab
                    expanded={false}
                    onClick={isWide ? toggleCollapsedPref : () => setOverlayOpen(true)}
                />
            </aside>
        )
    }

    return (
        <aside style={{
            width: overlay ? 'min(340px, 92vw)' : 340,
            flexShrink: 0,
            position: 'relative',
            // Deliberately visible, not the `overflowY: 'auto'` the scroll
            // area itself needs: setting overflow-y to anything but visible
            // while leaving overflow-x untouched makes the UA compute
            // overflow-x as `auto` too (CSSOM overflow §2), which would clip
            // CollapseTab's horizontal overhang below. The scrolling rule
            // moves to the inner div instead so this outer box can stay
            // visible and let the tab protrude over .main uncropped.
            overflow: 'visible',
            // Overlay case (<1280px, expanded): float above the tab content
            // instead of pushing it — there's no room to push. Positioned
            // against .body (shell.module.css sets `position: relative`
            // there for exactly this) rather than the viewport, so it docks
            // under the header/tab bar instead of covering them.
            ...(overlay
                ? { position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 30 }
                : {}),
        }}>
            {/*
             * Not in the original brief code — that version only ever renders
             * an expand button (in the collapsed rail below), with no way
             * back to collapsed once expanded. Kept so "collapse toggle"
             * (this file's stated purpose) is actually bidirectional — a
             * small tab overhanging the top-left corner instead of a full
             * row, so the countdown strip (`strip`) sits at the very top of
             * the deck's own scroll content.
             */}
            <CollapseTab
                expanded={true}
                onClick={isWide ? toggleCollapsedPref : () => setOverlayOpen(false)}
            />
            {/* The actual visible deck box — border, background and the
                vertical scroll all live here now, not on the outer `aside`
                (see the `overflow: visible` comment above). */}
            <div style={{
                height: '100%',
                display: 'flex', flexDirection: 'column',
                borderLeft: '1px solid var(--line)',
                background: 'var(--bg)',
                overflowY: 'auto',
                ...(overlay ? { boxShadow: '-8px 0 24px rgba(0,0,0,0.45)' } : {}),
            }}>
                {strip}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
                    {children}
                </div>
            </div>
        </aside>
    )
}

/**
 * The deck's collapse/expand control: a pull-tab that hangs off the deck's
 * top-left corner rather than sitting flush on its border or inside it, and
 * rather than a full-width row (see the module doc above — that row used to
 * cost the deck a whole row of vertical space). Rendered inside an `aside`
 * with `position: relative` in both the collapsed (0-width) and expanded
 * (340px) cases, so `left: -16px` always resolves against that aside's own
 * left edge — i.e. against where the deck's visible border sits when
 * expanded, and where it *used* to sit when collapsed. Most of the button's
 * 22px width falls outside that edge, into the editor column, so it reads as
 * a tab clipped to the side of the deck rather than part of the deck itself.
 */
function CollapseTab({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={expanded ? 'Collapse mission deck' : 'Expand mission deck'}
            style={{
                position: 'absolute',
                top: 12,
                left: -16,
                width: 22,
                height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--s2)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                // Above the editor column (.main, an unpositioned sibling of
                // this aside in EditorShell's .body) regardless of DOM/paint
                // order, and above the collapsed 0-width aside's own empty
                // box — this is the only thing ever painted from it.
                zIndex: 20,
            }}
        >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={expanded ? 'M9 6l6 6-6 6' : 'M15 18l-6-6 6-6'} />
            </svg>
        </button>
    )
}
