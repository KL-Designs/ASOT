'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'


type RankEntry = { name: string; abbr: string }
type RankGroup = { group: string; ranks: RankEntry[] }

const RANK_GROUPS: RankGroup[] = [
    {
        group: 'Entry',
        ranks: [
            { name: 'Recruit',                          abbr: 'REC'     },
        ],
    },
    {
        group: 'MIKE — Infantry (Enlisted)',
        ranks: [
            { name: 'Private',                          abbr: 'PTE'     },
            { name: 'Private Proficient',               abbr: 'PTE(P)'  },
            { name: 'Leading Private',                  abbr: 'PTE(L)'  },
            { name: 'Senior Private',                   abbr: 'PTE(S)'  },
            { name: 'Senior Leading Private',           abbr: 'PTE(SL)' },
        ],
    },
    {
        group: 'ECHO — Engineers (Enlisted)',
        ranks: [
            { name: 'Sapper',                           abbr: 'SAP'     },
            { name: 'Sapper Proficient',                abbr: 'SAP(P)'  },
            { name: 'Leading Sapper',                   abbr: 'SAP(L)'  },
            { name: 'Senior Sapper',                    abbr: 'SAP(S)'  },
            { name: 'Senior Leading Sapper',            abbr: 'SAP(SL)' },
        ],
    },
    {
        group: 'GOLF — Artillery (Enlisted)',
        ranks: [
            { name: 'Gunner',                           abbr: 'GNR'     },
            { name: 'Gunner Proficient',                abbr: 'GNR(P)'  },
            { name: 'Leading Gunner',                   abbr: 'GNR(L)'  },
            { name: 'Senior Gunner',                    abbr: 'GNR(S)'  },
            { name: 'Senior Leading Gunner',            abbr: 'GNR(SL)' },
        ],
    },
    {
        group: 'VICTOR — Cavalry (Enlisted)',
        ranks: [
            { name: 'Trooper',                          abbr: 'TPR'     },
            { name: 'Trooper Proficient',               abbr: 'TPR(P)'  },
            { name: 'Leading Trooper',                  abbr: 'TPR(L)'  },
            { name: 'Senior Trooper',                   abbr: 'TPR(S)'  },
            { name: 'Senior Leading Trooper',           abbr: 'TPR(SL)' },
        ],
    },
    {
        group: 'Lance Corporal Billet (MIKE / ECHO / VICTOR)',
        ranks: [
            { name: 'Junior Lance Corporal',            abbr: 'LCPL(J)' },
            { name: 'Lance Corporal',                   abbr: 'LCPL'    },
            { name: 'Lance Corporal Proficient',        abbr: 'LCPL(P)' },
            { name: 'Leading Lance Corporal',           abbr: 'LCPL(L)' },
            { name: 'Senior Lance Corporal',            abbr: 'LCPL(S)' },
        ],
    },
    {
        group: 'Lance Bombardier Billet (GOLF)',
        ranks: [
            { name: 'Junior Lance Bombardier',          abbr: 'LBDR(J)' },
            { name: 'Lance Bombardier',                 abbr: 'LBDR'    },
            { name: 'Lance Bombardier Proficient',      abbr: 'LBDR(P)' },
            { name: 'Leading Lance Bombardier',         abbr: 'LBDR(L)' },
            { name: 'Senior Lance Bombardier',          abbr: 'LBDR(S)' },
        ],
    },
    {
        group: 'Corporal Billet (MIKE / ECHO / VICTOR)',
        ranks: [
            { name: 'Junior Corporal',                  abbr: 'CPL(J)'  },
            { name: 'Corporal',                         abbr: 'CPL'     },
            { name: 'Corporal Proficient',              abbr: 'CPL(P)'  },
            { name: 'Leading Corporal',                 abbr: 'CPL(L)'  },
            { name: 'Senior Corporal',                  abbr: 'CPL(S)'  },
        ],
    },
    {
        group: 'Bombardier Billet (GOLF)',
        ranks: [
            { name: 'Junior Bombardier',                abbr: 'BDR(J)'  },
            { name: 'Bombardier',                       abbr: 'BDR'     },
            { name: 'Bombardier Proficient',            abbr: 'BDR(P)'  },
            { name: 'Leading Bombardier',               abbr: 'BDR(L)'  },
            { name: 'Senior Bombardier',                abbr: 'BDR(S)'  },
        ],
    },
    {
        group: 'Signaller',
        ranks: [
            { name: 'Signaller',                        abbr: 'SIG'     },
            { name: 'Signaller Proficient',             abbr: 'SIG(P)'  },
            { name: 'Leading Signaller',                abbr: 'SIG(L)'  },
            { name: 'Senior Signaller',                 abbr: 'SIG(S)'  },
            { name: 'Senior Leading Signaller',         abbr: 'SIG(SL)' },
        ],
    },
    {
        group: 'SNCO — Sergeant Billet',
        ranks: [
            { name: 'Sergeant',                         abbr: 'SGT'     },
            { name: 'Staff Sergeant',                   abbr: 'SSGT'    },
            { name: 'Sergeant-at-Arms',                 abbr: 'SAM'     },
            { name: 'Senior Sergeant-at-Arms',          abbr: 'SSAM'    },
            { name: 'Platoon Sergeant Major',           abbr: 'PSM'     },
            { name: 'Platoon Technician Sergeant',      abbr: 'PTSG'    },
            { name: 'Battery Sergeant',                 abbr: 'B/SGT'   },
            { name: 'Troop Sergeant Major',             abbr: 'T/SGM'   },
        ],
    },
    {
        group: 'Officer Billet',
        ranks: [
            { name: 'Officer Cadet',                    abbr: 'OCDT'    },
            { name: '2nd Lieutenant',                   abbr: '2LT'     },
            { name: 'Lieutenant',                       abbr: 'LT'      },
            { name: 'Senior Lieutenant',                abbr: 'SLT'     },
            { name: 'Commanding Lieutenant',            abbr: 'CLT'     },
        ],
    },
    {
        group: 'Warrant Officer Billet',
        ranks: [
            { name: 'Warrant Officer 2',                abbr: 'WO2'     },
            { name: 'Warrant Officer 1',                abbr: 'WO1'     },
            { name: 'Company Sergeant Major',           abbr: 'CSM'     },
            { name: 'Regimental Sergeant Major',        abbr: 'RSM'     },
            { name: 'RSM of ASOT',                      abbr: 'RSM-A'   },
        ],
    },
    {
        group: 'Command',
        ranks: [
            { name: 'Staff Captain',                    abbr: 'SCAPT'   },
            { name: 'Captain',                          abbr: 'CAPT'    },
            { name: 'Major',                            abbr: 'MAJ'     },
            { name: 'Lieutenant Colonel',               abbr: 'LTCOL'   },
            { name: 'Colonel',                          abbr: 'COL'     },
            { name: 'Brigadier',                        abbr: 'BRIG'    },
            { name: 'Major General',                    abbr: 'MAJGEN'  },
            { name: 'Lieutenant General',               abbr: 'LTGEN'   },
            { name: 'General',                          abbr: 'GEN'     },
            { name: 'Chief of ASOT',                    abbr: 'CA'      },
        ],
    },
    {
        group: 'HOTEL — Crew',
        ranks: [
            { name: 'Aircraftsman',                     abbr: 'AC'      },
            { name: 'Leading Aircraftsman',             abbr: 'LAC'     },
            { name: 'Loadmaster',                       abbr: 'LM'      },
            { name: 'Senior Loadmaster',                abbr: 'LM(S)'   },
            { name: 'Flight Sergeant',                  abbr: 'FSGT'    },
        ],
    },
    {
        group: 'HOTEL — Pilot',
        ranks: [
            { name: 'Pilot Officer',                    abbr: 'POF'     },
            { name: 'Flying Officer',                   abbr: 'FOF'     },
            { name: 'Flight Lieutenant',                abbr: 'FLT'     },
            { name: 'Senior Flight Lieutenant',         abbr: 'FLT(S)'  },
        ],
    },
    {
        group: 'HOTEL — Officer',
        ranks: [
            { name: 'Flight Leader',                    abbr: 'FLL'     },
            { name: 'Squadron Leader',                  abbr: 'SQLD'    },
            { name: 'Wing Captain',                     abbr: 'WGCP'    },
            { name: 'Wing Commander',                   abbr: 'WGCO'    },
            { name: 'Group Captain',                    abbr: 'GPCAPT'  },
        ],
    },
    {
        group: 'HOTEL — Command',
        ranks: [
            { name: 'Commodore',                        abbr: 'COM'     },
            { name: 'Air Vice Marshal',                 abbr: 'AVM'     },
            { name: 'Air Marshal',                      abbr: 'AM'      },
            { name: 'Air Chief Marshal',                abbr: 'ACM'     },
            { name: 'Senior Air Chief Marshal',         abbr: 'SACM'    },
        ],
    },
    {
        group: 'Game Master',
        ranks: [
            { name: 'Game Master',                      abbr: 'GM'      },
            { name: 'Game Master Proficient',           abbr: 'GM(P)'   },
            { name: 'Senior Game Master',               abbr: 'GM(S)'   },
            { name: 'Grand Game Master',                abbr: 'GM(G)'   },
            { name: 'Distinguished Game Master',        abbr: 'GM(D)'   },
        ],
    },
]

const RANKS_FLAT = RANK_GROUPS.flatMap(g => g.ranks)

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
        setPromotions(prev => [...prev, { date: todayStr(), rank: RANKS_FLAT[0].name, role: '' }])
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
                        <div key={i} className='flex gap-2 items-end' style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
