'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'
import { RANK_GROUPS, RANKS_FLAT, rankAbbrFromName, rankNameFromAbbr } from '@/lib/ranks'


let _keyCount = 0


const AWARD_TYPES = [
    'Non-Operational Award',
    'Service Citation',
    'Operational Service Citation',
    'Period of Service Citation'
]

function todayStr() {
    return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Promotion = { _key: string; date: string; rank: string; role: string }
type Award = { _key: string; date: string; name: string; type: string }
type Operation = { _key: string; startToEndDate: string; name: string }


// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.9)',
    padding: '6px 10px',
    fontSize: '0.82rem',
    outline: 'none',
    width: '100%',
}

const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    background: 'rgb(18,18,18)',
    colorScheme: 'dark',
}

function Label({ children }: { children: React.ReactNode }) {
    return (
        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
            {children}
        </span>
    )
}

function SectionCard({ title, children, onAdd, addLabel }: { title: string; children: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)' }}>
            <div className='flex items-center justify-between px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    {title}
                </span>
                {onAdd && (
                    <button
                        onClick={onAdd}
                        style={{
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: 'rgba(219,0,29,0.8)', background: 'rgba(219,0,29,0.08)',
                            border: '1px solid rgba(219,0,29,0.25)', padding: '3px 10px', cursor: 'pointer',
                        }}
                    >
                        + {addLabel ?? 'Add'}
                    </button>
                )}
            </div>
            <div className='p-4 flex flex-col gap-3'>
                {children}
            </div>
        </div>
    )
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title='Remove'
            style={{
                alignSelf: 'stretch', display: 'flex', alignItems: 'center',
                background: 'transparent', border: '1px solid rgba(219,0,29,0.25)',
                color: 'rgba(219,0,29,0.6)', padding: '0 8px', cursor: 'pointer',
                fontSize: '0.75rem', lineHeight: 1, flexShrink: 0,
            }}
        >
            ✕
        </button>
    )
}


// ── Rank search select ─────────────────────────────────────────────────────────

function RankSelect({ value, onChange, placeholder = '— None —' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const ref = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!open) return
        inputRef.current?.focus()
        function onDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    const q = query.toLowerCase()
    const filtered = RANK_GROUPS.map(g => ({
        ...g,
        ranks: g.ranks.filter(r => r.name.toLowerCase().includes(q) || r.abbr.toLowerCase().includes(q)),
    })).filter(g => g.ranks.length > 0)

    const display = RANKS_FLAT.find(r => r.name === value)
    const label = display ? `${display.abbr} — ${display.name}` : placeholder

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            <button
                type='button'
                onClick={() => { setOpen(o => !o); setQuery('') }}
                style={{
                    ...selectStyle,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                    textAlign: 'left', width: '100%',
                    color: value ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.4, flexShrink: 0 }}>▼</span>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'rgb(18,18,18)', border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
                    maxHeight: 320,
                }}>
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
                            placeholder='Search rank…'
                            style={{ ...inputStyle, fontSize: '0.78rem', padding: '5px 8px' }}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {!value && (
                            <div
                                onMouseDown={() => { onChange(''); setOpen(false) }}
                                style={{
                                    padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer',
                                    color: 'rgba(237,237,237,0.35)',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {placeholder}
                            </div>
                        )}
                        {filtered.map(g => (
                            <div key={g.group}>
                                <div style={{
                                    padding: '5px 12px 3px', fontSize: '0.6rem', fontWeight: 700,
                                    letterSpacing: '0.12em', textTransform: 'uppercase',
                                    color: 'rgba(219,0,29,0.6)', borderTop: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    {g.group}
                                </div>
                                {g.ranks.map(r => (
                                    <div
                                        key={r.name}
                                        onMouseDown={() => { onChange(r.name); setOpen(false); setQuery('') }}
                                        style={{
                                            padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer',
                                            background: r.name === value ? 'rgba(219,0,29,0.12)' : 'transparent',
                                            color: r.name === value ? 'rgba(237,237,237,1)' : 'rgba(237,237,237,0.75)',
                                        }}
                                        onMouseEnter={e => { if (r.name !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = r.name === value ? 'rgba(219,0,29,0.12)' : 'transparent' }}
                                    >
                                        <span style={{ color: 'rgba(237,237,237,0.4)', marginRight: 8, fontSize: '0.72rem' }}>{r.abbr}</span>
                                        {r.name}
                                    </div>
                                ))}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ padding: '10px 12px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                                No ranks match "{query}"
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}


// ── Insertion line ─────────────────────────────────────────────────────────────

function InsertionLine() {
    return (
        <div style={{ height: 2, background: 'rgba(219,0,29,0.7)', borderRadius: 1, animation: 'ilIn 0.12s ease' }} />
    )
}


// ── Drag handle ────────────────────────────────────────────────────────────────

function DragHandle() {
    return (
        <div style={{
            alignSelf: 'stretch', display: 'flex', alignItems: 'center',
            cursor: 'grab', padding: '0 4px', color: 'rgba(255,255,255,0.2)',
            fontSize: '0.9rem', lineHeight: 1, flexShrink: 0, userSelect: 'none',
        }}>
            ⠿
        </div>
    )
}


// ── Main component ─────────────────────────────────────────────────────────────

export default function MilpacEditor({ member }: { member: User }) {
    const strippedNickname = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const fullDisplay = strippedNickname || member.globalName || member.username
    const nameParts = fullDisplay.split(' ')
    const displayName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : fullDisplay

    const [bioRank, setBioRank] = useState(rankNameFromAbbr(member.milpac?.currentRank ?? member.bio?.rank ?? ''))
    const joinDateStr = member.guild?.joinedTimestamp
        ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        : ''
    const [enlistedDate, setEnlistedDate] = useState(member.milpac?.enlistedDate || joinDateStr)
    const [promotions, setPromotions] = useState<Promotion[]>(() =>
        (member.milpac?.promotions ?? []).map(p => ({ _key: String(_keyCount++), ...p })))
    const [awards, setAwards] = useState<Award[]>(() =>
        (member.milpac?.awards ?? []).map(a => ({ _key: String(_keyCount++), ...a })))
    const [operations, setOperations] = useState<Operation[]>(() =>
        (member.milpac?.operations ?? []).map(o => ({ _key: String(_keyCount++), ...o })))

    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [uniformFile, setUniformFile] = useState<File | null>(null)
    const [uniformPreview, setUniformPreview] = useState<string | null>(null)
    const [uniformUploading, setUniformUploading] = useState(false)
    const [uniformSaved, setUniformSaved] = useState(false)
    const [uniformError, setUniformError] = useState<string | null>(null)
    const [uniformKey, setUniformKey] = useState(0)

    function onUniformChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null
        setUniformFile(file)
        setUniformSaved(false)
        setUniformError(null)
        if (file) setUniformPreview(URL.createObjectURL(file))
    }

    async function uploadUniform() {
        if (!uniformFile) return
        setUniformUploading(true)
        setUniformError(null)
        try {
            const fd = new FormData()
            fd.append('file', uniformFile)
            const res = await fetch(`/api/milpacs/${member.username}`, { method: 'POST', body: fd })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Upload failed')
            setUniformSaved(true)
            setUniformFile(null)
            setUniformPreview(null)
            setUniformKey(k => k + 1)
        } catch (e: any) {
            setUniformError(e.message)
        } finally {
            setUniformUploading(false)
        }
    }

    // ── Drag state ─────────────────────────────────────────────────────────────

    const dragSrc = useRef<{ list: string; index: number } | null>(null)
    const [dragging, setDragging] = useState<{ list: string; index: number } | null>(null)
    const [dragOver, setDragOver] = useState<{ list: string; index: number } | null>(null)
    // Show insertion line above item i when dragging down toward it (src < i),
    // or below when dragging up toward it (src > i)
    function showLine(list: string, i: number, pos: 'above' | 'below') {
        if (!dragging || !dragOver) return false
        if (dragOver.list !== list || dragOver.index !== i) return false
        if (dragging.list !== list || dragging.index === i) return false
        return pos === 'above' ? dragging.index > i : dragging.index < i
    }

    function dragProps<T>(list: string, items: T[], setItems: React.Dispatch<React.SetStateAction<T[]>>, i: number) {
        return {
            draggable: true as const,
            onDragStart: () => { dragSrc.current = { list, index: i }; setDragging({ list, index: i }) },
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver({ list, index: i }) },
            onDragLeave: () => setDragOver(null),
            onDrop: (e: React.DragEvent) => {
                e.preventDefault()
                setDragOver(null)
                const src = dragSrc.current
                if (!src || src.list !== list || src.index === i) return
                const next = [...items]
                const [moved] = next.splice(src.index, 1)
                next.splice(i, 0, moved)
                setItems(next)
                dragSrc.current = null
            },
            onDragEnd: () => { dragSrc.current = null; setDragging(null); setDragOver(null) },
        }
    }

    async function handleSave() {
        setSaving(true)
        setSaved(false)
        setError(null)
        try {
            const res = await fetch(`/api/members/${member.username}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bioRank: rankAbbrFromName(bioRank), enlistedDate,
                    promotions: promotions.map(({ _key, ...rest }) => rest),
                    awards: awards.map(({ _key, ...rest }) => rest),
                    operations: operations.map(({ _key, ...rest }) => rest),
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Save failed')
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Promotion helpers ──────────────────────────────────────────────────────

    function addPromotion() {
        setPromotions(prev => [...prev, { _key: String(_keyCount++), date: todayStr(), rank: RANKS_FLAT[0].name, role: '' }])
    }
    function updatePromotion(i: number, field: keyof Promotion, value: string) {
        setPromotions(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
    }
    function removePromotion(i: number) {
        setPromotions(prev => prev.filter((_, idx) => idx !== i))
    }

    // ── Award helpers ──────────────────────────────────────────────────────────

    function addAward() {
        setAwards(prev => [...prev, { _key: String(_keyCount++), date: todayStr(), name: '', type: AWARD_TYPES[0] }])
    }
    function updateAward(i: number, field: keyof Award, value: string) {
        setAwards(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
    }
    function removeAward(i: number) {
        setAwards(prev => prev.filter((_, idx) => idx !== i))
    }

    // ── Operation helpers ──────────────────────────────────────────────────────

    function addOperation() {
        setOperations(prev => [...prev, { _key: String(_keyCount++), startToEndDate: `${todayStr()} - ${todayStr()}`, name: '' }])
    }
    function updateOperation(i: number, field: keyof Operation, value: string) {
        setOperations(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o))
    }
    function removeOperation(i: number) {
        setOperations(prev => prev.filter((_, idx) => idx !== i))
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[900px] mx-auto'>
            <style>{`@keyframes ilIn { from { opacity: 0; transform: scaleX(0.6) } to { opacity: 1; transform: scaleX(1) } }`}</style>

            {/* Back nav */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-4'>
                    <Link
                        href='/members'
                        style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', textDecoration: 'none' }}
                    >
                        ← All Members
                    </Link>
                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                        {member.milpac?.currentRank && (
                            <span style={{ color: 'rgba(219,0,29,0.5)', marginRight: '0.4em' }}>{member.milpac.currentRank}</span>
                        )}
                        {displayName}
                    </span>
                </div>
                <Link
                    href={`/milpacs/${member.username}`}
                    style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', textDecoration: 'none', padding: '5px 12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}
                >
                    View Profile ↗
                </Link>
            </div>

            {/* Member header */}
            <div
                className='flex items-center gap-4 p-5'
                style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)' }}
            >
                <div style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                    <Avatar user={member} />
                </div>
                <div className='flex flex-col gap-1'>
                    <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {member.milpac?.currentRank && (
                            <span style={{ color: 'rgba(219,0,29,0.7)', marginRight: '0.35em', fontWeight: 400, letterSpacing: '0.12em' }}>{member.milpac.currentRank}</span>
                        )}
                        {displayName}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.04em' }}>@{member.username}</span>
                </div>
            </div>

            {/* Basic Info */}
            <SectionCard title='Basic Info'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div className='flex flex-col gap-2'>
                        <Label>Current Rank</Label>
                        <RankSelect value={bioRank} onChange={setBioRank} />
                    </div>
                    <div className='flex flex-col gap-2'>
                        <Label>Enlisted Date</Label>
                        <input
                            value={enlistedDate}
                            onChange={e => setEnlistedDate(e.target.value)}
                            placeholder='e.g. 15 August 2020'
                            style={inputStyle}
                        />
                    </div>
                </div>
            </SectionCard>

            {/* Promotions */}
            <SectionCard title='Promotion History' onAdd={addPromotion} addLabel='Promotion'>
                {promotions.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No promotions on record.</span>
                ) : (
                    promotions.map((p, i) => (
                        <Fragment key={p._key}>
                            {showLine('promotions', i, 'above') && <InsertionLine />}
                            <div className='flex gap-2 items-end' {...dragProps('promotions', promotions, setPromotions, i)} style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: dragging?.list === 'promotions' && dragging.index === i ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                                <DragHandle />
                                <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}>
                                    <Label>Date</Label>
                                    <input value={p.date} onChange={e => updatePromotion(i, 'date', e.target.value)} placeholder='15 Aug 2020' style={inputStyle} />
                                </div>
                                <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                    <Label>Rank</Label>
                                    <RankSelect value={p.rank} onChange={v => updatePromotion(i, 'rank', v)} placeholder='— Select Rank —' />
                                </div>
                                <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                    <Label>Role</Label>
                                    <input value={p.role} onChange={e => updatePromotion(i, 'role', e.target.value)} placeholder='Rifleman' style={inputStyle} />
                                </div>
                                <DeleteBtn onClick={() => removePromotion(i)} />
                            </div>
                            {showLine('promotions', i, 'below') && <InsertionLine />}
                        </Fragment>
                    ))
                )}
            </SectionCard>

            {/* Awards */}
            <SectionCard title='Awards & Commendations' onAdd={addAward} addLabel='Award'>
                {awards.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No awards on record.</span>
                ) : (
                    awards.map((a, i) => (
                        <Fragment key={a._key}>
                            {showLine('awards', i, 'above') && <InsertionLine />}
                            <div className='flex gap-2 items-end' {...dragProps('awards', awards, setAwards, i)} style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: dragging?.list === 'awards' && dragging.index === i ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                                <DragHandle />
                                <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}>
                                    <Label>Date</Label>
                                    <input value={a.date} onChange={e => updateAward(i, 'date', e.target.value)} placeholder='05 Feb 2022' style={inputStyle} />
                                </div>
                                <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                    <Label>Name</Label>
                                    <input value={a.name} onChange={e => updateAward(i, 'name', e.target.value)} placeholder='Broken Lance Award' style={inputStyle} />
                                </div>
                                <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                    <Label>Type</Label>
                                    <select value={a.type} onChange={e => updateAward(i, 'type', e.target.value)} style={selectStyle}>
                                        {AWARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <DeleteBtn onClick={() => removeAward(i)} />
                            </div>
                            {showLine('awards', i, 'below') && <InsertionLine />}
                        </Fragment>
                    ))
                )}
            </SectionCard>

            {/* Operations */}
            <SectionCard title='Operation History' onAdd={addOperation} addLabel='Operation'>
                {operations.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No operations on record.</span>
                ) : (
                    operations.map((op, i) => (
                        <Fragment key={op._key}>
                            {showLine('operations', i, 'above') && <InsertionLine />}
                            <div className='flex gap-2 items-end' {...dragProps('operations', operations, setOperations, i)} style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: dragging?.list === 'operations' && dragging.index === i ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                                <DragHandle />
                                <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 160, maxWidth: 220 }}>
                                    <Label>Date Range</Label>
                                    <input value={op.startToEndDate} onChange={e => updateOperation(i, 'startToEndDate', e.target.value)} placeholder='13 Sep 2020 - 12 Oct 2020' style={inputStyle} />
                                </div>
                                <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                    <Label>Operation Name</Label>
                                    <input value={op.name} onChange={e => updateOperation(i, 'name', e.target.value)} placeholder='Operation Promulgate' style={inputStyle} />
                                </div>
                                <DeleteBtn onClick={() => removeOperation(i)} />
                            </div>
                            {showLine('operations', i, 'below') && <InsertionLine />}
                        </Fragment>
                    ))
                )}
            </SectionCard>

            {/* Uniform */}
            <SectionCard title='Uniform'>
                <div className='flex gap-6 items-start'>
                    {/* Current / preview image */}
                    <div style={{ flexShrink: 0, width: 120, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, overflow: 'hidden' }}>
                        {uniformPreview ? (
                            <img src={uniformPreview} alt='preview' style={{ width: '100%', objectFit: 'contain' }} />
                        ) : (
                            <img
                                key={uniformKey}
                                src={`/api/milpacs/${member.username}`}
                                alt='uniform'
                                style={{ width: '100%', objectFit: 'contain' }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                        )}
                    </div>

                    <div className='flex flex-col gap-3 flex-1'>
                        <Label>Upload Uniform Image</Label>
                        <input
                            type='file'
                            accept='image/png'
                            onChange={onUniformChange}
                            style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)', cursor: 'pointer' }}
                        />
                        <div className='flex items-center gap-3'>
                            <button
                                onClick={uploadUniform}
                                disabled={!uniformFile || uniformUploading}
                                style={{
                                    padding: '6px 16px', fontSize: '0.75rem', fontWeight: 700,
                                    letterSpacing: '0.1em', textTransform: 'uppercase', cursor: uniformFile ? 'pointer' : 'not-allowed',
                                    background: uniformFile ? 'rgba(219,0,29,0.15)' : 'transparent',
                                    border: '1px solid rgba(219,0,29,0.3)', color: uniformFile ? 'rgba(219,0,29,0.9)' : 'rgba(219,0,29,0.3)',
                                }}
                            >
                                {uniformUploading ? 'Uploading…' : 'Upload'}
                            </button>
                            {uniformSaved && <span style={{ fontSize: '0.75rem', color: 'rgba(80,200,80,0.7)' }}>Saved.</span>}
                            {uniformError && <span style={{ fontSize: '0.75rem', color: 'rgba(219,0,29,0.8)' }}>{uniformError}</span>}
                        </div>
                    </div>
                </div>
            </SectionCard>

            {/* Save bar */}
            <div className='flex items-center justify-between gap-4 py-2'>
                {error && (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>
                )}
                {saved && !error && (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(80,200,80,0.7)' }}>Saved successfully.</span>
                )}
                {!error && !saved && <span />}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        background: saving ? 'rgba(219,0,29,0.3)' : 'var(--red)',
                        border: '1px solid var(--red)',
                        color: 'white',
                        padding: '10px 28px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                    }}
                >
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
            </div>

        </div>
    )
}
