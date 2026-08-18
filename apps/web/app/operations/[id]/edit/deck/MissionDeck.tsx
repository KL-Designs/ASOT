'use client'

import { useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'asot.opsdeck.collapsed'

export default function MissionDeck({ strip, children }: {
    strip: ReactNode
    children: ReactNode
}) {
    const [collapsed, setCollapsed] = useState(false)

    // Read persisted collapse state after mount only — the server render has
    // no localStorage, so reading it during render (or synchronously on the
    // initial client render) would make the very first client markup depend
    // on a value the server couldn't have produced, a hydration mismatch.
    useEffect(() => {
        setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
    }, [])

    function toggle() {
        setCollapsed(c => {
            window.localStorage.setItem(STORAGE_KEY, c ? '0' : '1')
            return !c
        })
    }

    if (collapsed) {
        return (
            <aside style={{ width: 44, flexShrink: 0, borderLeft: '1px solid var(--line)', background: 'var(--bg)' }}>
                <button
                    type="button" onClick={toggle} aria-label="Expand mission deck"
                    style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
            </aside>
        )
    }

    return (
        <aside style={{
            width: 340, flexShrink: 0,
            borderLeft: '1px solid var(--line)',
            background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
        }}>
            {/*
             * Not in the original brief code — that version only ever renders
             * an expand button (in the collapsed rail below), with no way
             * back to collapsed once expanded. Added so "collapse toggle"
             * (this file's stated purpose) is actually bidirectional.
             */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button
                    type="button" onClick={toggle} aria-label="Collapse mission deck"
                    style={{ width: 32, height: 32, margin: 4, background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 6l6 6-6 6" />
                    </svg>
                </button>
            </div>
            {strip}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
                {children}
            </div>
        </aside>
    )
}
