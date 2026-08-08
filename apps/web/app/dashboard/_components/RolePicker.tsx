'use client'

import { useState, useEffect, useRef } from 'react'

interface GuildRole {
    id: string
    name: string
}

interface Props {
    value: string
    onChange: (role: string) => void
    placeholder?: string
    style?: React.CSSProperties
}

export default function RolePicker({ value, onChange, placeholder = 'Search roles…', style }: Props) {
    const [roles, setRoles]     = useState<GuildRole[]>([])
    const [loaded, setLoaded]   = useState(false)
    const [open, setOpen]       = useState(false)
    const [query, setQuery]     = useState('')
    const ref                   = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (loaded) return
        fetch('/api/admin/guild-roles')
            .then(r => r.json())
            .then(d => { setRoles(Array.isArray(d) ? d : []); setLoaded(true) })
            .catch(() => setLoaded(true))
    }, [loaded])

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const filtered = query.trim()
        ? roles.filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
        : roles

    const baseSx: React.CSSProperties = {
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(237,237,237,0.75)', fontSize: '0.75rem', padding: '5px 8px',
        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
        ...style,
    }

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            <div style={{ display: 'flex', gap: 0 }}>
                <input
                    value={open ? query : value}
                    onChange={e => { setQuery(e.target.value); setOpen(true) }}
                    onFocus={() => { setOpen(true); setQuery('') }}
                    placeholder={value || placeholder}
                    style={{ ...baseSx, flex: 1 }}
                />
                {value && (
                    <button
                        type='button'
                        onClick={() => { onChange(''); setQuery('') }}
                        style={{ all: 'unset', padding: '4px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderLeft: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', fontSize: 12 }}
                    >✕</button>
                )}
            </div>

            {open && (
                <div
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#111', border: '1px solid rgba(255,255,255,0.14)', maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
                    onWheel={e => e.stopPropagation()}
                >
                    {!loaded && (
                        <div style={{ padding: '8px 12px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>Loading roles…</div>
                    )}
                    {loaded && filtered.length === 0 && (
                        <div style={{ padding: '8px 12px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>No roles found</div>
                    )}
                    {filtered.map(r => (
                        <button
                            key={r.id}
                            type='button'
                            onClick={() => { onChange(r.name); setOpen(false); setQuery('') }}
                            style={{ display: 'block', width: '100%', padding: '7px 12px', background: value === r.name ? 'rgba(219,0,29,0.1)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', color: value === r.name ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.7)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={e => { if (value !== r.name) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                            onMouseLeave={e => { if (value !== r.name) e.currentTarget.style.background = 'transparent' }}
                        >
                            {r.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
