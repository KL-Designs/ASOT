'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'


const RANKS = [
    'ASOT Commanding Officer', 'ASOT Officer Commanding', 'Captain',
    'Warrant Officer Class 1', 'Warrant Officer Class 2',
    'Flight Lieutenant', 'Squadron Leader', ' Wing Commander',
    'Lieutenant', 'Sergeant', 'Corporal', 'Lance Corporal',
    'Private', 'Recruit',
]

const AWARD_TYPES = [
    'Non-Operational Award',
    'Service Citation',
    'Operational Service Citation',
    'Period of Service Citation'
]

function todayStr() {
    return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Promotion = { date: string; rank: string; role: string }
type Award = { date: string; name: string; type: string }
type Operation = { startToEndDate: string; name: string }


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
                background: 'transparent', border: '1px solid rgba(219,0,29,0.25)',
                color: 'rgba(219,0,29,0.6)', padding: '4px 8px', cursor: 'pointer',
                fontSize: '0.75rem', lineHeight: 1, flexShrink: 0,
            }}
        >
            ✕
        </button>
    )
}


// ── Main component ─────────────────────────────────────────────────────────────

export default function MilpacEditor({ member }: { member: User }) {
    const displayName = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || member.globalName || member.username

    const [bioRank, setBioRank] = useState(member.bio?.rank ?? '')
    const joinDateStr = member.guild?.joinedTimestamp
        ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        : ''
    const [enlistedDate, setEnlistedDate] = useState(member.milpac?.enlistedDate || joinDateStr)
    const [promotions, setPromotions] = useState<Promotion[]>(member.milpac?.promotions ?? [])
    const [awards, setAwards] = useState<Award[]>(member.milpac?.awards ?? [])
    const [operations, setOperations] = useState<Operation[]>(member.milpac?.operations ?? [])

    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSave() {
        setSaving(true)
        setSaved(false)
        setError(null)
        try {
            const res = await fetch(`/api/members/${member.username}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bioRank, enlistedDate, promotions, awards, operations }),
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
        setPromotions(prev => [...prev, { date: todayStr(), rank: RANKS[RANKS.length - 1], role: '' }])
    }
    function updatePromotion(i: number, field: keyof Promotion, value: string) {
        setPromotions(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
    }
    function removePromotion(i: number) {
        setPromotions(prev => prev.filter((_, idx) => idx !== i))
    }

    // ── Award helpers ──────────────────────────────────────────────────────────

    function addAward() {
        setAwards(prev => [...prev, { date: todayStr(), name: '', type: AWARD_TYPES[0] }])
    }
    function updateAward(i: number, field: keyof Award, value: string) {
        setAwards(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
    }
    function removeAward(i: number) {
        setAwards(prev => prev.filter((_, idx) => idx !== i))
    }

    // ── Operation helpers ──────────────────────────────────────────────────────

    function addOperation() {
        setOperations(prev => [...prev, { startToEndDate: `${todayStr()} - ${todayStr()}`, name: '' }])
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

            {/* Back nav */}
            <div className='flex items-center gap-4'>
                <Link
                    href='/members'
                    style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', textDecoration: 'none' }}
                >
                    ← All Members
                </Link>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                    {displayName}
                </span>
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
                    <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{displayName}</span>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.04em' }}>@{member.username}</span>
                </div>
            </div>

            {/* Basic Info */}
            <SectionCard title='Basic Info'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div className='flex flex-col gap-2'>
                        <Label>Current Rank</Label>
                        <select value={bioRank} onChange={e => setBioRank(e.target.value)} style={selectStyle}>
                            <option value=''>— None —</option>
                            {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
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
                        <div key={i} className='flex gap-2 items-end' style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}>
                                <Label>Date</Label>
                                <input value={p.date} onChange={e => updatePromotion(i, 'date', e.target.value)} placeholder='15 Aug 2020' style={inputStyle} />
                            </div>
                            <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                <Label>Rank</Label>
                                <select value={p.rank} onChange={e => updatePromotion(i, 'rank', e.target.value)} style={selectStyle}>
                                    {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                <Label>Role</Label>
                                <input value={p.role} onChange={e => updatePromotion(i, 'role', e.target.value)} placeholder='Rifleman' style={inputStyle} />
                            </div>
                            <DeleteBtn onClick={() => removePromotion(i)} />
                        </div>
                    ))
                )}
            </SectionCard>

            {/* Awards */}
            <SectionCard title='Awards & Commendations' onAdd={addAward} addLabel='Award'>
                {awards.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No awards on record.</span>
                ) : (
                    awards.map((a, i) => (
                        <div key={i} className='flex gap-2 items-end' style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
                    ))
                )}
            </SectionCard>

            {/* Operations */}
            <SectionCard title='Operation History' onAdd={addOperation} addLabel='Operation'>
                {operations.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No operations on record.</span>
                ) : (
                    operations.map((op, i) => (
                        <div key={i} className='flex gap-2 items-end' style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
                    ))
                )}
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
