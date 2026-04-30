'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Close, Person } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

interface Member { id: string; displayName: string }

interface Props {
    value: string[]           // array of displayName strings
    onChange: (v: string[]) => void
    placeholder?: string
    multi?: boolean
    required?: boolean
    disabled?: boolean
}

export default function MemberSelect({ value, onChange, placeholder = 'Search member…', multi = false, required = false, disabled = false }: Props) {
    const [query, setQuery] = useState('')
    const [members, setMembers] = useState<Member[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)

    const load = useCallback(async () => {
        if (loaded) return
        setLoading(true)
        try {
            const res = await fetch('/api/admin/members')
            const data = await res.json()
            setMembers(data.members ?? [])
            setLoaded(true)
        } catch { /* ignore */ }
        setLoading(false)
    }, [loaded])

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    const filtered = members.filter(m =>
        m.displayName.toLowerCase().includes(query.toLowerCase()) &&
        !value.includes(m.displayName)
    ).slice(0, 20)

    function select(name: string) {
        if (multi) {
            onChange([...value, name])
        } else {
            onChange([name])
            setOpen(false)
            setQuery('')
        }
    }

    function remove(name: string) {
        onChange(value.filter(v => v !== name))
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.12)', borderBottom: '1px solid rgba(255,255,255,0.18)',
        color: 'rgba(237,237,237,0.9)', fontSize: '0.875rem', outline: 'none',
        boxSizing: 'border-box', borderRadius: 0, fontFamily: 'inherit',
    }

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            {/* Selected chips */}
            {value.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {value.map(v => (
                        <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', fontSize: '0.72rem', color: 'rgba(237,237,237,0.8)' }}>
                            <Person style={{ fontSize: 12, color: 'rgba(219,0,29,0.6)' }} />
                            {v}
                            {!disabled && (
                                <button type='button' onClick={() => remove(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', display: 'flex', padding: 0 }}>
                                    <Close style={{ fontSize: 11 }} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Search input */}
            {(multi || value.length === 0) && (
                <div style={{ position: 'relative' }}>
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onFocus={() => { setOpen(true); load() }}
                        placeholder={placeholder}
                        required={required && value.length === 0}
                        disabled={disabled}
                        style={inputStyle}
                    />
                    {loading && (
                        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                            <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)' }} />
                        </div>
                    )}
                </div>
            )}

            {/* Dropdown */}
            {open && loaded && filtered.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', maxHeight: 220, overflowY: 'auto' }}>
                    {filtered.map(m => (
                        <button key={m.id} type='button' onMouseDown={() => select(m.displayName)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.8)', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                            <Person style={{ fontSize: 14, color: 'rgba(219,0,29,0.5)' }} />
                            {m.displayName}
                        </button>
                    ))}
                </div>
            )}

            {/* No results */}
            {open && loaded && filtered.length === 0 && query && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', padding: '8px 12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>
                        No member found — you may type a name manually and press Enter
                    </span>
                    <button type='button' onMouseDown={() => { select(query); setQuery('') }} style={{ display: 'block', marginTop: 4, fontSize: '0.7rem', color: 'rgba(0,195,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                        Add &ldquo;{query}&rdquo; manually
                    </button>
                </div>
            )}
        </div>
    )
}
