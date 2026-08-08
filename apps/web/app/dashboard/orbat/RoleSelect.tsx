'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
    category: string
    value: string | null              // currently selected OrbatRole _id, or null
    onChange: (roleId: string, roleName: string) => void
    placeholder?: string
}

export default function RoleSelect({ category, value, onChange, placeholder = 'Select a role…' }: Props) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [loaded, setLoaded] = useState(false)
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (loaded) return
        fetch('/api/admin/orbat/roles')
            .then(r => r.json())
            .then(d => { setRoles(Array.isArray(d.roles) ? d.roles : []); setLoaded(true) })
            .catch(() => setLoaded(true))
    }, [loaded])

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const relevant = roles.filter(r => r.categories.length === 0 || r.categories.includes(category))
    const filtered = query.trim()
        ? relevant.filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
        : relevant

    const selected = roles.find(r => String(r._id) === value)

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            <input
                value={open ? query : (selected?.name ?? '')}
                onChange={e => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => { setOpen(true); setQuery('') }}
                placeholder={placeholder}
                style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(237,237,237,0.85)', fontSize: '0.73rem', padding: '2px 6px',
                    outline: 'none', width: '100%', boxSizing: 'border-box', height: 24,
                }}
            />
            {open && (
                <div
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#111', border: '1px solid rgba(255,255,255,0.14)', maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
                    onWheel={e => e.stopPropagation()}
                >
                    {!loaded && <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>Loading roles…</div>}
                    {loaded && filtered.length === 0 && <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)' }}>No roles found</div>}
                    {filtered.map(r => (
                        <button
                            key={String(r._id)}
                            type='button'
                            onClick={() => { onChange(String(r._id), r.name); setOpen(false); setQuery('') }}
                            style={{ display: 'block', width: '100%', padding: '6px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(237,237,237,0.75)', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'left' }}
                        >
                            {r.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
