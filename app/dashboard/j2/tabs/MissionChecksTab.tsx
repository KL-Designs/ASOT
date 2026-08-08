'use client'

import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import {
    CheckCircle, Warning, Schedule, PersonAdd, PersonOff, ExpandMore, ExpandLess,
    Refresh, FilterList, CheckBox, CheckBoxOutlineBlank,
} from '@mui/icons-material'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DevCheckInfo {
    checkId: string
    weeksOut: number
    dueDate: string
    isOverdue: boolean
    daysUntil: number
    completion?: { completedAt: string; completedByName: string; reviewerName?: string; comments?: string; outcome?: string }
    task?: { _id: string; assignedTo: string; assignedToName: string; status: string; createdAt: string; escalatedAt?: string }
}

interface DevCheckOpRow {
    opId: string
    opTitle: string
    opDate: string
    opStatus: string
    isCampaign: boolean
    campaignId?: string
    campaignName?: string
    referenceDate: string
    checks: DevCheckInfo[]
}

interface J2Member { id: string; displayName: string; currentRank: string | null }

type FilterMode = 'active' | 'overdue' | 'completed' | 'all'

// ── Checklist content per stage ───────────────────────────────────────────────

const CHECK_CONTENT: Record<'campaign' | 'single', Record<string, string[]>> = {
    campaign: {
        w16: [
            'Mission concept/idea submitted to J2',
            'Initial discussion completed with team leads',
        ],
        w12: [
            'Confirmed mission development has started',
            'Initial planning document created',
            'First mission scenario and orders started',
            'J2 lead briefed on mission concept',
        ],
        w10: [
            'Core framework and fundamentals established',
            'First mission scenario and orders complete',
            'Second and third missions started',
        ],
        w8: [
            'Second and third missions complete',
            'All subsequent missions started',
            'All mission orders finalised',
        ],
        w6: [
            'Final checks and revisions completed',
            'Bug fixing pass completed',
            'Server loadout and mission tested',
            'Weekly Monday reminder sent (if any items incomplete)',
        ],
        w4: [
            'Final development check completed',
            'Arsenal and loadout updates confirmed',
        ],
    },
    single: {
        w12: [
            'Mission concept/idea submitted to J2',
        ],
        w10: [
            'Confirmed mission development has started',
            'Mission scenario and orders started',
            'J2 lead briefed on mission concept',
        ],
        w8: [
            'Mission scenario and orders complete',
            'Replacement mission arranged if not complete',
        ],
        w6: [
            'Final checks and bug fixing completed',
            'Server mission tested',
            'Weekly Monday reminder sent (if any items incomplete)',
        ],
        w4: [
            'Final development check completed',
            'Arsenal and loadout updates confirmed',
        ],
    },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDaysUntil(days: number, isOverdue: boolean, hasCompletion: boolean): string {
    if (hasCompletion) return 'Done'
    if (days === 0) return 'Today'
    if (isOverdue || days < 0) return `${Math.abs(days)}d overdue`
    return `${days}d`
}

function checkLabel(weeksOut: number) {
    return `W${weeksOut} Check`
}

// ── Check status badge ────────────────────────────────────────────────────────

function CheckBadge({ check }: { check: DevCheckInfo }) {
    if (check.completion) {
        return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(0,200,80,0.9)', fontSize: '0.72rem', fontWeight: 700 }}>
                <CheckCircle sx={{ fontSize: '0.9rem' }} /> Completed
            </span>
        )
    }
    if (check.isOverdue) {
        return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(219,0,29,0.9)', fontSize: '0.72rem', fontWeight: 700 }}>
                <Warning sx={{ fontSize: '0.9rem' }} /> Overdue
            </span>
        )
    }
    if (check.daysUntil <= 7) {
        return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(219,160,0,0.95)', fontSize: '0.72rem', fontWeight: 700 }}>
                <Schedule sx={{ fontSize: '0.9rem' }} /> Due Soon
            </span>
        )
    }
    return (
        <span style={{ color: 'rgba(237,237,237,0.45)', fontSize: '0.72rem', fontWeight: 600 }}>
            Pending
        </span>
    )
}

// ── Assign Reviewer Modal ─────────────────────────────────────────────────────

function AssignModal({
    opId, opTitle, checkId, weeksOut, currentAssignee,
    onClose, onSaved,
}: {
    opId: string; opTitle: string; checkId: string; weeksOut: number
    currentAssignee?: { id: string; name: string }
    onClose: () => void; onSaved: () => void
}) {
    const [members, setMembers]   = useState<J2Member[]>([])
    const [loading, setLoading]   = useState(true)
    const [saving, setSaving]     = useState(false)
    const [search, setSearch]     = useState('')
    const [selected, setSelected] = useState<J2Member | null>(null)

    useEffect(() => {
        fetch('/api/admin/members?department=j2')
            .then(r => r.json())
            .then(d => setMembers((d.members ?? []) as J2Member[]))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [])

    const filtered = members.filter(m =>
        m.displayName.toLowerCase().includes(search.toLowerCase())
    )

    async function save() {
        if (!selected) return
        setSaving(true)
        try {
            const res = await fetch(`/api/j2/dev-checks/${opId}/${checkId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewerId: selected.id, reviewerName: selected.displayName }),
            })
            if (!res.ok) throw new Error(await res.text())
            onSaved()
            onClose()
        } catch (err) {
            console.error('[assign modal] save error:', err)
            alert('Failed to assign reviewer. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    async function unassign() {
        if (!currentAssignee) return
        setSaving(true)
        try {
            const res = await fetch(`/api/j2/dev-checks/${opId}/${checkId}`, { method: 'DELETE' })
            if (!res.ok) throw new Error(await res.text())
            onSaved()
            onClose()
        } catch (err) {
            console.error('[assign modal] unassign error:', err)
            alert('Failed to unassign. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: 'rgba(18,18,18,0.98)', border: '1px solid rgba(219,0,29,0.35)',
                borderTop: '2px solid var(--red)', width: 420, maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', padding: 24, gap: 16,
            }}>
                <div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(219,0,29,0.6)', textTransform: 'uppercase', marginBottom: 4 }}>
                        ASSIGN REVIEWER
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: 1 }}>{checkLabel(weeksOut)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)', marginTop: 2 }}>{opTitle}</div>
                </div>

                {currentAssignee && (
                    <div style={{
                        padding: '8px 12px', background: 'rgba(219,0,29,0.08)',
                        border: '1px solid rgba(219,0,29,0.2)', fontSize: '0.75rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span>Current: <strong>{currentAssignee.name}</strong></span>
                        <button
                            onClick={unassign}
                            disabled={saving}
                            style={{
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
                                textTransform: 'uppercase', padding: '3px 10px',
                                background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.3)',
                                color: 'rgba(237,237,237,0.7)', cursor: 'pointer',
                            }}
                        >
                            Remove
                        </button>
                    </div>
                )}

                <input
                    type='text'
                    placeholder='Search J2 members...'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: 'var(--foreground)', padding: '8px 12px', fontSize: '0.82rem', outline: 'none',
                    }}
                />

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><CircularProgress size={20} /></div>
                    ) : filtered.length === 0 ? (
                        <div style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.78rem', textAlign: 'center', padding: 16 }}>No members found</div>
                    ) : filtered.map(m => (
                        <button
                            key={m.id}
                            onClick={() => setSelected(prev => prev?.id === m.id ? null : m)}
                            style={{
                                textAlign: 'left', padding: '8px 12px',
                                background: selected?.id === m.id ? 'rgba(219,0,29,0.18)' : 'rgba(255,255,255,0.03)',
                                border: selected?.id === m.id ? '1px solid rgba(219,0,29,0.4)' : '1px solid rgba(255,255,255,0.07)',
                                color: 'var(--foreground)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 1,
                            }}
                        >
                            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{m.displayName}</span>
                            {m.currentRank && <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.45)', letterSpacing: '0.08em' }}>{m.currentRank}</span>}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1, padding: '9px 0', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em',
                            textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.6)', cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={save}
                        disabled={!selected || saving}
                        style={{
                            flex: 2, padding: '9px 0', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            background: selected && !saving ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(219,0,29,0.35)',
                            color: selected && !saving ? 'var(--foreground)' : 'rgba(237,237,237,0.3)',
                            cursor: selected && !saving ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {saving ? 'Saving…' : 'Assign Reviewer'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Mark Complete Modal ───────────────────────────────────────────────────────

function CompleteModal({
    opId, opTitle, checkId, weeksOut, dueDate, isOverdue,
    onClose, onSaved,
}: {
    opId: string; opTitle: string; checkId: string; weeksOut: number
    dueDate: string; isOverdue: boolean
    onClose: () => void; onSaved: () => void
}) {
    const [reviewerName, setReviewerName] = useState('')
    const [comments, setComments]         = useState('')
    const [outcome, setOutcome]           = useState('')
    const [saving, setSaving]             = useState(false)

    async function save() {
        setSaving(true)
        try {
            const res = await fetch(`/api/operations/${opId}/mission-development`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkId, reviewerName: reviewerName.trim() || undefined, comments: comments.trim() || undefined, outcome: outcome.trim() || undefined }),
            })
            if (!res.ok) throw new Error(await res.text())
            onSaved()
            onClose()
        } catch (err) {
            console.error('[complete modal] error:', err)
            alert('Failed to save completion. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div style={{
                background: '#0f0f10', border: '1px solid rgba(0,200,80,0.25)',
                borderTop: '2px solid rgba(0,200,80,0.7)',
                padding: '24px 28px', maxWidth: 440, width: '90%',
                display: 'flex', flexDirection: 'column', gap: 16,
            }}>
                <div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(0,200,80,0.5)', fontFamily: 'monospace', marginBottom: 6 }}>
                        {'// MARK COMPLETE'}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                        {checkLabel(weeksOut)} — {opTitle}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginTop: 4 }}>
                        Due: {fmtDate(dueDate)}
                        {isOverdue && <span style={{ color: 'rgba(219,80,0,0.85)', marginLeft: 8 }}>● Overdue</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>Reviewer Name</div>
                        <input
                            value={reviewerName}
                            onChange={e => setReviewerName(e.target.value)}
                            placeholder='Your name or assigned reviewer…'
                            style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.8rem', padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>Comments</div>
                        <textarea
                            value={comments}
                            onChange={e => setComments(e.target.value)}
                            placeholder='Review notes, observations…'
                            rows={3}
                            style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', padding: '8px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>Outcome / Notes</div>
                        <textarea
                            value={outcome}
                            onChange={e => setOutcome(e.target.value)}
                            placeholder='Outcome, decisions made, action items…'
                            rows={2}
                            style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', padding: '8px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={save}
                        disabled={saving}
                        style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(0,200,80,0.18)', border: '1px solid rgba(0,200,80,0.45)', color: 'rgba(0,200,80,0.9)', cursor: saving ? 'not-allowed' : 'pointer' }}
                    >
                        {saving ? 'Saving…' : '✓ Mark Complete'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Checklist panel ───────────────────────────────────────────────────────────

function ChecklistPanel({
    check, isCampaign, isJ2Lead,
    onComplete,
}: {
    check: DevCheckInfo
    isCampaign: boolean
    isJ2Lead: boolean
    onComplete: () => void
}) {
    const type = isCampaign ? 'campaign' : 'single'
    const items = CHECK_CONTENT[type][check.checkId] ?? []
    const done = !!check.completion

    return (
        <div style={{
            margin: '0 14px 10px',
            background: done ? 'rgba(0,200,80,0.03)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${done ? 'rgba(0,200,80,0.12)' : 'rgba(255,255,255,0.06)'}`,
            padding: '12px 14px',
        }}>
            <div style={{
                fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: done ? 'rgba(0,200,80,0.5)' : 'rgba(237,237,237,0.25)',
                marginBottom: 10,
            }}>
                {checkLabel(check.weeksOut)} — Criteria
            </div>

            {items.length === 0 ? (
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>No checklist items defined.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {done
                                ? <CheckBox sx={{ fontSize: '0.9rem', color: 'rgba(0,200,80,0.6)', flexShrink: 0, mt: '1px' }} />
                                : <CheckBoxOutlineBlank sx={{ fontSize: '0.9rem', color: 'rgba(237,237,237,0.2)', flexShrink: 0, mt: '1px' }} />
                            }
                            <span style={{ fontSize: '0.75rem', color: done ? 'rgba(237,237,237,0.45)' : 'rgba(237,237,237,0.7)', lineHeight: 1.5 }}>
                                {item}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {done && check.completion && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,200,80,0.1)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(0,200,80,0.6)', fontWeight: 700, letterSpacing: '0.1em' }}>
                        ✓ Signed off by {check.completion.reviewerName || check.completion.completedByName} · {fmtDate(check.completion.completedAt)}
                    </div>
                    {check.completion.comments && (
                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', fontStyle: 'italic' }}>
                            &ldquo;{check.completion.comments}&rdquo;
                        </div>
                    )}
                    {check.completion.outcome && (
                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>
                            Outcome: {check.completion.outcome}
                        </div>
                    )}
                </div>
            )}

            {!done && isJ2Lead && (
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onComplete}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            padding: '5px 14px',
                            background: 'rgba(0,200,80,0.12)', border: '1px solid rgba(0,200,80,0.35)',
                            color: 'rgba(0,200,80,0.85)', cursor: 'pointer',
                        }}
                    >
                        <CheckCircle sx={{ fontSize: '0.82rem' }} /> Mark Complete
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Operation row ─────────────────────────────────────────────────────────────

function OpRow({
    row, isJ2Lead, onAssign, onComplete, onRefresh,
}: {
    row: DevCheckOpRow
    isJ2Lead: boolean
    onAssign: (opId: string, opTitle: string, check: DevCheckInfo) => void
    onComplete: (opId: string, opTitle: string, check: DevCheckInfo) => void
    onRefresh: () => void
}) {
    const router = useRouter()
    const [expanded, setExpanded]           = useState(true)
    const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null)

    const totalChecks  = row.checks.length
    const doneChecks   = row.checks.filter(c => !!c.completion).length
    const overdueCount = row.checks.filter(c => c.isOverdue && !c.completion).length

    function toggleCheck(checkId: string) {
        setExpandedCheckId(prev => prev === checkId ? null : checkId)
    }

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.2)', marginBottom: 8, background: 'rgba(0,0,0,0.3)' }}>
            {/* Op header */}
            <div
                onClick={() => setExpanded(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)',
                    borderBottom: expanded ? '1px solid rgba(219,0,29,0.15)' : 'none',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {expanded ? <ExpandLess sx={{ fontSize: '1rem', color: 'rgba(237,237,237,0.35)', flexShrink: 0 }} />
                              : <ExpandMore sx={{ fontSize: '1rem', color: 'rgba(237,237,237,0.35)', flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.87rem', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.opTitle}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginTop: 2, letterSpacing: '0.06em' }}>
                            {row.isCampaign ? `Campaign: ${row.campaignName}` : 'Single Mission'}
                            {' · '}Op Date: {fmtDate(row.opDate)}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {overdueCount > 0 && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(219,0,29,0.9)', letterSpacing: '0.1em' }}>
                            {overdueCount} OVERDUE
                        </span>
                    )}
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', letterSpacing: '0.08em' }}>
                        {doneChecks}/{totalChecks} checks
                    </span>
                    <button
                        onClick={e => { e.stopPropagation(); router.push(`/operations/${row.opId}/edit`) }}
                        style={{
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                            textTransform: 'uppercase', padding: '3px 9px',
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                            color: 'rgba(237,237,237,0.55)', cursor: 'pointer',
                        }}
                    >
                        Open
                    </button>
                </div>
            </div>

            {/* Check rows */}
            {expanded && (
                <div>
                    {/* Header */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '90px 110px 100px 1fr 140px 100px',
                        padding: '5px 14px', gap: 8,
                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: 'rgba(237,237,237,0.3)', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        <span>Stage</span>
                        <span>Due Date</span>
                        <span>Time Left</span>
                        <span>Status</span>
                        <span>Reviewer</span>
                        <span></span>
                    </div>

                    {row.checks.map(check => {
                        const done = !!check.completion
                        const overdue = check.isOverdue && !done
                        const isCheckExpanded = expandedCheckId === check.checkId
                        return (
                            <div key={check.checkId}>
                                <div
                                    style={{
                                        display: 'grid', gridTemplateColumns: '90px 110px 100px 1fr 140px 100px',
                                        padding: '8px 14px', gap: 8, alignItems: 'center',
                                        borderBottom: isCheckExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)',
                                        background: overdue ? 'rgba(219,0,29,0.04)' : done ? 'rgba(0,200,80,0.02)' : 'transparent',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => toggleCheck(check.checkId)}
                                >
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em',
                                        color: overdue ? 'rgba(219,0,29,0.9)' : done ? 'rgba(0,200,80,0.8)' : 'rgba(237,237,237,0.65)',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                        {isCheckExpanded
                                            ? <ExpandLess sx={{ fontSize: '0.75rem', opacity: 0.4 }} />
                                            : <ExpandMore sx={{ fontSize: '0.75rem', opacity: 0.4 }} />
                                        }
                                        {checkLabel(check.weeksOut)}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.55)' }}>
                                        {fmtDate(check.dueDate)}
                                    </span>
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 700,
                                        color: done ? 'rgba(0,200,80,0.7)' : overdue ? 'rgba(219,0,29,0.9)' : check.daysUntil <= 7 ? 'rgba(219,160,0,0.9)' : 'rgba(237,237,237,0.45)',
                                    }}>
                                        {fmtDaysUntil(check.daysUntil, check.isOverdue, done)}
                                    </span>
                                    <div>
                                        <CheckBadge check={check} />
                                        {done && (
                                            <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                                                by {check.completion!.completedByName}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.75rem' }}>
                                        {check.task ? (
                                            <span style={{ color: 'rgba(237,237,237,0.7)', fontWeight: 600 }}>
                                                {check.task.assignedToName}
                                            </span>
                                        ) : (
                                            <span style={{ color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', fontSize: '0.68rem' }}>
                                                Unassigned
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                        {isJ2Lead && !done && (
                                            <button
                                                onClick={() => onAssign(row.opId, row.opTitle, check)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                                                    textTransform: 'uppercase', padding: '4px 9px',
                                                    background: check.task ? 'rgba(255,255,255,0.05)' : 'rgba(219,0,29,0.18)',
                                                    border: `1px solid ${check.task ? 'rgba(255,255,255,0.1)' : 'rgba(219,0,29,0.3)'}`,
                                                    color: 'rgba(237,237,237,0.65)', cursor: 'pointer',
                                                }}
                                            >
                                                {check.task ? <PersonOff sx={{ fontSize: '0.8rem' }} /> : <PersonAdd sx={{ fontSize: '0.8rem' }} />}
                                                {check.task ? 'Reassign' : 'Assign'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Expandable checklist */}
                                {isCheckExpanded && (
                                    <ChecklistPanel
                                        check={check}
                                        isCampaign={row.isCampaign}
                                        isJ2Lead={isJ2Lead}
                                        onComplete={() => onComplete(row.opId, row.opTitle, check)}
                                    />
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function MissionChecksTab({
    userId,
    isJ2Lead,
}: {
    userId: string
    isJ2Lead: boolean
}) {
    const [filter, setFilter]   = useState<FilterMode>('active')
    const [rows, setRows]       = useState<DevCheckOpRow[]>([])
    const [loading, setLoading] = useState(true)
    const [assignTarget, setAssignTarget] = useState<{
        opId: string; opTitle: string; check: DevCheckInfo
    } | null>(null)
    const [completeTarget, setCompleteTarget] = useState<{
        opId: string; opTitle: string; check: DevCheckInfo
    } | null>(null)

    const load = useCallback(async (f: FilterMode) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/j2/dev-checks?filter=${f}`)
            const data = await res.json()
            setRows(data.rows ?? [])
        } catch (err) {
            console.error('[MissionChecksTab] fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load(filter) }, [filter, load])

    const overdueTotal = rows.reduce((acc, r) =>
        acc + r.checks.filter(c => c.isOverdue && !c.completion).length, 0)

    const FILTERS: { key: FilterMode; label: string }[] = [
        { key: 'active',    label: 'Active' },
        { key: 'overdue',   label: `Overdue${overdueTotal > 0 ? ` (${overdueTotal})` : ''}` },
        { key: 'completed', label: 'Completed' },
        { key: 'all',       label: 'All' },
    ]

    const filterBtnSx = (active: boolean): React.CSSProperties => ({
        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
        padding: '5px 14px',
        background: active ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
        cursor: 'pointer', borderRadius: 2,
    })

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header bar */}
            <div style={{
                padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid rgba(219,0,29,0.18)', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FilterList sx={{ fontSize: '0.95rem', color: 'rgba(219,0,29,0.6)' }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                        Filter
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {FILTERS.map(f => (
                            <button key={f.key} onClick={() => setFilter(f.key)} style={filterBtnSx(filter === f.key)}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    onClick={() => load(filter)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '5px 12px', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer', borderRadius: 2,
                    }}
                >
                    <Refresh sx={{ fontSize: '0.85rem' }} /> Refresh
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                        <CircularProgress size={28} />
                    </div>
                ) : rows.length === 0 ? (
                    <div style={{ textAlign: 'center', paddingTop: 60, color: 'rgba(237,237,237,0.35)' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                            No operations found for this filter.
                        </div>
                    </div>
                ) : (
                    rows.map(row => (
                        <OpRow
                            key={row.opId}
                            row={row}
                            isJ2Lead={isJ2Lead}
                            onAssign={(opId, opTitle, check) => setAssignTarget({ opId, opTitle, check })}
                            onComplete={(opId, opTitle, check) => setCompleteTarget({ opId, opTitle, check })}
                            onRefresh={() => load(filter)}
                        />
                    ))
                )}
            </div>

            {/* Assign modal */}
            {assignTarget && (
                <AssignModal
                    opId={assignTarget.opId}
                    opTitle={assignTarget.opTitle}
                    checkId={assignTarget.check.checkId}
                    weeksOut={assignTarget.check.weeksOut}
                    currentAssignee={assignTarget.check.task
                        ? { id: assignTarget.check.task.assignedTo, name: assignTarget.check.task.assignedToName }
                        : undefined}
                    onClose={() => setAssignTarget(null)}
                    onSaved={() => load(filter)}
                />
            )}

            {/* Complete modal */}
            {completeTarget && (
                <CompleteModal
                    opId={completeTarget.opId}
                    opTitle={completeTarget.opTitle}
                    checkId={completeTarget.check.checkId}
                    weeksOut={completeTarget.check.weeksOut}
                    dueDate={completeTarget.check.dueDate}
                    isOverdue={completeTarget.check.isOverdue}
                    onClose={() => setCompleteTarget(null)}
                    onSaved={() => load(filter)}
                />
            )}
        </div>
    )
}
