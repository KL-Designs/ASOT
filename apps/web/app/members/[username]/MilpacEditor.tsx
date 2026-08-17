'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'
import { RANK_GROUPS, RANKS_FLAT, rankAbbrFromName, rankNameFromAbbr } from '@/lib/military/ranks'
import { AWARDS } from '@/lib/military/awards'
import { CERTIFICATIONS } from '@/lib/military/certifications'
import { OP_POINTS, DEPT_POINTS, calculateOpPoints } from '@/lib/military/points'
import { getSuggestedRank } from '@/lib/military/promotion-requirements'
import { calculatePromotionPoints, type MilpacImportCounts } from '@/lib/military/points'

type ConfirmedOp = { operationId: string; name: string; date?: string | null; confirmedAt: string | null }
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'


let _keyCount = 0


const AWARD_TYPES = [
    'Non-Operational Award',
    'Service Citation',
    'Operational Service Citation',
    'Period of Service Citation'
]

const DUPE_COLORS = [
    'rgba(251,191,36,0.75)',  // amber
    'rgba(249,115,22,0.75)',  // orange
    'rgba(236,72,153,0.75)',  // pink
    'rgba(167,139,250,0.75)', // violet
    'rgba(34,211,238,0.75)',  // cyan
    'rgba(163,230,53,0.75)',  // lime
]

function groupByDuplicates<T>(items: T[], key: (item: T) => string): T[] {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
    const result: T[] = []
    const emitted = new Set<string>()
    const dupeGroups = new Map<string, T[]>()
    for (const item of items) {
        const k = key(item)
        if (counts.get(k)! > 1) {
            if (!dupeGroups.has(k)) dupeGroups.set(k, [])
            dupeGroups.get(k)!.push(item)
        }
    }
    for (const item of items) {
        const k = key(item)
        if (counts.get(k)! > 1) {
            if (!emitted.has(k)) {
                emitted.add(k)
                result.push(...dupeGroups.get(k)!)
            }
        } else {
            result.push(item)
        }
    }
    return result
}

function buildDupeColorMap(names: string[]): Map<string, string> {
    const counts = new Map<string, number>()
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
    const colorMap = new Map<string, string>()
    let ci = 0
    for (const [name, count] of counts) {
        if (count > 1) colorMap.set(name, DUPE_COLORS[ci++ % DUPE_COLORS.length])
    }
    return colorMap
}

function todayStr() {
    return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Flags an entry that records no issuing officer.
 *
 * Blank is allowed and is saved as blank — plenty of historical records have
 * nobody left to name, and the server no longer substitutes whoever happens to
 * be editing. The consequence is worth stating rather than hiding: a signed
 * certificate carries the officer who actually authorised it, and without one
 * it falls back to whoever currently holds the signing billet, which re-attributes
 * a historical document to someone who had nothing to do with it.
 *
 * Both halves are needed. A name with no rank is not usable either, so that
 * falls back the same way.
 */
function MissingIssuer({ signsCertificate = false }: { signsCertificate?: boolean }) {
    return (
        <span
            title={signsCertificate
                ? 'No issuing officer recorded. Any certificate for this entry will be signed by the unit\'s current signing officer instead of the officer who authorised it.'
                : 'No issuing officer recorded for this entry.'}
            style={{
                fontSize: '0.62rem',
                letterSpacing: '0.04em',
                color: '#d4a03a',
                whiteSpace: 'nowrap',
                flexShrink: 0,
            }}
        >
            ⚠ No issuer{signsCertificate ? ' — signed by current OC' : ''}
        </span>
    )
}

// `issuedByRank` is the full rank name (RankSelect's value contract), and it
// signs the rendered certificate — see types/user.d.ts.
type Promotion = { _key: string; date: string; rank: string; role: string; issuedById?: string; issuedByName?: string; issuedByRank?: string }
type Award = { _key: string; date: string; name: string; type: string; issuedById?: string; issuedByName?: string; issuedByRank?: string }
type Qualification = { _key: string; date: string; qualification: string; issuedById?: string; issuedByName?: string }


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

function SectionCard({ title, children, onAdd, addLabel, badge }: { title: string; children: React.ReactNode; onAdd?: () => void; addLabel?: string; badge?: React.ReactNode }) {
    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)' }}>
            <div className='flex items-center justify-between px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    {title}
                </span>
                <div className='flex items-center gap-3'>
                    {badge}
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


// ── Award name combobox ────────────────────────────────────────────────────────

function AwardNameInput({ value, onChange, onSelect }: {
    value: string
    onChange: (name: string) => void
    onSelect: (name: string, type: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState(value)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => { setQuery(value) }, [value])

    useEffect(() => {
        if (!open) return
        function onDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    const isKnown = !value || AWARDS.some(a => a.label === value)
    const filtered = query.trim()
        ? AWARDS.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
        : [...AWARDS]

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <input
                value={query}
                onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
                placeholder='Broken Lance Award'
                style={{ ...inputStyle, borderColor: isKnown ? 'rgba(255,255,255,0.1)' : 'rgba(234,179,8,0.5)' }}
            />
            {!isKnown && (
                <span style={{ fontSize: '0.6rem', color: 'rgba(234,179,8,0.7)', marginTop: 2, display: 'block' }}>
                    Unrecognized award
                </span>
            )}
            {open && filtered.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'rgb(18,18,18)', border: '1px solid rgba(255,255,255,0.15)',
                    maxHeight: 200, overflowY: 'auto',
                }}>
                    {filtered.map(award => (
                        <div
                            key={award.label}
                            onMouseDown={e => {
                                e.preventDefault()
                                setQuery(award.label)
                                onSelect(award.label, award.type)
                                setOpen(false)
                            }}
                            style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(219,0,29,0.15)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <div style={{ color: 'rgba(237,237,237,0.85)' }}>{award.label}</div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)' }}>{award.type}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
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


// ── Qualification search select ───────────────────────────────────────────────

function QualificationSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
    const filtered = CERTIFICATIONS.map(c => c.label).filter(ql => ql.toLowerCase().includes(q))

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
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '— Select qualification —'}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.4, flexShrink: 0 }}>▼</span>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'rgb(18,18,18)', border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
                    maxHeight: 280,
                }}>
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
                            placeholder='Search qualification…'
                            style={{ ...inputStyle, fontSize: '0.78rem', padding: '5px 8px' }}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filtered.map(ql => (
                            <div
                                key={ql}
                                onMouseDown={() => { onChange(ql); setOpen(false) }}
                                style={{
                                    padding: '7px 12px', fontSize: '0.82rem', cursor: 'pointer',
                                    color: ql === value ? 'rgba(237,237,237,1)' : 'rgba(237,237,237,0.75)',
                                    background: ql === value ? 'rgba(255,255,255,0.07)' : 'transparent',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                onMouseLeave={e => (e.currentTarget.style.background = ql === value ? 'rgba(255,255,255,0.07)' : 'transparent')}
                            >
                                {ql}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ padding: '7px 12px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No results</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}


// ── Drag handle ────────────────────────────────────────────────────────────────

function DragHandle({ listeners }: { listeners?: Record<string, unknown> }) {
    return (
        <div
            {...(listeners ?? {})}
            style={{
                alignSelf: 'stretch', display: 'flex', alignItems: 'center',
                cursor: 'grab', padding: '0 4px', color: 'rgba(255,255,255,0.2)',
                fontSize: '0.9rem', lineHeight: 1, flexShrink: 0, userSelect: 'none',
                touchAction: 'none',
            }}
        >
            ⠿
        </div>
    )
}


// ── Sortable item wrapper ──────────────────────────────────────────────────────

function SortableItem({ id, children }: { id: string; children: (listeners: Record<string, unknown> | undefined) => React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    return (
        <div
            ref={setNodeRef}
            {...attributes}
            style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
        >
            {children(listeners)}
        </div>
    )
}


// ── Main component ─────────────────────────────────────────────────────────────

export default function MilpacEditor({ member, confirmedOps = [], onDirtyChange, canEditRestricted = false, canEditStandard = false, canImpersonate = false, nameReadOnly = false }: { member: User; confirmedOps?: ConfirmedOp[]; onDirtyChange?: (dirty: boolean) => void; canEditRestricted?: boolean; canEditStandard?: boolean; canImpersonate?: boolean; nameReadOnly?: boolean }) {
    const strippedNickname = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const fullDisplay = strippedNickname || member.globalName || member.username
    const nameParts = fullDisplay.split(' ')
    const parsedDisplayName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : fullDisplay
    const displayName = member.name || parsedDisplayName

    const [memberName, setMemberName] = useState(member.name || parsedDisplayName)
    const [bioRank, setBioRank] = useState(rankNameFromAbbr(member.milpac?.currentRank ?? ''))
    const joinDateStr = member.guild?.joinedTimestamp
        ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
        : ''
    const [enlistedDate, setEnlistedDate] = useState(member.milpac?.enlistedDate || joinDateStr)
    const [promotions, setPromotions] = useState<Promotion[]>(() =>
        (member.milpac?.promotions ?? []).map(p => ({ _key: String(_keyCount++), ...p })))
    const [awards, setAwards] = useState<Award[]>(() =>
        (member.milpac?.awards ?? []).map(a => ({ _key: String(_keyCount++), ...a })))
    const [qualifications, setQualifications] = useState<Qualification[]>(() =>
        (member.milpac?.qualifications ?? []).map(q => ({ _key: String(_keyCount++), ...q })))

    const defaultBilletCounts = {
        primaryNightOps: 0, secondaryNightOps: 0,
        primaryNightFTX: 0, secondaryNightFTX: 0,
        platoonTraining: 0, sectionTraining: 0, meetings: 0, campaignMedals: 0,
        j1Interviews: 0, j1InterviewBonus: 0, j2MissionsRun: 0,
        j3Bct12: 0, j3OtherTrainings: 0,
        j5ContentCreated: 0, j5MilpacsGenerated: 0, j5OfficialPR: 0,
    }
    const [billetCounts, setBilletCounts] = useState({ ...defaultBilletCounts, ...(member.milpac?.billetCounts ?? {}) })
    const [j4Points, setJ4Points] = useState(member.milpac?.j4Points ?? 0)
    const [disciplineHistory, setDisciplineHistory] = useState<NonNullable<User['milpac']>['disciplineHistory']>(
        member.milpac?.disciplineHistory ?? []
    )
    const disciplineDeductions = (disciplineHistory ?? []).reduce((sum, e) => sum + e.points, 0)

    const [dirty, setDirty] = useState(false)
    const dirtyRef = useRef(false)
    function markDirty() {
        if (!dirtyRef.current) {
            dirtyRef.current = true
            setDirty(true)
            onDirtyChange?.(true)
        }
    }
    function markClean() {
        dirtyRef.current = false
        setDirty(false)
        onDirtyChange?.(false)
    }

    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [impersonating, setImpersonating] = useState(false)

    async function handleImpersonate() {
        setImpersonating(true)
        try {
            const res = await fetch('/api/admin/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: member.id }),
            })
            if (res.ok) window.location.href = '/me'
        } finally {
            setImpersonating(false)
        }
    }
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    // ── Drag state ─────────────────────────────────────────────────────────────

    const [activeDragKey, setActiveDragKey] = useState<string | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

    async function handleSave() {
        setSaving(true)
        setSaved(false)
        setError(null)
        try {
            const body: Record<string, any> = {}
            if (canEditStandard && !nameReadOnly) {
                body.name = memberName.trim() || null
                body.promotions = promotions.map(({ _key, ...rest }) => rest)
                body.awards = awards.map(({ _key, ...rest }) => rest)
                body.qualifications = qualifications.map(({ _key, ...rest }) => rest)
            }
            if (canEditRestricted) {
                body.bioRank = rankAbbrFromName(bioRank)
                body.enlistedDate = enlistedDate
                body.billetCounts = {
                    ...billetCounts,
                    // Both primary and secondary op counts are sourced from operation_attendance
                    primaryNightOps: 0,
                    secondaryNightOps: 0,
                }
                body.j4Points = j4Points
                body.disciplineHistory = disciplineHistory ?? []
                body.disciplineDeductions = (disciplineHistory ?? []).reduce((sum, e) => sum + e.points, 0)
            }
            const res = await fetch(`/api/members/${member.username}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Save failed')
            setSaved(true)
            markClean()
            setTimeout(() => setSaved(false), 3000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Promotion helpers ──────────────────────────────────────────────────────

    function addPromotion() {
        markDirty()
        setPromotions(prev => [...prev, { _key: String(_keyCount++), date: todayStr(), rank: RANKS_FLAT[0].name, role: '' }])
    }
    function updatePromotion(i: number, field: keyof Promotion, value: string) {
        markDirty()
        setPromotions(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
    }
    function removePromotion(i: number) {
        markDirty()
        setPromotions(prev => prev.filter((_, idx) => idx !== i))
    }

    // ── Award helpers ──────────────────────────────────────────────────────────

    function addAward() {
        markDirty()
        setAwards(prev => [...prev, { _key: String(_keyCount++), date: todayStr(), name: '', type: AWARD_TYPES[0] }])
    }
    function updateAward(i: number, field: keyof Award, value: string) {
        markDirty()
        setAwards(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
    }
    function removeAward(i: number) {
        markDirty()
        setAwards(prev => prev.filter((_, idx) => idx !== i))
    }

    // ── Qualification helpers ──────────────────────────────────────────────────

    function addQualification() {
        markDirty()
        setQualifications(prev => [...prev, { _key: String(_keyCount++), date: todayStr(), qualification: '' }])
    }
    function updateQualification(i: number, field: keyof Qualification, value: string) {
        markDirty()
        setQualifications(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
    }
    function removeQualification(i: number) {
        markDirty()
        setQualifications(prev => prev.filter((_, idx) => idx !== i))
    }


    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className='h-full w-full flex flex-col'>

            {/* Sticky header */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 40,
                background: 'rgb(13,13,13)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div className='flex items-center gap-4 px-6 md:px-10 py-3 max-w-[900px] mx-auto w-full'>
                    {/* Avatar + name */}
                    <div style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                        <Avatar user={member} />
                    </div>
                    <div className='flex flex-col gap-0.5 flex-1 min-w-0'>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                            {member.milpac?.currentRank && (
                                <span style={{ color: 'rgba(219,0,29,0.7)', marginRight: '0.35em', fontWeight: 400 }}>{member.milpac.currentRank}</span>
                            )}
                            {displayName}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.04em' }}>@{member.username}</span>
                    </div>

                    {/* Actions */}
                    <div className='flex items-center gap-2 shrink-0'>
                        {error && (
                            <span style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.9)' }}>{error}</span>
                        )}
                        {saved && !error && (
                            <span style={{ fontSize: '0.7rem', color: 'rgba(80,200,80,0.75)' }}>Saved.</span>
                        )}
                        {canImpersonate && (
                            <button
                                onClick={handleImpersonate}
                                disabled={impersonating}
                                style={{
                                    fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                                    color: impersonating ? 'rgba(255,160,0,0.3)' : 'rgba(255,160,0,0.7)',
                                    background: 'none', border: '1px solid rgba(255,160,0,0.25)',
                                    padding: '4px 10px', cursor: impersonating ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {impersonating ? '…' : 'Impersonate'}
                            </button>
                        )}
                        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
                        <Link
                            href={`/milpacs/${member.username}`}
                            style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', textDecoration: 'none', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                        >
                            View Profile ↗
                        </Link>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                background: saving ? 'rgba(219,0,29,0.3)' : 'var(--red)',
                                border: '1px solid var(--red)',
                                color: 'white',
                                padding: '5px 18px',
                                fontSize: '0.68rem',
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
            </div>

            <div className='p-6 md:p-10 flex flex-col gap-6 max-w-[900px] mx-auto w-full'>

            {/* Data integrity warnings */}
            {(() => {
                const awardLabels = new Set<string>(AWARDS.map(a => a.label))
                const awardNames = awards.map(a => a.name).filter(Boolean)
                const dupAwardNames = new Set(awardNames.filter((n, _, arr) => arr.filter(x => x === n).length > 1))
                const dupAwardCount = awards.filter(a => a.name && dupAwardNames.has(a.name)).length
                const unrecognizedCount = awards.filter(a => a.name && !awardLabels.has(a.name)).length

                const qualNames = qualifications.map(q => q.qualification).filter(Boolean)
                const dupQualNames = new Set(qualNames.filter((n, _, arr) => arr.filter(x => x === n).length > 1))
                const dupQualCount = qualifications.filter(q => q.qualification && dupQualNames.has(q.qualification)).length

                const issues: string[] = []
                if (dupAwardCount > 0)    issues.push(`${dupAwardCount} duplicate award${dupAwardCount !== 1 ? 's' : ''}`)
                if (unrecognizedCount > 0) issues.push(`${unrecognizedCount} unrecognized award${unrecognizedCount !== 1 ? 's' : ''}`)
                if (dupQualCount > 0)     issues.push(`${dupQualCount} duplicate qualification${dupQualCount !== 1 ? 's' : ''}`)

                if (issues.length === 0) return null
                return (
                    <div style={{
                        background: 'rgba(234,179,8,0.08)',
                        border: '1px solid rgba(234,179,8,0.3)',
                        borderRadius: 6,
                        padding: '8px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                    }}>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(234,179,8,0.85)', fontWeight: 600 }}>⚠</span>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(234,179,8,0.75)' }}>
                            {issues.join(' · ')}
                        </span>
                    </div>
                )
            })()}

            {/* Basic Info */}
            <SectionCard title='Basic Info'>
                {canEditStandard && !nameReadOnly && (
                    <div className='flex flex-col gap-2'>
                        <Label>Name</Label>
                        <input
                            value={memberName}
                            onChange={e => { markDirty(); setMemberName(e.target.value) }}
                            placeholder={parsedDisplayName}
                            style={inputStyle}
                        />
                        <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.04em' }}>
                            Clean display name used across milpacs, orbat, and the roster. Must be unique. Leave blank to use Discord nickname.
                        </span>
                    </div>
                )}
                {canEditRestricted && (
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                        <div className='flex flex-col gap-2'>
                            <Label>Current Rank</Label>
                            <RankSelect value={bioRank} onChange={v => { markDirty(); setBioRank(v) }} />
                        </div>
                        <div className='flex flex-col gap-2'>
                            <Label>Enlisted Date</Label>
                            <input
                                value={enlistedDate}
                                onChange={e => { markDirty(); setEnlistedDate(e.target.value) }}
                                placeholder='e.g. 15 August 2020'
                                style={inputStyle}
                            />
                        </div>
                    </div>
                )}
            </SectionCard>

            {/* Billet Points — J4-Administration only */}
            {canEditRestricted && (() => {
                // Split confirmed ops into Saturday (primary) and Sunday (secondary)
                const isSecondary = (name: string) => name.includes('— Sun') || name.includes('— Night 2')
                const primaryOps  = confirmedOps.filter(op => !isSecondary(op.name))
                const secondaryOps = confirmedOps.filter(op =>  isSecondary(op.name))

                // ISO week key helper (matches lib/points.ts logic)
                function isoWeekKey(d: Date): string {
                    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
                    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
                    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
                    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
                    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
                }

                // Build week sets for each group
                const primaryWeeks = new Set<string>()
                let primaryUndatedPts = 0
                for (const op of primaryOps) {
                    if (op.date) primaryWeeks.add(isoWeekKey(new Date(op.date)))
                    else primaryUndatedPts += 2
                }
                const secondaryWeeks = new Set<string>()
                let secondaryUndatedPts = 0
                for (const op of secondaryOps) {
                    if (op.date) secondaryWeeks.add(isoWeekKey(new Date(op.date)))
                    else secondaryUndatedPts += 1  // second op of week = 1pt
                }

                // Primary: 2pts per week
                const primaryPts = primaryWeeks.size * 2 + primaryUndatedPts
                // Secondary: +1pt if primary also attended that week, else 2pts (only night that week)
                let secondaryPts = secondaryUndatedPts
                for (const week of secondaryWeeks) {
                    secondaryPts += primaryWeeks.has(week) ? 1 : 2
                }
                const opPts = primaryPts + secondaryPts

                const counts: MilpacImportCounts = {
                    ...billetCounts,
                    primaryNightOps: 0,
                    secondaryNightOps: 0,
                    awards: awards.map(a => ({ name: a.name })),
                    qualifications: qualifications.map(q => ({ qualification: q.qualification })),
                    j4Points,
                    disciplineDeductions,
                }
                const total = calculatePromotionPoints(counts) + opPts

                // Per-field point contributions
                const contrib = {
                    primaryNightFTX:    billetCounts.primaryNightFTX   * OP_POINTS.ftxOp1st,
                    secondaryNightFTX:  billetCounts.secondaryNightFTX * OP_POINTS.ftxOp2nd,
                    platoonTraining:    billetCounts.platoonTraining    * OP_POINTS.platoonTraining,
                    sectionTraining:    billetCounts.sectionTraining    * OP_POINTS.sectionTraining,
                    meetings:           billetCounts.meetings           * OP_POINTS.meeting,
                    j1Interviews:       Math.floor(billetCounts.j1Interviews / 3) * DEPT_POINTS.j1Per3Interviews,
                    j1InterviewBonus:   billetCounts.j1InterviewBonus  * DEPT_POINTS.j1InterviewBonus,
                    j2MissionsRun:      billetCounts.j2MissionsRun     * DEPT_POINTS.j2PerMission,
                    j3Bct12:            billetCounts.j3Bct12           * DEPT_POINTS.j3Bct12,
                    j3OtherTrainings:   billetCounts.j3OtherTrainings  * DEPT_POINTS.j3OtherTraining,
                    j5ContentCreated:   billetCounts.j5ContentCreated  * DEPT_POINTS.j5ContentCreated,
                    j5MilpacsGenerated: Math.floor(billetCounts.j5MilpacsGenerated / 5) * DEPT_POINTS.j5Per5Milpacs,
                    j5OfficialPR:       Math.floor(billetCounts.j5OfficialPR / 5)       * DEPT_POINTS.j5Per5PRPosts,
                }

                // Award & qualification breakdowns
                const awardPointMap = new Map<string, number>(AWARDS.map(a => [a.label, a.points]))
                const awardBreakdown = counts.awards
                    .map(a => ({ name: a.name, pts: awardPointMap.get(a.name) ?? 0 }))
                    .filter(a => a.pts > 0)
                const certPointMap = new Map<string, number>(CERTIFICATIONS.map(c => [c.label, c.points]))
                const qualBreakdown = counts.qualifications
                    .map(q => ({ name: q.qualification, pts: certPointMap.get(q.qualification) ?? 0 }))
                    .filter(q => q.pts > 0)

                // Suggested rank
                const currentRankAbbr = rankAbbrFromName(bioRank)
                const suggested = getSuggestedRank(currentRankAbbr, total)
                const suggestedName = suggested ? rankNameFromAbbr(suggested) : null
                const isCorrectRank = suggested === currentRankAbbr

                const rowStyle: React.CSSProperties = {
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                }
                const compactInput: React.CSSProperties = {
                    ...inputStyle, width: 52, textAlign: 'center' as const, padding: '3px 6px',
                }

                function countRow(field: keyof typeof billetCounts, label: string, readOnly = false) {
                    const pts = contrib[field as keyof typeof contrib] ?? 0
                    return (
                        <div key={field} style={rowStyle}>
                            <span style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>{label}</span>
                            {readOnly ? (
                                <span style={{ ...compactInput, display: 'inline-block', lineHeight: '1.6', color: 'rgba(237,237,237,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, cursor: 'default' }}>
                                    {billetCounts[field]}
                                </span>
                            ) : (
                                <input
                                    type='number' min={0}
                                    value={billetCounts[field]}
                                    onChange={e => { markDirty(); setBilletCounts(prev => ({ ...prev, [field]: Math.max(0, parseInt(e.target.value) || 0) })) }}
                                    style={compactInput}
                                />
                            )}
                            <span style={{ width: 34, fontSize: '0.65rem', textAlign: 'right', color: pts > 0 ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.18)', flexShrink: 0 }}>
                                {pts > 0 ? `+${pts}` : '—'}
                            </span>
                        </div>
                    )
                }

                const badge = (
                    <div className='flex items-center gap-3'>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                            Total: <span style={{ color: 'rgba(219,0,29,0.9)', fontWeight: 700 }}>{total}</span>
                        </span>
                        {suggestedName && (
                            <span style={{
                                fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px',
                                background: isCorrectRank ? 'rgba(34,197,94,0.08)' : 'rgba(234,179,8,0.08)',
                                border: `1px solid ${isCorrectRank ? 'rgba(34,197,94,0.25)' : 'rgba(234,179,8,0.3)'}`,
                                color: isCorrectRank ? 'rgba(34,197,94,0.85)' : 'rgba(234,179,8,0.9)',
                            }}>
                                {isCorrectRank ? '✓ ' : '→ '}{suggestedName}
                            </span>
                        )}
                    </div>
                )

                return (
                    <SectionCard title='Billet Points' badge={badge}>
                        {/* Two-column grid: Operations | Department Actions */}
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-6'>
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.4)', marginBottom: 4 }}>Operations</div>
                                {/* Ops points derived from attendance — read-only */}
                                <div style={rowStyle}>
                                    <span style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>
                                        Primary Ops ({primaryOps.length})
                                    </span>
                                    <span style={{ width: 34, fontSize: '0.65rem', textAlign: 'right', color: primaryPts > 0 ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.18)', flexShrink: 0 }}>
                                        {primaryPts > 0 ? `+${primaryPts}` : '—'}
                                    </span>
                                </div>
                                <div style={rowStyle}>
                                    <span style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>
                                        Secondary Ops ({secondaryOps.length})
                                    </span>
                                    <span style={{ width: 34, fontSize: '0.65rem', textAlign: 'right', color: secondaryPts > 0 ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.18)', flexShrink: 0 }}>
                                        {secondaryPts > 0 ? `+${secondaryPts}` : '—'}
                                    </span>
                                </div>
                                {countRow('primaryNightFTX',   'Primary FTX')}
                                {countRow('secondaryNightFTX', 'Secondary FTX')}
                                {countRow('platoonTraining',   'Plt Training')}
                                {countRow('sectionTraining',   'Sec Training')}
                                {countRow('meetings',          'Meetings')}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.4)', marginBottom: 4 }}>Department Actions</div>
                                {countRow('j1Interviews',       'J1 Interviews')}
                                {countRow('j1InterviewBonus',   'J1 Bonus')}
                                {countRow('j2MissionsRun',      'J2 Missions')}
                                {countRow('j3Bct12',            'J3 BCT 1/2')}
                                {countRow('j3OtherTrainings',   'J3 Other Training')}
                                {countRow('j5ContentCreated',   'J5 Content')}
                                {countRow('j5MilpacsGenerated', 'J5 Milpacs')}
                                {countRow('j5OfficialPR',       'J5 PR Posts')}
                            </div>
                        </div>

                        {/* J4 + awards/quals breakdown */}
                        <div className='flex flex-wrap gap-x-6 gap-y-2 items-start' style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                            <div style={rowStyle}>
                                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>J4 Adjustment</span>
                                <input
                                    type='number'
                                    value={j4Points}
                                    onChange={e => { markDirty(); setJ4Points(parseInt(e.target.value) || 0) }}
                                    style={{ ...compactInput, width: 60 }}
                                />
                                {j4Points !== 0 && (
                                    <span style={{ fontSize: '0.65rem', color: j4Points > 0 ? 'rgba(219,0,29,0.75)' : 'rgba(234,179,8,0.8)' }}>
                                        {j4Points > 0 ? `+${j4Points}` : j4Points}
                                    </span>
                                )}
                            </div>

                            {(awardBreakdown.length > 0 || qualBreakdown.length > 0) && (
                                <div className='flex flex-wrap gap-x-4 gap-y-1 flex-1'>
                                    {[...awardBreakdown, ...qualBreakdown].map((item, i) => (
                                        <span key={`${item.name}-${i}`} style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)' }}>
                                            {item.name} <span style={{ color: 'rgba(219,0,29,0.7)', fontWeight: 600 }}>+{item.pts}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Discipline History */}
                        {((disciplineHistory ?? []).length > 0 || true) && (
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, marginTop: 4 }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.4)', marginBottom: 6 }}>
                                    Discipline History
                                </div>
                                {(disciplineHistory ?? []).length === 0 ? (
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No discipline records.</span>
                                ) : (
                                    <div className='flex flex-col gap-1'>
                                        {(disciplineHistory ?? []).map((entry, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.85)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                            -{entry.points} pts
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', whiteSpace: 'nowrap' }}>{entry.date}</span>
                                                        <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', whiteSpace: 'nowrap' }}>
                                                            by {entry.approvedByName}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)', marginTop: 2, wordBreak: 'break-word' }}>
                                                        {entry.reason}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', marginTop: 1 }}>
                                                        Filed by {entry.issuedByName}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        markDirty()
                                                        setDisciplineHistory(prev => (prev ?? []).filter((_, idx) => idx !== i))
                                                    }}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'rgba(219,0,29,0.5)', fontSize: '0.75rem',
                                                        padding: '2px 4px', flexShrink: 0,
                                                        lineHeight: 1,
                                                    }}
                                                    title='Remove entry'
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        <div style={{ paddingTop: 4, fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', textAlign: 'right' }}>
                                            Total deducted: <span style={{ color: 'rgba(219,0,29,0.7)', fontWeight: 700 }}>-{disciplineDeductions} pts</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </SectionCard>
                )
            })()}

            {/* Promotion History — HQ Staff + J4-Admin */}
            {canEditStandard && (
            <SectionCard title='Promotion History' onAdd={addPromotion} addLabel='Promotion'>
                {promotions.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No promotions on record.</span>
                ) : (
                    <DndContext id="dnd-promotions" sensors={sensors} collisionDetection={closestCenter}
                        onDragStart={(e: DragStartEvent) => setActiveDragKey(e.active.id as string)}
                        onDragEnd={(e: DragEndEvent) => {
                            setActiveDragKey(null)
                            const { active, over } = e
                            if (over && active.id !== over.id) {
                                markDirty()
                                setPromotions(prev => {
                                    const oldIdx = prev.findIndex(p => p._key === active.id)
                                    const newIdx = prev.findIndex(p => p._key === over.id)
                                    return arrayMove(prev, oldIdx, newIdx)
                                })
                            }
                        }}
                    >
                        <SortableContext items={promotions.map(p => p._key)} strategy={verticalListSortingStrategy}>
                            <div className='flex flex-col gap-3'>
                                {promotions.map((p, i) => (
                                    <SortableItem key={p._key} id={p._key}>
                                        {(listeners) => (
                                            <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div className='flex gap-2 items-end'>
                                                    <DragHandle listeners={listeners} />
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
                                                {/* Issuing officer — signs this promotion's certificate. */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 28 }}>
                                                    <Label>Issued By</Label>
                                                    <div style={{ width: 200, flexShrink: 0 }}>
                                                        <RankSelect
                                                            value={p.issuedByRank ?? ''}
                                                            onChange={v => {
                                                                markDirty()
                                                                setPromotions(prev => prev.map((x, idx) => idx === i ? { ...x, issuedByRank: v } : x))
                                                            }}
                                                            placeholder='— Signing Rank —'
                                                        />
                                                    </div>
                                                    <input
                                                        value={p.issuedByName ?? ''}
                                                        onChange={e => {
                                                            markDirty()
                                                            setPromotions(prev => prev.map((x, idx) => idx === i ? { ...x, issuedByName: e.target.value, issuedById: undefined } : x))
                                                        }}
                                                        placeholder='e.g. CO Smith'
                                                        style={{ ...inputStyle, fontSize: '0.72rem', padding: '3px 8px', flex: 1 }}
                                                    />
                                                    {!p.issuedByName?.trim() && <MissingIssuer signsCertificate />}
                                                </div>
                                            </div>
                                        )}
                                    </SortableItem>
                                ))}
                            </div>
                        </SortableContext>
                        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
                            {activeDragKey ? (() => {
                                const p = promotions.find(x => x._key === activeDragKey)
                                if (!p) return null
                                return (
                                    <div className='flex gap-2 items-end' style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(14,14,14,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', opacity: 0.95 }}>
                                        <DragHandle />
                                        <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}><Label>Date</Label><input value={p.date} readOnly style={inputStyle} /></div>
                                        <div className='flex flex-col gap-2 flex-1 min-w-0'><Label>Rank</Label><input value={p.rank} readOnly style={inputStyle} /></div>
                                        <div className='flex flex-col gap-2 flex-1 min-w-0'><Label>Role</Label><input value={p.role} readOnly style={inputStyle} /></div>
                                        <DeleteBtn onClick={() => {}} />
                                    </div>
                                )
                            })() : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </SectionCard>
            )}

            {/* Qualifications — HQ Staff + J4-Admin */}
            {canEditStandard && (
            <SectionCard title='Qualifications' onAdd={addQualification} addLabel='Qualification'>
                {qualifications.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No qualifications on record.</span>
                ) : (
                    <>
                    {qualifications.some((q, _, arr) => q.qualification && arr.filter(x => x.qualification === q.qualification).length > 1) && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: '0.5rem' }}>
                            <button onClick={() => { markDirty(); setQualifications(prev => groupByDuplicates(prev, q => q.qualification)) }}
                                style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(234,179,8,0.7)', background: 'none', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                                Group duplicates
                            </button>
                            <button onClick={() => { markDirty(); setQualifications(prev => { const seen = new Set<string>(); return prev.filter(q => { if (!q.qualification || !seen.has(q.qualification)) { seen.add(q.qualification); return true } return false }) }) }}
                                style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', background: 'none', border: '1px solid rgba(219,0,29,0.3)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                                Remove duplicates
                            </button>
                        </div>
                    )}
                    <DndContext id="dnd-qualifications" sensors={sensors} collisionDetection={closestCenter}
                        onDragStart={(e: DragStartEvent) => setActiveDragKey(e.active.id as string)}
                        onDragEnd={(e: DragEndEvent) => {
                            setActiveDragKey(null)
                            const { active, over } = e
                            if (over && active.id !== over.id) {
                                markDirty()
                                setQualifications(prev => {
                                    const oldIdx = prev.findIndex(q => q._key === active.id)
                                    const newIdx = prev.findIndex(q => q._key === over.id)
                                    return arrayMove(prev, oldIdx, newIdx)
                                })
                            }
                        }}
                    >
                        <SortableContext items={qualifications.map(q => q._key)} strategy={verticalListSortingStrategy}>
                            {(() => {
                                const dupQuals = buildDupeColorMap(qualifications.map(q => q.qualification).filter(Boolean))
                                return (
                            <div className='flex flex-col gap-3'>
                                {qualifications.map((q, i) => {
                                    const dupeColor = q.qualification ? dupQuals.get(q.qualification) : undefined
                                    return (
                                    <SortableItem key={q._key} id={q._key}>
                                        {(listeners) => (
                                            <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', ...(dupeColor ? { borderLeft: `3px solid ${dupeColor}`, paddingLeft: '0.5rem' } : {}) }}>
                                                <div className='flex gap-2 items-end'>
                                                    <DragHandle listeners={listeners} />
                                                    <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}>
                                                        <Label>Date</Label>
                                                        <input value={q.date} onChange={e => updateQualification(i, 'date', e.target.value)} placeholder='15 Aug 2020' style={inputStyle} />
                                                    </div>
                                                    <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                                        <Label>Qualification</Label>
                                                        <QualificationSelect value={q.qualification} onChange={v => updateQualification(i, 'qualification', v)} />
                                                        {dupeColor && (
                                                            <span style={{ fontSize: '0.6rem', color: dupeColor, marginTop: 2, display: 'block' }}>Duplicate entry</span>
                                                        )}
                                                    </div>
                                                    <DeleteBtn onClick={() => removeQualification(i)} />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 28 }}>
                                                    <Label>Issued By</Label>
                                                    <input
                                                        value={q.issuedByName ?? ''}
                                                        onChange={e => {
                                                            markDirty()
                                                            setQualifications(prev => prev.map((x, idx) => idx === i ? { ...x, issuedByName: e.target.value, issuedById: undefined } : x))
                                                        }}
                                                        placeholder='e.g. CO Smith'
                                                        style={{ ...inputStyle, fontSize: '0.72rem', padding: '3px 8px', flex: 1 }}
                                                    />
                                                    {!q.issuedByName?.trim() && <MissingIssuer />}
                                                </div>
                                            </div>
                                        )}
                                    </SortableItem>
                                    )
                                })}
                            </div>
                                )
                            })()}
                        </SortableContext>
                        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
                            {activeDragKey ? (() => {
                                const q = qualifications.find(x => x._key === activeDragKey)
                                if (!q) return null
                                return (
                                    <div className='flex gap-2 items-end' style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(14,14,14,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', opacity: 0.95 }}>
                                        <DragHandle />
                                        <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}><Label>Date</Label><input value={q.date} readOnly style={inputStyle} /></div>
                                        <div className='flex flex-col gap-2 flex-1 min-w-0'><Label>Qualification</Label><div style={{ ...inputStyle, color: q.qualification ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)' }}>{q.qualification || '— Select qualification —'}</div></div>
                                        <DeleteBtn onClick={() => {}} />
                                    </div>
                                )
                            })() : null}
                        </DragOverlay>
                    </DndContext>
                    </>
                )}
            </SectionCard>
            )}

            {/* Awards — HQ Staff + J4-Admin */}
            {canEditStandard && (
            <SectionCard title='Awards & Commendations' onAdd={addAward} addLabel='Award'>
                {awards.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No awards on record.</span>
                ) : (
                    <>
                    {awards.some((a, _, arr) => a.name && arr.filter(x => x.name === a.name).length > 1) && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: '0.5rem' }}>
                            <button onClick={() => { markDirty(); setAwards(prev => groupByDuplicates(prev, a => a.name)) }}
                                style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(234,179,8,0.7)', background: 'none', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                                Group duplicates
                            </button>
                            <button onClick={() => { markDirty(); setAwards(prev => { const seen = new Set<string>(); return prev.filter(a => { if (!a.name || !seen.has(a.name)) { seen.add(a.name); return true } return false }) }) }}
                                style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', background: 'none', border: '1px solid rgba(219,0,29,0.3)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                                Remove duplicates
                            </button>
                        </div>
                    )}
                    <DndContext id="dnd-awards" sensors={sensors} collisionDetection={closestCenter}
                        onDragStart={(e: DragStartEvent) => setActiveDragKey(e.active.id as string)}
                        onDragEnd={(e: DragEndEvent) => {
                            setActiveDragKey(null)
                            const { active, over } = e
                            if (over && active.id !== over.id) {
                                markDirty()
                                setAwards(prev => {
                                    const oldIdx = prev.findIndex(a => a._key === active.id)
                                    const newIdx = prev.findIndex(a => a._key === over.id)
                                    return arrayMove(prev, oldIdx, newIdx)
                                })
                            }
                        }}
                    >
                        <SortableContext items={awards.map(a => a._key)} strategy={verticalListSortingStrategy}>
                            {(() => {
                                const dupAwards = buildDupeColorMap(awards.map(a => a.name).filter(Boolean))
                                return (
                            <div className='flex flex-col gap-3'>
                                {awards.map((a, i) => {
                                    const dupeColor = a.name ? dupAwards.get(a.name) : undefined
                                    return (
                                    <SortableItem key={a._key} id={a._key}>
                                        {(listeners) => (
                                            <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', ...(dupeColor ? { borderLeft: `3px solid ${dupeColor}`, paddingLeft: '0.5rem' } : {}) }}>
                                                <div className='flex gap-2 items-end'>
                                                    <DragHandle listeners={listeners} />
                                                    <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}>
                                                        <Label>Date</Label>
                                                        <input value={a.date} onChange={e => updateAward(i, 'date', e.target.value)} placeholder='05 Feb 2022' style={inputStyle} />
                                                    </div>
                                                    <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                                        <Label>Name</Label>
                                                        <AwardNameInput
                                                            value={a.name}
                                                            onChange={name => updateAward(i, 'name', name)}
                                                            onSelect={(name, type) => {
                                                                markDirty()
                                                                setAwards(prev => prev.map((x, idx) => idx === i ? { ...x, name, type } : x))
                                                            }}
                                                        />
                                                        {dupeColor && (
                                                            <span style={{ fontSize: '0.6rem', color: dupeColor, marginTop: 2, display: 'block' }}>Duplicate entry</span>
                                                        )}
                                                    </div>
                                                    <div className='flex flex-col gap-2 flex-1 min-w-0'>
                                                        <Label>Type</Label>
                                                        <select value={a.type} onChange={e => updateAward(i, 'type', e.target.value)} style={selectStyle}>
                                                            {AWARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </div>
                                                    <DeleteBtn onClick={() => removeAward(i)} />
                                                </div>
                                                {/* Issuing officer — signs this award's certificate. */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 28 }}>
                                                    <Label>Issued By</Label>
                                                    <div style={{ width: 200, flexShrink: 0 }}>
                                                        <RankSelect
                                                            value={a.issuedByRank ?? ''}
                                                            onChange={v => {
                                                                markDirty()
                                                                setAwards(prev => prev.map((x, idx) => idx === i ? { ...x, issuedByRank: v } : x))
                                                            }}
                                                            placeholder='— Signing Rank —'
                                                        />
                                                    </div>
                                                    <input
                                                        value={a.issuedByName ?? ''}
                                                        onChange={e => {
                                                            markDirty()
                                                            setAwards(prev => prev.map((x, idx) => idx === i ? { ...x, issuedByName: e.target.value, issuedById: undefined } : x))
                                                        }}
                                                        placeholder='e.g. CO Smith'
                                                        style={{ ...inputStyle, fontSize: '0.72rem', padding: '3px 8px', flex: 1 }}
                                                    />
                                                    {!a.issuedByName?.trim() && <MissingIssuer signsCertificate />}
                                                </div>
                                            </div>
                                        )}
                                    </SortableItem>
                                    )
                                })}
                            </div>
                                )
                            })()}
                        </SortableContext>
                        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
                            {activeDragKey ? (() => {
                                const a = awards.find(x => x._key === activeDragKey)
                                if (!a) return null
                                return (
                                    <div className='flex gap-2 items-end' style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(14,14,14,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', opacity: 0.95 }}>
                                        <DragHandle />
                                        <div className='flex flex-col gap-2 flex-1 min-w-0' style={{ minWidth: 100, maxWidth: 130 }}><Label>Date</Label><input value={a.date} readOnly style={inputStyle} /></div>
                                        <div className='flex flex-col gap-2 flex-1 min-w-0'><Label>Name</Label><input value={a.name} readOnly style={inputStyle} /></div>
                                        <div className='flex flex-col gap-2 flex-1 min-w-0'><Label>Type</Label><input value={a.type} readOnly style={inputStyle} /></div>
                                        <DeleteBtn onClick={() => {}} />
                                    </div>
                                )
                            })() : null}
                        </DragOverlay>
                    </DndContext>
                    </>
                )}
            </SectionCard>
            )}

            {/* Operations — derived from confirmed attendance */}
            {(() => {
                // Strip trailing suffixes to get the campaign base name for grouping
                function baseName(name: string): string {
                    return name
                        .replace(/\s*[-–—]\s*(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')  // "— Sun", "— Sat", "— Night 2"
                        .replace(/\s+(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')
                        .replace(/\s+\d+\s*$/g, '')
                        .replace(/\s+[IVXLC]+\s*$/i, '')  // Roman numerals (I–XCIX)
                        .replace(/\s*[-–—]\s*$/g, '')      // trailing dash artifacts
                        .trim()
                }

                type GroupedOp = { id: string; name: string; date: Date | null }
                const groups = new Map<string, { dates: Date[]; ops: GroupedOp[] }>()
                for (const op of confirmedOps) {
                    const key = baseName(op.name)
                    if (!groups.has(key)) groups.set(key, { dates: [], ops: [] })
                    const g = groups.get(key)!
                    const rawDate = op.date ?? op.confirmedAt
                    if (rawDate) g.dates.push(new Date(rawDate))
                    g.ops.push({ id: op.operationId, name: op.name, date: rawDate ? new Date(rawDate) : null })
                }

                const grouped = Array.from(groups.entries())
                    .map(([name, g]) => ({ name, ...g }))
                    .sort((a, b) => {
                        const aMax = a.dates.length ? Math.max(...a.dates.map(d => d.getTime())) : 0
                        const bMax = b.dates.length ? Math.max(...b.dates.map(d => d.getTime())) : 0
                        return bMax - aMax  // newest first
                    })

                function fmtDate(d: Date) {
                    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
                }

                const badge = <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>{confirmedOps.length} op{confirmedOps.length !== 1 ? 's' : ''}</span>

                return (
                    <SectionCard title='Operation History' badge={badge}>
                        {grouped.length === 0 ? (
                            <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No confirmed operations on record.</span>
                        ) : (
                            <div className='flex flex-col' style={{ gap: 0 }}>
                                {grouped.map(g => {
                                    const sorted = [...g.dates].sort((a, b) => a.getTime() - b.getTime())
                                    const dateRange = sorted.length === 0 ? '—'
                                        : sorted.length === 1 ? fmtDate(sorted[0])
                                        : `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])}`
                                    const isSingle = g.ops.length === 1
                                    const isExpanded = expandedGroups.has(g.name)
                                    const toggle = () => setExpandedGroups(prev => {
                                        const next = new Set(prev)
                                        if (next.has(g.name)) next.delete(g.name)
                                        else next.add(g.name)
                                        return next
                                    })
                                    return isSingle ? (
                                        <a key={g.name} href={`/operations/${g.ops[0].id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none', color: 'inherit' }}>
                                            <span style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(237,237,237,0.75)' }}>{g.name}</span>
                                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap' }}>{dateRange}</span>
                                        </a>
                                    ) : (
                                        <div key={g.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', userSelect: 'none' }}>
                                                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', flexShrink: 0, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                                                <span style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(237,237,237,0.75)' }}>{g.name}</span>
                                                <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap' }}>{dateRange}</span>
                                                <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.7)', borderRadius: 3, flexShrink: 0 }}>
                                                    ×{g.ops.length}
                                                </span>
                                            </div>
                                            {isExpanded && (
                                                <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 16, paddingBottom: 4 }}>
                                                    {g.ops
                                                        .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
                                                        .map(op => (
                                                            <a key={op.id} href={`/operations/${op.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', textDecoration: 'none', color: 'inherit' }}>
                                                                <span style={{ flex: 1, fontSize: '0.73rem', color: 'rgba(237,237,237,0.55)' }}>{op.name}</span>
                                                                {op.date && <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', whiteSpace: 'nowrap' }}>{fmtDate(op.date)}</span>}
                                                            </a>
                                                        ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </SectionCard>
                )
            })()}


        </div>
        </div>
    )
}
