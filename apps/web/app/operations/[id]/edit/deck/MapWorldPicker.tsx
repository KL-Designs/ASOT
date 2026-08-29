'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Popular Arma 3 maps (shown when not in maps system) ─────────────────────

const POPULAR_MAPS: { name: string; displayName: string }[] = [
    { name: 'altis', displayName: 'Altis' },
    { name: 'stratis', displayName: 'Stratis' },
    { name: 'tanoa', displayName: 'Tanoa' },
    { name: 'malden', displayName: 'Malden' },
    { name: 'livonia', displayName: 'Livonia' },
    { name: 'chernarus', displayName: 'Chernarus' },
    { name: 'takistan', displayName: 'Takistan' },
    { name: 'sahrani', displayName: 'Sahrani' },
    { name: 'panthera', displayName: 'Panthera' },
    { name: 'lingor', displayName: 'Lingor' },
    { name: 'namalsk', displayName: 'Namalsk' },
    { name: 'fallujah', displayName: 'Fallujah' },
    { name: 'clafghan', displayName: 'Clafghan' },
    { name: 'porto', displayName: 'Porto' },
    { name: 'utes', displayName: 'Utes' },
    { name: 'zargabad', displayName: 'Zargabad' },
    { name: 'desert_e', displayName: 'Desert (IRL)' },
]

/** The menu's own box. Fixed rather than min-width because the placement maths
 *  below has to know how wide it is before it is on screen. */
const MENU_W = 260
const MENU_MAX_H = 380

// ─── Map World Picker ─────────────────────────────────────────────────────────
// Extracted verbatim from page.tsx (Task 11) — same behaviour, same styling,
// just its own file so DetailsCard can import it instead of page.tsx
// duplicating it.

export default function MapWorldPicker({
    value,
    worlds,
    onChange,
    themeColor,
}: {
    value: string
    worlds: { name: string; displayName: string; hasPreview: boolean }[]
    onChange: (name: string) => void
    themeColor: string
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [customValue, setCustomValue] = useState('')
    const [showCustom, setShowCustom] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

    const selected = worlds.find(w => w.name === value)
        ?? POPULAR_MAPS.find(m => m.name === value)
        ?? (value ? { name: value, displayName: value } : null)

    useEffect(() => {
        if (!open) { setSearch(''); setShowCustom(false) }
        else setTimeout(() => searchRef.current?.focus(), 50)
    }, [open])

    useEffect(() => {
        if (!open) return
        const close = (e: MouseEvent) => {
            const t = e.target as Node
            // The menu is portalled to <body>, so it is not inside `ref` any
            // more and has to be asked separately or every click in it closes.
            if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
            setOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [open])

    /*
     * The menu is wider than its trigger and the trigger lives in a narrow
     * scrolling rail, so opening it used to widen the deck and push the whole
     * card left. It is portalled to <body> and positioned in viewport
     * coordinates instead: nothing in the rail can clip it, and it opens
     * *leftwards* — its right edge meets the trigger's — so the extra width
     * falls over the page rather than off the side of the panel.
     */
    useEffect(() => {
        if (!open) { setPos(null); return }

        const place = () => {
            const r = triggerRef.current?.getBoundingClientRect()
            if (!r) return
            const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8))
            const below = r.bottom + 4
            const top = below + MENU_MAX_H > window.innerHeight
                ? Math.max(8, window.innerHeight - MENU_MAX_H - 8)
                : below
            setPos({ top, left })
        }

        place()
        // `true` so it also fires for the rail's own scroller, not just the window.
        window.addEventListener('scroll', place, true)
        window.addEventListener('resize', place)
        return () => {
            window.removeEventListener('scroll', place, true)
            window.removeEventListener('resize', place)
        }
    }, [open])

    // Merge maps-system worlds with popular maps (deduplicate by name)
    const systemNames = new Set(worlds.map(w => w.name))
    const popularFiltered = POPULAR_MAPS.filter(m => !systemNames.has(m.name))

    const allMaps: { name: string; displayName: string; hasPreview: boolean; isSystem?: boolean }[] = [
        ...worlds.map(w => ({ ...w, isSystem: true })),
        ...popularFiltered.map(m => ({ ...m, hasPreview: false, isSystem: false })),
    ]

    const q = search.toLowerCase()
    const filtered = q
        ? allMaps.filter(m => m.displayName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
        : allMaps

    const systemMaps = filtered.filter(m => m.isSystem)
    const popularMaps = filtered.filter(m => !m.isSystem)

    function MapItem({ w }: { w: typeof allMaps[number] }) {
        const isActive = w.name === value
        return (
            <div
                className='mwp-item'
                onClick={() => { onChange(w.name); setOpen(false) }}
                style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 12px', cursor: 'pointer',
                    background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                    borderLeft: isActive ? `2px solid ${themeColor}` : '2px solid transparent',
                    fontSize: '0.78rem', color: isActive ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.6)',
                }}
            >
                {!isActive && <div className='mwp-hover' style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.04)', opacity: 0, transition: 'opacity 0.1s ease', pointerEvents: 'none', willChange: 'opacity' }} />}
                {w.hasPreview ? (
                    <img src={`/map-assets/${w.name}/preview.jpg`} alt='' loading='lazy' style={{ width: 40, height: 28, objectFit: 'cover', flexShrink: 0, border: `1px solid ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}` }} />
                ) : (
                    <div style={{ width: 40, height: 28, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>MAP</span>
                    </div>
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.displayName}</span>
                {w.isSystem && <span style={{ fontSize: '0.55rem', color: 'rgba(34,197,94,0.6)', flexShrink: 0, letterSpacing: '0.08em' }}>SYSTEM</span>}
            </div>
        )
    }

    return (
        <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
            <button
                ref={triggerRef}
                type='button'
                onClick={() => setOpen(v => !v)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(0,0,0,0.4)',
                    border: `1px solid ${open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                    color: selected ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.3)',
                    fontSize: '0.8rem', letterSpacing: '0.06em',
                    padding: '6px 10px', cursor: 'pointer', minWidth: 160,
                    transition: 'border-color 0.15s',
                }}
            >
                {selected && worlds.find(w => w.name === value)?.hasPreview && (
                    <img src={`/map-assets/${value}/preview.jpg`} alt='' style={{ width: 28, height: 20, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                )}
                <span style={{ flex: 1, textAlign: 'left' }}>{selected?.displayName ?? 'No Map'}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.4 }}>▾</span>
            </button>

            {open && createPortal(
                <div ref={menuRef} style={{
                    position: 'fixed',
                    top: pos ? pos.top : -9999,
                    left: pos ? pos.left : -9999,
                    visibility: pos ? 'visible' : 'hidden',
                    zIndex: 10000,
                    background: 'rgb(14,14,14)', border: '1px solid rgba(255,255,255,0.12)',
                    width: MENU_W, maxHeight: MENU_MAX_H,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                    display: 'flex', flexDirection: 'column',
                }}>
                    <style>{`.mwp-item:hover .mwp-hover{opacity:1!important}`}</style>

                    {/* Search */}
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder='Search maps…'
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem', padding: '5px 8px', outline: 'none', fontFamily: 'inherit' }}
                        />
                    </div>

                    {/* Custom map option */}
                    {!showCustom ? (
                        <button
                            type='button'
                            onClick={() => setShowCustom(true)}
                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(219,0,29,0.05)', borderTop: 'none', borderRight: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', borderLeft: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.7)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'left' }}
                        >
                            + Custom Map…
                        </button>
                    ) : (
                        <div style={{ flexShrink: 0, display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <input
                                autoFocus
                                value={customValue}
                                onChange={e => setCustomValue(e.target.value)}
                                placeholder='Enter map name…'
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && customValue.trim()) { onChange(customValue.trim()); setOpen(false) }
                                    if (e.key === 'Escape') setShowCustom(false)
                                }}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem', padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
                            />
                            <button type='button' onClick={() => { if (customValue.trim()) { onChange(customValue.trim()); setOpen(false) } }} style={{ background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.8)', fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}>OK</button>
                        </div>
                    )}

                    <div className='thin-scroll' style={{ overflowY: 'auto', flex: 1 }}>
                        {/* No map option */}
                        <div className='mwp-item' onClick={() => { onChange(''); setOpen(false) }}
                            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', background: !value ? 'rgba(255,255,255,0.06)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: 'rgba(237,237,237,0.35)' }}>
                            <div className='mwp-hover' style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.04)', opacity: 0, transition: 'opacity 0.1s ease', pointerEvents: 'none', willChange: 'opacity' }} />
                            <div style={{ width: 40, height: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>
                            </div>
                            No Map
                        </div>

                        {/* Maps system maps */}
                        {systemMaps.length > 0 && (
                            <>
                                <div style={{ padding: '5px 12px 3px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(34,197,94,0.5)' }}>Maps System</div>
                                {systemMaps.map(w => <MapItem key={w.name} w={w} />)}
                            </>
                        )}

                        {/* Popular Arma 3 maps */}
                        {popularMaps.length > 0 && (
                            <>
                                <div style={{ padding: '5px 12px 3px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>Arma 3 Maps</div>
                                {popularMaps.map(w => <MapItem key={w.name} w={w} />)}
                            </>
                        )}

                        {filtered.length === 0 && q && (
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No maps matching "{search}"</div>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    )
}
