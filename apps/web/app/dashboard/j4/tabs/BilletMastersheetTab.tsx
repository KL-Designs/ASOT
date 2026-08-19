'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { BilletRow, FieldSourceDef, EmailEntry } from '@/lib/billetMastersheet'
import { useMastersheetCtx } from './mastersheet-context'
import type { PendingChange } from './mastersheet-context'
import MemberDetailPanel from '@/app/dashboard/personnel/all/MemberDetailPanel'

// ── Cert / Award abbreviations ────────────────────────────────────────────────

const CERT_ABBR: Record<string, string> = {
    'Basic CQB Course':                        'CQB',
    'Basic Medical Course':                    'MED',
    'Advanced Medical Course':                 'ADV MED',
    'Basic Indirect Fires Course':             'IDF',
    'Direct Fires Support Weapons Course':     'DFSW',
    'Basic Rotary Wing Course':                'BRW',
    'Basic Rotary Wing Assessment (Wings)':    'RW WINGS',
    'Advanced Rotary Wing Course':             'ARW',
    'Basic CAS and RECON Course':              'CAS',
    'Advanced CAS Course':                     'ADV CAS',
    'Radio Telecommunications Operator Course':'RTO',
    'Forward Observer Course':                 'FO',
    'Basic Staff (NCO) Course':                'NCO',
    'Static Line Paratrooper Course':          'SLP',
    'Driver Basics Course':                    'DRV',
    'Driver Formations and Tactics Course':    'DRV F&T',
    'VCP':                                     'VCP',
    'BCT 1':                                   'BCT1',
    'BCT 2':                                   'BCT2',
    'Rifleman Proficiency':                    'RIFLE',
    'Machine Gunner Proficiency':              'MG',
    'AT Gunner Proficiency':                   'AT',
    'Grenadier Proficiency':                   'GLA',
    'Pistol Sharpshooter Proficiency':         'PISTOL',
}

const AWARD_ABBR: Record<string, string> = {
    'Unit Proficiency':                 '6M',
    '1 Year Service Citation':          '1Y',
    '2 Year Service Citation':          '2Y',
    '3 Year Service Citation':          '3Y',
    '4 Year+ Service Citation':         '4Y+',
    'ASOT Beyond Award':                'BEYOND',
    'Broken Lance Award':               'BKN LNC',
    'Diplomat Award':                   'DIPL',
    'Instructor Award':                 'INSTR',
    'Public Relations Award':           'PR AWD',
    'Group Development Award':          'GD',
    'Architect Award':                  'ARCH',
    'Watchman Award':                   'WTCH',
    'Atlas Award':                      'ATLAS',
    'Bronze Soldiers Medallion':        'BSM',
    'Silver Soldiers Medallion':        'SSM',
    'Gold Soldiers Medallion':          'GSM',
    'Founding Member':                  'FM',
    'Gallantry Award':                  'GAL',
    'Star of Courage':                  'SoC',
    'ASOT Cross of Valour':             'CoV',
    'Protagonist Award':                'PROT',
    'Junior Leadership Award':          'JLA',
    'Senior Leadership Award':          'SLA',
    'Rotary Aviation Medal':            'RAM',
    'Medical Medallion':                'MED MDL',
}

const ALL_CERTS = [
    'Basic CQB Course', 'Basic Medical Course', 'Advanced Medical Course',
    'Basic Indirect Fires Course', 'Direct Fires Support Weapons Course',
    'Basic Rotary Wing Course', 'Basic Rotary Wing Assessment (Wings)', 'Advanced Rotary Wing Course',
    'Basic CAS and RECON Course', 'Advanced CAS Course',
    'Radio Telecommunications Operator Course', 'Forward Observer Course',
    'Basic Staff (NCO) Course', 'Static Line Paratrooper Course',
    'Driver Basics Course', 'Driver Formations and Tactics Course',
    'VCP', 'BCT 1', 'BCT 2',
    'Rifleman Proficiency', 'Machine Gunner Proficiency', 'AT Gunner Proficiency',
    'Grenadier Proficiency', 'Pistol Sharpshooter Proficiency',
]

const ALL_AWARDS = [
    'Unit Proficiency', '1 Year Service Citation', '2 Year Service Citation',
    '3 Year Service Citation', '4 Year+ Service Citation',
    'ASOT Beyond Award', 'Broken Lance Award', 'Diplomat Award', 'Instructor Award',
    'Public Relations Award', 'Group Development Award', 'Architect Award',
    'Watchman Award', 'Atlas Award',
    'Bronze Soldiers Medallion', 'Silver Soldiers Medallion', 'Gold Soldiers Medallion',
    'Founding Member', 'Gallantry Award', 'Star of Courage', 'ASOT Cross of Valour',
    'Protagonist Award', 'Junior Leadership Award', 'Senior Leadership Award',
    'Rotary Aviation Medal', 'Medical Medallion',
]

// ── Source badge ──────────────────────────────────────────────────────────────

type FieldSource = 'website' | 'imported' | 'calculated'

const SOURCE_STYLE: Record<FieldSource, { bg: string; color: string; label: string }> = {
    website:    { bg: 'rgba(0,195,100,0.12)',   color: 'rgb(0,195,100)',  label: 'WEBSITE'  },
    imported:   { bg: 'rgba(245,158,11,0.12)',  color: 'var(--amber)',         label: 'IMPORTED' },
    calculated: { bg: 'rgba(96,165,250,0.12)',  color: 'var(--info)',         label: 'CALC'     },
}

function SourceBadge({ source }: { source: FieldSource }) {
    const s = SOURCE_STYLE[source]
    return (
        <span style={{ display: 'inline-block', fontSize: '0.44rem', fontWeight: 700, letterSpacing: '0.15em', padding: '1px 5px', background: s.bg, color: s.color, verticalAlign: 'middle' }}>
            {s.label}
        </span>
    )
}

// ── Source map panel ──────────────────────────────────────────────────────────

function FieldSourcePanel({ fieldSources }: { fieldSources: FieldSourceDef[] }) {
    const [open, setOpen] = useState(false)
    return (
        <div style={{ border: '1px solid rgba(245,158,11,0.18)', background: 'rgba(245,158,11,0.03)', flexShrink: 0 }}>
            <button onClick={() => setOpen(p => !p)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--amber)' }}>{open ? '−' : '+'} Field Source Map</span>
                <span style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.05em' }}>J4 / CHQ only — shows where each column's data originates</span>
            </button>
            {open && (
                <div style={{ padding: '0 12px 12px', overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                        <thead>
                            <tr>{['Column Group', 'Fields', 'Source', 'Reference / Note'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', borderBottom: '1px solid rgba(245,158,11,0.15)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}</tr>
                        </thead>
                        <tbody>
                            {fieldSources.map((f, i) => (
                                <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                                    <td style={{ padding: '6px 10px', fontSize: '0.68rem', fontWeight: 600, color: 'rgba(237,237,237,0.75)', whiteSpace: 'nowrap' }}>{f.group}</td>
                                    <td style={{ padding: '6px 10px', fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)', maxWidth: 280 }}>{f.fields}</td>
                                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}><SourceBadge source={f.source} /></td>
                                    <td style={{ padding: '6px 10px', fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', maxWidth: 380 }}>{f.websiteRef ?? f.note ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ── Email popup ───────────────────────────────────────────────────────────────

function EmailPopup({ memberId, memberName, currentEmail, emailHistory, onClose, onSaved }: {
    memberId: string
    memberName: string
    currentEmail: string | null
    emailHistory: EmailEntry[]
    onClose: () => void
    onSaved: () => void
}) {
    const [editMode, setEditMode] = useState(false)
    const [newEmail, setNewEmail] = useState('')
    const [saving, setSaving] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [showHistory, setShowHistory] = useState(false)
    const [copied, setCopied] = useState(false)

    async function save() {
        if (!newEmail.includes('@')) { setErr('Invalid email'); return }
        setSaving(true); setErr(null)
        try {
            const res = await fetch(`/api/admin/j4/member-emails/${memberId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newEmail.trim() }),
            })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error ?? 'Save failed')
            onSaved()
            setEditMode(false)
            setNewEmail('')
        } catch (e: any) {
            setErr(e.message)
        } finally {
            setSaving(false)
        }
    }

    function copyEmail() {
        if (currentEmail) {
            navigator.clipboard.writeText(currentEmail).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
            <div style={{ background: '#111', border: '1px solid var(--line-2)', padding: '24px', minWidth: 340, maxWidth: 440, color: '#ededed' }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(219,0,29,0.7)', marginBottom: 4, textTransform: 'uppercase' }}>J4 — Administration</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Dept Email — {memberName}</div>

                {!editMode ? (
                    <>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '10px 12px', marginBottom: 12, fontSize: '0.78rem', color: currentEmail ? 'var(--info)' : 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>
                            {currentEmail ?? 'No email on file'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            {currentEmail && (
                                <button onClick={copyEmail} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', color: copied ? 'rgb(0,195,100)' : 'var(--info)', cursor: 'pointer' }}>
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            )}
                            <button onClick={() => { setEditMode(true); setNewEmail('') }} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.3)', color: '#ededed', cursor: 'pointer' }}>
                                {currentEmail ? 'Update Email' : 'Add Email'}
                            </button>
                        </div>
                        {emailHistory.length > 1 && (
                            <button onClick={() => setShowHistory(p => !p)} style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, letterSpacing: '0.08em' }}>
                                {showHistory ? '− Hide' : '+ View'} Previous Emails ({emailHistory.length - 1})
                            </button>
                        )}
                        {showHistory && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                                {[...emailHistory].reverse().slice(1).map((e, i) => (
                                    <div key={i} style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace', padding: '4px 8px', background: 'rgba(255,255,255,0.03)' }}>
                                        {e.email}
                                        <span style={{ marginLeft: 8, fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)' }}>{new Date(e.addedAt).toLocaleDateString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <input
                            autoFocus
                            type='email'
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            placeholder='email@example.com'
                            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line-2)', color: '#ededed', fontSize: '0.78rem', padding: '8px 10px', outline: 'none', marginBottom: 10, boxSizing: 'border-box', fontFamily: 'monospace' }}
                        />
                        {err && <div style={{ fontSize: '0.68rem', color: 'var(--red)', marginBottom: 8 }}>{err}</div>}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={save} disabled={saving} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: 'rgba(0,195,100,0.12)', border: '1px solid rgba(0,195,100,0.3)', color: saving ? 'rgba(237,237,237,0.35)' : 'rgb(0,195,100)', cursor: saving ? 'default' : 'pointer' }}>
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => { setEditMode(false); setErr(null) }} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                    <button onClick={onClose} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        </div>
    )
}

// ── Import panel ──────────────────────────────────────────────────────────────

type ImportResult = { imported: number; matched: number; unmatched: number; importedActive: number; importedDischarged: number; unmatchedNames: string[] }

type Confidence = 'exact' | 'normalized' | 'partial' | 'fuzzy'
type DryRunCandidate = { memberId: string; memberName: string; confidence: Confidence; source?: 'lh' }
type DryRunConfirmed = { csvName: string; emails: string[]; memberId: string; memberName: string; confidence: Confidence; source?: 'lh' }
type DryRunUncertain = { csvName: string; emails: string[]; candidates: DryRunCandidate[] }
type DryRunUnmatched = { csvName: string; emails: string[] }
type DryRunResult = {
    confirmed: DryRunConfirmed[]
    uncertain: DryRunUncertain[]
    unmatched: DryRunUnmatched[]
    skipped: number
}

// ── Email import review modal ─────────────────────────────────────────────────

function ConfBadge({ conf }: { conf: Confidence }) {
    const styles: Record<Confidence, { bg: string; color: string }> = {
        exact:      { bg: 'rgba(0,195,100,0.12)',  color: 'rgb(0,195,100)' },
        normalized: { bg: 'rgba(0,195,100,0.08)',  color: 'rgb(0,195,100)' },
        partial:    { bg: 'rgba(96,165,250,0.12)', color: 'var(--info)' },
        fuzzy:      { bg: 'rgba(245,158,11,0.12)', color: 'var(--amber)' },
    }
    const s = styles[conf]
    return (
        <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '1px 5px', background: s.bg, color: s.color }}>
            {conf}
        </span>
    )
}

function EmailImportReviewModal({ dryRun, onClose, onDone }: {
    dryRun: DryRunResult
    onClose: () => void
    onDone: (inserted: number, duplicates: number) => void
}) {
    const [showConfirmed, setShowConfirmed] = useState(false)
    const [showUnmatched, setShowUnmatched] = useState(false)

    // Each uncertain row: accepted memberId (or null = skip, undefined = not decided yet)
    const [decisions, setDecisions] = useState<(string | null)[]>(
        () => dryRun.uncertain.map(u => u.candidates.length === 1 ? u.candidates[0].memberId : undefined as any)
    )

    const [confirming, setConfirming] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    function decide(i: number, memberId: string | null) {
        setDecisions(prev => { const d = [...prev]; d[i] = memberId; return d })
    }

    async function handleImport() {
        setConfirming(true); setErr(null)
        try {
            // Build entries: confirmed rows + accepted uncertain rows
            const entries: { memberId: string; email: string }[] = []
            for (const r of dryRun.confirmed) {
                for (const email of r.emails) entries.push({ memberId: r.memberId, email })
            }
            dryRun.uncertain.forEach((r, i) => {
                const memberId = decisions[i]
                if (!memberId) return
                for (const email of r.emails) entries.push({ memberId, email })
            })

            const res = await fetch('/api/admin/j4/member-emails/import/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries }),
            })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error ?? 'Failed')
            onDone(data.inserted, data.duplicates)
        } catch (e: any) {
            setErr(e.message)
        } finally {
            setConfirming(false)
        }
    }

    const acceptedCount = decisions.filter(d => d != null && d !== undefined).length
    const undecidedCount = dryRun.uncertain.filter((_, i) => decisions[i] === undefined).length
    const totalToImport = dryRun.confirmed.reduce((s, r) => s + r.emails.length, 0)
        + dryRun.uncertain.reduce((s, r, i) => decisions[i] ? s + r.emails.length : s, 0)

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
            <div style={{ background: '#0e0e0e', border: '1px solid rgba(96,165,250,0.3)', borderTop: '2px solid #60a5fa', width: '90%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', color: '#ededed' }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(96,165,250,0.7)', textTransform: 'uppercase', marginBottom: 3 }}>J4 — Email Import Review</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Review Matches</div>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                        {dryRun.confirmed.length} auto-matched · {dryRun.uncertain.length} need review · {dryRun.unmatched.length} unmatched · {dryRun.skipped} skipped
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* Confirmed section */}
                    {dryRun.confirmed.length > 0 && (
                        <div style={{ border: '1px solid rgba(0,195,100,0.2)', background: 'rgba(0,195,100,0.03)' }}>
                            <button onClick={() => setShowConfirmed(p => !p)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                                <span style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgb(0,195,100)' }}>
                                    {showConfirmed ? '−' : '+'} Auto-matched ({dryRun.confirmed.length} members, {dryRun.confirmed.reduce((s, r) => s + r.emails.length, 0)} emails)
                                </span>
                            </button>
                            {showConfirmed && (
                                <div style={{ padding: '0 12px 10px', maxHeight: 200, overflowY: 'auto' }}>
                                    {dryRun.confirmed.map((r, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.65rem' }}>
                                            <span style={{ color: 'rgba(237,237,237,0.5)', minWidth: 90 }}>{r.csvName}</span>
                                            <span style={{ color: 'rgba(0,195,100,0.8)', flex: 1, fontFamily: 'monospace', fontSize: '0.6rem' }}>{r.emails.join(', ')}</span>
                                            <span style={{ color: 'rgba(237,237,237,0.35)' }}>→ {r.memberName}</span>
                                            <ConfBadge conf={r.confidence} />
                                            {r.source === 'lh' && <span style={{ fontSize: '0.44rem', fontWeight: 700, letterSpacing: '0.12em', padding: '1px 5px', background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>LH</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Uncertain section */}
                    {dryRun.uncertain.length > 0 && (
                        <div style={{ border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.02)' }}>
                            <div style={{ padding: '8px 12px 6px', fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--amber)', borderBottom: '1px solid rgba(245,158,11,0.12)' }}>
                                Needs Review — {undecidedCount > 0 ? `${undecidedCount} undecided` : 'all reviewed'}
                            </div>
                            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                                {dryRun.uncertain.map((r, i) => {
                                    const dec = decisions[i]
                                    return (
                                        <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: dec === null ? 'rgba(219,0,29,0.04)' : dec ? 'rgba(0,195,100,0.03)' : undefined }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                                                <div style={{ minWidth: 80 }}>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)' }}>{r.csvName}</div>
                                                    {r.emails.map((e, ei) => (
                                                        <div key={ei} style={{ fontSize: '0.58rem', color: 'var(--info)', fontFamily: 'monospace' }}>{e}</div>
                                                    ))}
                                                </div>
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {r.candidates.map((c, ci) => (
                                                        <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <button
                                                                onClick={() => decide(i, dec === c.memberId ? undefined as any : c.memberId)}
                                                                style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', cursor: 'pointer', background: dec === c.memberId ? 'rgba(0,195,100,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${dec === c.memberId ? 'rgba(0,195,100,0.45)' : 'rgba(255,255,255,0.1)'}`, color: dec === c.memberId ? 'rgb(0,195,100)' : 'rgba(237,237,237,0.6)' }}
                                                            >
                                                                {dec === c.memberId ? '✓ Selected' : 'Select'}
                                                            </button>
                                                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.7)' }}>{c.memberName}</span>
                                                            <ConfBadge conf={c.confidence} />
                                                            {c.source === 'lh' && <span style={{ fontSize: '0.44rem', fontWeight: 700, letterSpacing: '0.12em', padding: '1px 5px', background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>LH</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={() => decide(i, dec === null ? undefined as any : null)}
                                                    style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', cursor: 'pointer', background: dec === null ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${dec === null ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.08)'}`, color: dec === null ? 'var(--red)' : 'rgba(237,237,237,0.3)', flexShrink: 0 }}
                                                >
                                                    {dec === null ? '✗ Skipped' : 'Skip'}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Unmatched section */}
                    {dryRun.unmatched.length > 0 && (
                        <div style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                            <button onClick={() => setShowUnmatched(p => !p)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                                <span style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                                    {showUnmatched ? '−' : '+'} Unmatched ({dryRun.unmatched.length}) — no member found, will not import
                                </span>
                            </button>
                            {showUnmatched && (
                                <div style={{ padding: '0 12px 10px', maxHeight: 160, overflowY: 'auto' }}>
                                    {dryRun.unmatched.map((r, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: '0.62rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{ color: 'rgba(237,237,237,0.4)', minWidth: 90 }}>{r.csvName}</span>
                                            <span style={{ color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>{r.emails.join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {err && <div style={{ fontSize: '0.68rem', color: 'var(--red)' }}>{err}</div>}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)' }}>
                        Will import {totalToImport} email{totalToImport !== 1 ? 's' : ''} for {dryRun.confirmed.length + acceptedCount} member{dryRun.confirmed.length + acceptedCount !== 1 ? 's' : ''}
                        {undecidedCount > 0 && <span style={{ color: 'var(--amber)' }}> · {undecidedCount} uncertain still undecided</span>}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button onClick={onClose} disabled={confirming} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={handleImport} disabled={confirming || totalToImport === 0} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: totalToImport > 0 ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${totalToImport > 0 ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`, color: confirming || totalToImport === 0 ? 'rgba(237,237,237,0.3)' : 'var(--info)', cursor: confirming || totalToImport === 0 ? 'default' : 'pointer' }}>
                            {confirming ? 'Importing…' : `Import ${totalToImport} Email${totalToImport !== 1 ? 's' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function ImportPanel({ extrasImported, unmatchedExtras, onImported }: { extrasImported: boolean; unmatchedExtras: number; onImported: () => void }) {
    const [loading, setLoading] = useState(false)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [showUnmatched, setShowUnmatched] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const [emailLoading, setEmailLoading] = useState(false)
    const [emailErr, setEmailErr] = useState<string | null>(null)
    const [emailDryRun, setEmailDryRun] = useState<DryRunResult | null>(null)
    const [emailDoneMsg, setEmailDoneMsg] = useState<string | null>(null)
    const emailInputRef = useRef<HTMLInputElement>(null)

    async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file) return
        setLoading(true); setImportResult(null); setErr(null); setShowUnmatched(false)
        try {
            const fd = new FormData(); fd.append('file', file)
            const res = await fetch('/api/admin/j4/mastersheet/billet', { method: 'POST', body: fd })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error ?? 'Failed')
            setImportResult(data)
            onImported()
        } catch (e: any) { setErr(e?.message ?? 'Import failed') }
        finally { setLoading(false); if (inputRef.current) inputRef.current.value = '' }
    }

    async function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file) return
        setEmailLoading(true); setEmailDryRun(null); setEmailErr(null); setEmailDoneMsg(null)
        try {
            const fd = new FormData(); fd.append('file', file)
            const res = await fetch('/api/admin/j4/member-emails/import', { method: 'POST', body: fd })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error ?? 'Failed')
            setEmailDryRun(data)
        } catch (e: any) { setEmailErr(e?.message ?? 'Import failed') }
        finally { setEmailLoading(false); if (emailInputRef.current) emailInputRef.current.value = '' }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => inputRef.current?.click()} disabled={loading} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 14px', cursor: loading ? 'default' : 'pointer', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.3)', color: loading ? 'rgba(237,237,237,0.35)' : '#ededed', opacity: loading ? 0.6 : 1 }}>
                    {loading ? 'Importing…' : 'Import Billet CSV'}
                </button>
                <input ref={inputRef} type='file' accept='.csv' style={{ display: 'none' }} onChange={handleChange} />
                <button onClick={() => emailInputRef.current?.click()} disabled={emailLoading} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 14px', cursor: emailLoading ? 'default' : 'pointer', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', color: emailLoading ? 'rgba(237,237,237,0.35)' : 'var(--info)', opacity: emailLoading ? 0.6 : 1 }}>
                    {emailLoading ? 'Analysing…' : 'Import Emails CSV'}
                </button>
                <input ref={emailInputRef} type='file' accept='.csv' style={{ display: 'none' }} onChange={handleEmailChange} />
                {extrasImported && !importResult && <span style={{ fontSize: '0.62rem', color: unmatchedExtras > 0 ? 'var(--amber)' : 'rgb(0,195,100)' }}>Imported — {unmatchedExtras > 0 ? `${unmatchedExtras} unmatched` : 'all matched'}</span>}
                {!extrasImported && !importResult && <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)' }}>No billet extras imported — Billet / Up To Date columns will show —</span>}
                {err && <span style={{ fontSize: '0.68rem', color: 'var(--red)' }}>{err}</span>}
                {importResult && (
                    <span style={{ fontSize: '0.68rem', color: importResult.unmatched > 0 ? 'var(--amber)' : 'rgb(0,195,100)' }}>
                        Imported {importResult.imported} ({importResult.importedActive} active, {importResult.importedDischarged} discharged) — {importResult.matched} matched
                        {importResult.unmatched > 0 && (
                            <> · <button onClick={() => setShowUnmatched(p => !p)} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', padding: 0, fontSize: '0.68rem', textDecoration: 'underline' }}>{importResult.unmatched} unmatched</button></>
                        )}
                    </span>
                )}
                {emailErr && <span style={{ fontSize: '0.68rem', color: 'var(--red)' }}>{emailErr}</span>}
                {emailDoneMsg && <span style={{ fontSize: '0.68rem', color: 'rgb(0,195,100)' }}>{emailDoneMsg}</span>}
            </div>
            {showUnmatched && importResult && importResult.unmatchedNames.length > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', padding: '8px 12px', maxHeight: 140, overflowY: 'auto' }}>
                    <div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 6 }}>Unmatched Names — no matching member found</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                        {importResult.unmatchedNames.map((n, i) => <span key={i} style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)', fontFamily: 'monospace' }}>{n}</span>)}
                    </div>
                </div>
            )}
            {emailDryRun && (
                <EmailImportReviewModal
                    dryRun={emailDryRun}
                    onClose={() => setEmailDryRun(null)}
                    onDone={(inserted, duplicates) => {
                        setEmailDryRun(null)
                        setEmailDoneMsg(`Emails: ${inserted} added${duplicates > 0 ? ` · ${duplicates} already existed` : ''}`)
                        onImported()
                    }}
                />
            )}
        </div>
    )
}

// ── Sync scroll wrapper ───────────────────────────────────────────────────────

function SyncScrollTable({ children }: { children: React.ReactNode }) {
    const topRef = useRef<HTMLDivElement>(null)
    const botRef = useRef<HTMLDivElement>(null)
    const mirrorRef = useRef<HTMLDivElement>(null)
    const syncing = useRef(false)

    // Keep top mirror width = actual scroll width of table container
    useEffect(() => {
        function syncWidth() {
            if (botRef.current && mirrorRef.current) {
                mirrorRef.current.style.width = `${botRef.current.scrollWidth}px`
            }
        }
        syncWidth()
        const obs = new ResizeObserver(syncWidth)
        if (botRef.current) obs.observe(botRef.current)
        if (botRef.current?.firstElementChild) obs.observe(botRef.current.firstElementChild)
        return () => obs.disconnect()
    }, [])

    function onTop() {
        if (syncing.current || !botRef.current || !topRef.current) return
        syncing.current = true
        botRef.current.scrollLeft = topRef.current.scrollLeft
        syncing.current = false
    }
    function onBot() {
        if (syncing.current || !topRef.current || !botRef.current) return
        syncing.current = true
        topRef.current.scrollLeft = botRef.current.scrollLeft
        syncing.current = false
    }

    function onWheel(e: React.WheelEvent) {
        if (!e.shiftKey) return
        e.preventDefault()
        if (botRef.current) botRef.current.scrollLeft += e.deltaY
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Top scrollbar mirror */}
            <div ref={topRef} onScroll={onTop} style={{ overflowX: 'scroll', overflowY: 'hidden', height: 14, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div ref={mirrorRef} style={{ height: 1, minWidth: '100%' }} />
            </div>
            {/* Table area */}
            <div ref={botRef} onScroll={onBot} onWheel={onWheel} style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto' }}>
                {children}
            </div>
        </div>
    )
}

// ── Tick / Num helpers ────────────────────────────────────────────────────────

function Tick({ has }: { has: boolean }) {
    return <span style={{ display: 'block', textAlign: 'center', fontSize: '0.68rem', color: has ? 'rgb(0,195,100)' : 'rgba(255,255,255,0.1)', fontWeight: has ? 700 : 400 }}>{has ? '✓' : '—'}</span>
}

function Num({ v }: { v: number }) {
    return <span style={{ display: 'block', textAlign: 'center', fontSize: '0.72rem', color: v > 0 ? 'rgba(237,237,237,0.8)' : 'rgba(255,255,255,0.12)', fontWeight: v > 0 ? 600 : 400 }}>{v > 0 ? v : '—'}</span>
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = keyof BilletRow

function sortRows(rows: BilletRow[], key: SortKey, dir: 'asc' | 'desc'): BilletRow[] {
    const mul = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
        const av = a[key] as any
        const bv = b[key] as any
        if (av == null && bv == null) return 0
        if (av == null) return mul
        if (bv == null) return -mul
        if (typeof av === 'number' && typeof bv === 'number') return mul * (av - bv)
        return mul * String(av).localeCompare(String(bv), 'en', { sensitivity: 'base' })
    })
}

function SortHdr({ label, col, sort, onSort, style }: { label: string; col: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void; style?: React.CSSProperties }) {
    const active = sort.key === col
    return (
        <th onClick={() => onSort(col)} style={{ ...style, cursor: 'pointer', userSelect: 'none', position: 'relative' }} title={`Sort by ${label}`}>
            <span style={{ color: active ? '#ededed' : undefined }}>
                {label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
            </span>
        </th>
    )
}

// ── Inline editable cell (imported fields only) ───────────────────────────────

function EditCell({
    rowId, field, fieldLabel, memberName,
    displayValue, editValue, isEditing, isPending, isJumpTarget,
    onStartEdit, onEndEdit, renderDisplay,
}: {
    rowId: string; field: string; fieldLabel: string; memberName: string
    displayValue: string | null | boolean; editValue: string; isEditing: boolean; isPending: boolean; isJumpTarget: boolean
    onStartEdit: () => void; onEndEdit: (val: string, original: string | null | boolean) => void
    renderDisplay: () => React.ReactNode
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [val, setVal] = useState(editValue)

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (isEditing) { setVal(String(displayValue ?? '')); inputRef.current?.focus() } }, [isEditing])

    const border = isJumpTarget ? '1px solid rgba(96,165,250,0.6)' : isPending ? '1px solid rgba(245,158,11,0.4)' : 'none'

    if (isEditing) {
        return (
            <td style={{ padding: '2px 4px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.4)', zIndex: 2 }}>
                <input
                    ref={inputRef}
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    onBlur={() => onEndEdit(val, displayValue)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEndEdit(val, displayValue) } if (e.key === 'Escape') onEndEdit(String(displayValue ?? ''), displayValue) }}
                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--amber)', fontSize: '0.7rem', width: '100%', padding: 0 }}
                />
            </td>
        )
    }

    return (
        <td onClick={onStartEdit} style={{ cursor: 'pointer', border, background: isPending ? 'rgba(245,158,11,0.04)' : isJumpTarget ? 'rgba(96,165,250,0.06)' : undefined, transition: 'background 0.15s' }} title='Click to edit'>
            {renderDisplay()}
        </td>
    )
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', dangerous = false, loading = false, onConfirm, onCancel }: {
    title: string; message: React.ReactNode; confirmLabel?: string; dangerous?: boolean; loading?: boolean
    onConfirm: () => void; onCancel: () => void
}) {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }} onClick={onCancel}>
            <div style={{ background: '#111', border: `1px solid ${dangerous ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.12)'}`, borderTop: `2px solid ${dangerous ? 'var(--red)' : 'rgba(255,255,255,0.25)'}`, padding: '24px', maxWidth: 420, width: '90%', color: '#ededed' }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)', marginBottom: 20, lineHeight: 1.5 }}>{message}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onCancel} disabled={loading} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={onConfirm} disabled={loading} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 14px', background: dangerous ? 'rgba(219,0,29,0.18)' : 'rgba(0,195,100,0.15)', border: `1px solid ${dangerous ? 'rgba(219,0,29,0.4)' : 'rgba(0,195,100,0.35)'}`, color: loading ? 'rgba(237,237,237,0.35)' : dangerous ? '#ededed' : 'rgb(0,195,100)', cursor: loading ? 'default' : 'pointer' }}>
                        {loading ? 'Working…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Personnel overlay ─────────────────────────────────────────────────────────

function PersonnelOverlay({ username, onClose }: { username: string; onClose: () => void }) {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
            <div style={{ width: '100%', maxWidth: 900, background: '#0c0c0c', borderLeft: '2px solid rgba(219,0,29,0.4)', display: 'flex', flexDirection: 'column', minHeight: 0 }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line-2)', background: 'rgba(0,0,0,0.5)', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(219,0,29,0.7)', textTransform: 'uppercase' }}>Personnel Profile</span>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.45)', marginLeft: 4 }}>{username}</span>
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 12px', cursor: 'pointer' }}>Close</button>
                </div>
                {/* Body — full MilPac editor + J4 admin panel */}
                <MemberDetailPanel
                    key={username}
                    username={username}
                    isJ4={true}
                    canEditRestricted={true}
                    canEditStandard={true}
                    onMemberDeleted={onClose}
                />
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BilletMastersheetTab() {
    const ctx = useMastersheetCtx()

    const [rows, setRows] = useState<BilletRow[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [membership, setMembership] = useState<'active' | 'discharged' | 'all'>('active')
    const [extrasImported, setExtrasImported] = useState(false)
    const [unmatchedExtras, setUnmatchedExtras] = useState(0)
    const [fieldSources, setFieldSources] = useState<FieldSourceDef[]>([])
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())   // certs + awards visible by default
    const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
    const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null)
    const [emailPopup, setEmailPopup] = useState<{ row: BilletRow } | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<{ rowId: string; name: string } | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [overlayUsername, setOverlayUsername] = useState<string | null>(null)
    const [editingLabels, setEditingLabels] = useState(false)
    const [columnLabels, setColumnLabels] = useState<Record<string, string>>({})
    const [diagnosticMode, setDiagnosticMode] = useState(false)
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const tableRef = useRef<HTMLDivElement>(null)

    function load(s: string, mem = membership) {
        setLoading(true)
        fetch(`/api/admin/j4/mastersheet/billet?search=${encodeURIComponent(s)}&membership=${mem}`)
            .then(r => r.json())
            .then(d => {
                setRows(d.rows ?? [])
                setTotal(d.total ?? 0)
                setExtrasImported(!!d.extrasImported)
                setUnmatchedExtras(d.unmatchedExtras ?? 0)
                setFieldSources(d.fieldSources ?? [])
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load('') }, [])

    function handleSearch(v: string) {
        setSearch(v)
        if (debounce.current) clearTimeout(debounce.current)
        debounce.current = setTimeout(() => load(v), 300)
    }

    function handleMembership(m: 'active' | 'discharged' | 'all') {
        setMembership(m)
        load(search, m)
    }

    function lbl(key: string, defaultLabel: string): string {
        return columnLabels[key] ?? defaultLabel
    }

    function setLabel(key: string, val: string) {
        setColumnLabels(prev => ({ ...prev, [key]: val || '' }))
    }

    async function handleConfirmDeleteBillet() {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/j4/mastersheet/billet/${deleteTarget.rowId}`, { method: 'DELETE' })
            if (!res.ok) return
            setRows(prev => prev.filter(r => r.id !== deleteTarget.rowId))
            setTotal(t => t - 1)
            ctx.removeChange(`billet:${deleteTarget.rowId}:billet`)
            ctx.removeChange(`billet:${deleteTarget.rowId}:upToDate`)
            ctx.removeChange(`billet:${deleteTarget.rowId}:lastUpdate`)
            setDeleteTarget(null)
        } catch { } finally { setDeleting(false) }
    }

    function handleSort(key: SortKey) {
        setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
    }

    // Watch for jump target from review window
    useEffect(() => {
        if (ctx.jumpTarget?.tab === 'billet') {
            const el = tableRef.current?.querySelector(`[data-row-id="${ctx.jumpTarget.rowId}"]`)
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setEditingCell({ rowId: ctx.jumpTarget.rowId, field: ctx.jumpTarget.field })
            ctx.setJumpTarget(null)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.jumpTarget])

    // Get pending value for a given rowId+field
    function getPendingValue(rowId: string, field: string): string | number | boolean | null | undefined {
        const change = ctx.pendingChanges.get(`billet:${rowId}:${field}`)
        return change?.newValue
    }

    function getDisplayValue(row: BilletRow, field: 'billet' | 'upToDate' | 'lastUpdate') {
        const pv = getPendingValue(row.id, field)
        if (pv !== undefined) return pv as any
        return row[field]
    }

    function handleEndEdit(rowId: string, field: 'billet' | 'upToDate' | 'lastUpdate', fieldLabel: string, memberName: string, newVal: string, originalVal: string | null | boolean) {
        setEditingCell(null)
        const changeId = `billet:${rowId}:${field}`
        // Normalise value for comparison
        const normalised: string | boolean | null = field === 'upToDate'
            ? (newVal.toLowerCase() === 'ok' || newVal.toLowerCase() === 'true' || newVal === '1')
            : (newVal.trim() || null)
        const origNorm: string | boolean | null = field === 'upToDate'
            ? (originalVal === true)
            : (originalVal || null)

        if (normalised === origNorm) {
            ctx.removeChange(changeId)
        } else {
            ctx.upsertChange({
                id: changeId,
                tab: 'billet',
                rowId,
                memberName,
                field,
                fieldLabel,
                oldValue: origNorm,
                newValue: normalised,
            } satisfies PendingChange)
        }
    }

    const MILPAC_COUNT_FIELDS = new Set(['primaryNightOps','secondaryNightOps','primaryNightFTX','secondaryNightFTX','platoonTraining','sectionTraining','meetings','campaignMedals','j1Interviews','j1InterviewBonus','j2MissionsRun','j3Bct12','j3OtherTrainings','j5ContentCreated','j5MilpacsGenerated','j5OfficialPR'])

    async function handleMilpacEdit(rowId: string, username: string, field: string, rawValue: string) {
        setEditingCell(null)
        const trimmed = rawValue.trim()
        if (!trimmed && field !== 'rank' && field !== 'enlistedDate' && !MILPAC_COUNT_FIELDS.has(field)) return
        try {
            const res = await fetch('/api/admin/j4/mastersheet/member-milpac', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, field, value: trimmed }),
            })
            const data = await res.json()
            if (!data.ok) return
            // Update local row so the cell shows the saved value immediately
            setRows(prev => prev.map(r => {
                if (r.id !== rowId) return r
                if (field === 'rank') return { ...r, rank: String(data.value) }
                if (field === 'enlistedDate') return { ...r, enlistedDate: String(data.value) }
                if (field === 'j4Points') return { ...r, j4Points: Number(data.value) }
                return { ...r, [field]: Number(data.value) }
            }))
        } catch { /* silently ignore — re-load on next navigation */ }
    }

    const showCerts  = !hiddenCols.has('certs')
    const showAwards = !hiddenCols.has('awards')

    const displayRows = sortRows(rows, sort.key, sort.dir)

    // ── Shared styles ─────────────────────────────────────────────────────────

    const hdrBase: React.CSSProperties = {
        padding: '5px 6px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', background: 'rgba(0,0,0,0.55)',
        borderBottom: '1px solid var(--line-2)', whiteSpace: 'nowrap',
        textAlign: 'center',
    }

    const grpHdr = (color: string): React.CSSProperties => ({
        padding: '4px 6px', fontSize: '0.46rem', fontWeight: 700, letterSpacing: '0.18em',
        textTransform: 'uppercase', color, background: 'rgba(0,0,0,0.65)',
        borderBottom: `1px solid ${color}`, whiteSpace: 'nowrap',
        textAlign: 'center',
    })

    const stickyNameHdr: React.CSSProperties = {
        ...hdrBase, position: 'sticky', left: 0, zIndex: 4,
        background: 'rgba(8,8,8,0.98)', textAlign: 'left', minWidth: 175,
        borderRight: '1px solid var(--line-2)',
    } as React.CSSProperties

    const cellBase: React.CSSProperties = {
        padding: '6px 6px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.7)',
        borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
    }

    const stickyNameCell: React.CSSProperties = {
        ...cellBase, position: 'sticky', left: 0, zIndex: 1, background: '#0c0c0c',
        fontWeight: 600, color: 'rgba(237,237,237,0.9)', minWidth: 175,
        borderRight: '1px solid rgba(255,255,255,0.05)',
    }

    const SOURCE_COLOR: Record<FieldSource, string> = {
        website: 'rgba(0,195,100,0.55)', imported: 'rgba(245,158,11,0.55)', calculated: 'rgba(96,165,250,0.55)',
    }

    const rotatedHdr: React.CSSProperties = {
        ...hdrBase, minWidth: 38, maxWidth: 46, writingMode: 'vertical-rl',
        transform: 'rotate(180deg)', height: 60, verticalAlign: 'bottom',
        paddingBottom: 4, fontSize: '0.46rem',
    }

    const numHdr: React.CSSProperties = { ...hdrBase, minWidth: 42 }
    const sortHdrBase: React.CSSProperties = { ...hdrBase, cursor: 'pointer', userSelect: 'none' }

    function mkSortHdr(label: string, col: SortKey, extra?: React.CSSProperties): React.CSSProperties {
        return { ...sortHdrBase, ...extra, color: sort.key === col ? '#ededed' : 'rgba(237,237,237,0.35)' }
    }

    const TOTAL_COLS = 1 + 5 + 3 + 8 + 8 + (showCerts ? ALL_CERTS.length : 0) + (showAwards ? ALL_AWARDS.length : 0) + 1

    // Renders header label text — input when editingLabels is active
    function LblText({ colKey, def }: { colKey: string; def: string }) {
        const current = lbl(colKey, def)
        if (!editingLabels) return <>{current}</>
        return (
            <input
                value={current}
                onChange={e => setLabel(colKey, e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', color: 'var(--info)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', width: '100%', padding: '1px 3px', outline: 'none', textAlign: 'center' }}
            />
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                <input
                    type='text' value={search} onChange={e => handleSearch(e.target.value)}
                    placeholder='Search member…'
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line-2)', color: '#ededed', fontSize: '0.72rem', padding: '5px 10px', outline: 'none', width: 180 }}
                />

                {/* Membership filter */}
                {(['active', 'discharged', 'all'] as const).map(m => (
                    <button key={m} onClick={() => handleMembership(m)} style={{
                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer',
                        background: membership === m ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${membership === m ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        color: membership === m ? '#ededed' : 'rgba(237,237,237,0.4)',
                    }}>
                        {m === 'all' ? 'All' : m === 'active' ? 'Active' : 'Discharged'}
                    </button>
                ))}

                {/* Col toggles */}
                {(['certs', 'awards'] as const).map(k => (
                    <button key={k} onClick={() => setHiddenCols(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })} style={{
                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer',
                        background: hiddenCols.has(k) ? 'rgba(255,255,255,0.04)' : 'rgba(219,0,29,0.15)',
                        border: `1px solid ${hiddenCols.has(k) ? 'rgba(255,255,255,0.08)' : 'rgba(219,0,29,0.35)'}`,
                        color: hiddenCols.has(k) ? 'rgba(237,237,237,0.35)' : '#ededed',
                    }}>
                        {hiddenCols.has(k) ? `+ ${k === 'certs' ? 'Certs' : 'Awards'}` : `− ${k === 'certs' ? 'Certs' : 'Awards'}`}
                    </button>
                ))}

                <button onClick={() => setEditingLabels(p => !p)} style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer', background: editingLabels ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${editingLabels ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`, color: editingLabels ? 'var(--info)' : 'rgba(237,237,237,0.4)' }}>
                    {editingLabels ? 'Done Editing Labels' : 'Edit Labels'}
                </button>
                <button onClick={() => setDiagnosticMode(p => !p)} style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer', background: diagnosticMode ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${diagnosticMode ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`, color: diagnosticMode ? 'var(--amber)' : 'rgba(237,237,237,0.4)' }}>
                    {diagnosticMode ? '× Diagnose' : 'Diagnose'}
                </button>

                <div style={{ marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                    {loading ? 'Loading…' : `${total} member${total !== 1 ? 's' : ''}`}
                </div>
            </div>

            {/* Import row */}
            <div style={{ flexShrink: 0 }}>
                <ImportPanel extrasImported={extrasImported} unmatchedExtras={unmatchedExtras} onImported={() => load(search)} />
            </div>

            {/* Source map (J4 / CHQ only) */}
            {fieldSources.length > 0 && (
                <div style={{ flexShrink: 0 }}>
                    <FieldSourcePanel fieldSources={fieldSources} />
                </div>
            )}

            {/* Diagnostic view */}
            {diagnosticMode && (
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.02)' }}>
                    <div style={{ padding: '8px 12px', fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--amber)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                        Classification Diagnostic — {displayRows.length} member{displayRows.length !== 1 ? 's' : ''} shown
                    </div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                            <tr>
                                {['Name','Classification','Formal Discharge','In Leaving History','In Discharged Section','ASOT Member Role','On ORBAT','Has Rank'].map(h => (
                                    <th key={h} style={{ padding: '5px 10px', fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', background: 'rgba(0,0,0,0.7)', borderBottom: '1px solid rgba(245,158,11,0.15)', whiteSpace: 'nowrap', textAlign: h === 'Name' ? 'left' : 'center' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {displayRows.map((r, i) => {
                                const s = r.classificationSignals
                                const isDischarged = s?.finalClassification === 'discharged'
                                return (
                                    <tr key={r.id} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                                        <td style={{ padding: '5px 10px', fontSize: '0.7rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)', borderBottom: '1px solid rgba(255,255,255,0.03)', whiteSpace: 'nowrap' }}>{r.name}</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '2px 8px', background: isDischarged ? 'rgba(219,0,29,0.15)' : 'rgba(0,195,100,0.12)', color: isDischarged ? 'var(--red)' : 'rgb(0,195,100)', letterSpacing: '0.08em' }}>
                                                {isDischarged ? 'DISCHARGED' : 'ACTIVE'}
                                            </span>
                                        </td>
                                        {[
                                            { v: s?.hasFormalDischarge,    dischargeSig: true  },
                                            { v: s?.inLeavingHistory,      dischargeSig: true  },
                                            { v: s?.inDischargedSection,   dischargeSig: true  },
                                            { v: s?.hasAsotMemberRole,     dischargeSig: false }, // false = missing role → discharged
                                            { v: s?.onOrbat,               dischargeSig: false },
                                            { v: s?.hasRank,               dischargeSig: false },
                                        ].map(({ v, dischargeSig }, ci) => (
                                            <td key={ci} style={{ padding: '5px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.68rem' }}>
                                                <span style={{ color: v == null ? 'rgba(255,255,255,0.2)' : dischargeSig ? (v ? 'var(--red)' : 'rgba(255,255,255,0.2)') : (v ? 'rgb(0,195,100)' : 'var(--red)') }}>
                                                    {v == null ? '—' : dischargeSig ? (v ? '✓' : '—') : (v ? '✓' : '✗')}
                                                </span>
                                            </td>
                                        ))}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Grid with dual scrollbars */}
            {!diagnosticMode && <SyncScrollTable>
                <div ref={tableRef} style={{ border: '1px solid var(--line-2)' }}>
                    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            {/* Group header row */}
                            <tr>
                                <th rowSpan={2} style={stickyNameHdr}>Name</th>
                                <th colSpan={5} style={grpHdr(SOURCE_COLOR.website)}>Identity <SourceBadge source='website' /></th>
                                <th colSpan={3} style={grpHdr(SOURCE_COLOR.imported)}>Billet <SourceBadge source='imported' /></th>
                                <th colSpan={8} style={grpHdr(SOURCE_COLOR.website)}>Attendance <SourceBadge source='website' /></th>
                                <th colSpan={8} style={grpHdr(SOURCE_COLOR.website)}>Dept Actions <SourceBadge source='website' /></th>
                                {showCerts && <th colSpan={ALL_CERTS.length} style={grpHdr(SOURCE_COLOR.website)}>Certifications <SourceBadge source='website' /></th>}
                                {showAwards && <th colSpan={ALL_AWARDS.length} style={grpHdr(SOURCE_COLOR.website)}>Awards <SourceBadge source='website' /></th>}
                                <th rowSpan={2} style={{ ...hdrBase, width: 44, padding: '7px 6px' }} />
                            </tr>

                            {/* Per-column header row */}
                            <tr>
                                {/* Identity */}
                                <th onClick={() => handleSort('rank')} style={mkSortHdr('Rank', 'rank', { ...numHdr, minWidth: 68, textAlign: 'left', paddingLeft: 6 })}><LblText colKey='rank' def='Rank' />{sort.key === 'rank' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                                <th onClick={() => handleSort('enlistedDate')} style={mkSortHdr('Enlisted', 'enlistedDate', { ...numHdr, minWidth: 74 })}><LblText colKey='enlistedDate' def='Enlisted' />{sort.key === 'enlistedDate' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                                <th onClick={() => handleSort('serviceYears')} style={mkSortHdr('Svc', 'serviceYears', { ...numHdr, minWidth: 40 })}><LblText colKey='serviceYears' def='Svc' />{sort.key === 'serviceYears' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                                <th onClick={() => handleSort('promotionPoints')} style={mkSortHdr('PP', 'promotionPoints', { ...numHdr, color: sort.key === 'promotionPoints' ? '#ededed' : 'rgba(237,237,237,0.55)' })}><LblText colKey='promotionPoints' def='PP' />{sort.key === 'promotionPoints' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                                <th onClick={() => handleSort('j4Points')} style={mkSortHdr('J4 Pts', 'j4Points', { ...numHdr, color: sort.key === 'j4Points' ? '#ededed' : 'rgba(245,158,11,0.7)' })}><LblText colKey='j4Points' def='J4 Pts' />{sort.key === 'j4Points' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>

                                {/* Billet (imported + editable) */}
                                <th onClick={() => handleSort('billet')} style={mkSortHdr('Billet', 'billet', { ...numHdr, minWidth: 58, color: sort.key === 'billet' ? '#ededed' : 'var(--amber)' })}><LblText colKey='billet' def='Billet' />{sort.key === 'billet' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                                <th style={{ ...numHdr, minWidth: 54, color: 'var(--amber)' }}><LblText colKey='upToDate' def='Status' /></th>
                                <th style={{ ...numHdr, minWidth: 74, color: 'var(--amber)' }}><LblText colKey='lastUpdate' def='Last Upd' /></th>

                                {/* Attendance */}
                                {(['primaryNightOps','secondaryNightOps','primaryNightFTX','secondaryNightFTX','platoonTraining','sectionTraining','meetings','campaignMedals'] as SortKey[]).map((sk, i) => {
                                    const defs = ['1° Ops','2° Ops','1° FTX','2° FTX','Plt Trn','Sec Trn','Mtgs','Cmpgn']
                                    return (
                                        <th key={sk} onClick={() => handleSort(sk)} style={mkSortHdr(defs[i], sk, numHdr)}>
                                            <LblText colKey={sk} def={defs[i]} />{sort.key === sk ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                        </th>
                                    )
                                })}

                                {/* Dept actions */}
                                {(['j1Interviews','j1InterviewBonus','j2MissionsRun','j3Bct12','j3OtherTrainings','j5ContentCreated','j5MilpacsGenerated','j5OfficialPR'] as SortKey[]).map((sk, i) => {
                                    const defs = ['J1 Int','J1 Bon','J2 Msn','J3 BCT','J3 Trn','J5 Con','J5 Mlp','J5 PR']
                                    return (
                                        <th key={sk} onClick={() => handleSort(sk)} style={mkSortHdr(defs[i], sk, numHdr)}>
                                            <LblText colKey={sk} def={defs[i]} />{sort.key === sk ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                        </th>
                                    )
                                })}

                                {/* Certs */}
                                {showCerts && ALL_CERTS.map(c => <th key={c} style={rotatedHdr}><LblText colKey={`cert:${c}`} def={CERT_ABBR[c] ?? c} /></th>)}

                                {/* Awards */}
                                {showAwards && ALL_AWARDS.map(a => <th key={a} style={rotatedHdr}><LblText colKey={`award:${a}`} def={AWARD_ABBR[a] ?? a} /></th>)}
                            </tr>
                        </thead>

                        <tbody>
                            {displayRows.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={TOTAL_COLS} style={{ ...cellBase, textAlign: 'center', color: 'rgba(237,237,237,0.2)', padding: '32px 12px' }}>No members found.</td>
                                </tr>
                            )}

                            {displayRows.map((r, i) => {
                                const stripe = i % 2 === 1
                                const bg = stripe ? 'rgba(255,255,255,0.018)' : 'transparent'
                                const nameBg = stripe ? '#0e0e0e' : '#0c0c0c'
                                const isJump = ctx.jumpTarget?.tab === 'billet' && ctx.jumpTarget.rowId === r.id

                                const billetVal   = getDisplayValue(r, 'billet')
                                const upToDateVal = getDisplayValue(r, 'upToDate')
                                const lastUpdVal  = getDisplayValue(r, 'lastUpdate')

                                const billetPending   = ctx.pendingChanges.has(`billet:${r.id}:billet`)
                                const upToDatePending = ctx.pendingChanges.has(`billet:${r.id}:upToDate`)
                                const lastUpdPending  = ctx.pendingChanges.has(`billet:${r.id}:lastUpdate`)

                                return (
                                    <tr key={r.id} data-row-id={r.id}>
                                        {/* Name cell + email indicator */}
                                        <td style={{ ...stickyNameCell, background: nameBg }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <button
                                                    onClick={() => r.username ? setOverlayUsername(r.username) : undefined}
                                                    title={r.username ? 'View personnel profile' : r.name}
                                                    style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', cursor: r.username ? 'pointer' : 'default', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', padding: 0 }}
                                                >
                                                    {r.name}
                                                </button>
                                                {r.hasEmail && (
                                                    <button onClick={() => setEmailPopup({ row: r })} style={{ fontSize: '0.52rem', fontWeight: 700, padding: '1px 4px', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)', color: 'var(--info)', cursor: 'pointer', flexShrink: 0, letterSpacing: '0.05em' }} title={r.currentEmail ?? ''}>E</button>
                                                )}
                                                {!r.hasEmail && (
                                                    <button onClick={() => setEmailPopup({ row: r })} style={{ fontSize: '0.52rem', fontWeight: 700, padding: '1px 4px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.2)', cursor: 'pointer', flexShrink: 0 }} title='Add email'>+</button>
                                                )}
                                            </div>
                                        </td>

                                        {/* Identity — rank, enlistedDate editable */}
                                        <td onClick={() => r.username && setEditingCell({ rowId: r.id, field: 'rank' })} style={{ ...cellBase, background: bg, minWidth: 68, cursor: r.username ? 'pointer' : 'default' }} title={r.username ? 'Click to edit rank' : undefined}>
                                            {editingCell?.rowId === r.id && editingCell.field === 'rank' ? (
                                                <input autoFocus defaultValue={r.rank || ''} onBlur={e => handleMilpacEdit(r.id, r.username, 'rank', e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', outline: 'none', color: '#ededed', fontSize: '0.68rem', fontWeight: 600, width: '100%', padding: 0 }} />
                                            ) : <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{r.rank || '—'}</span>}
                                        </td>
                                        <td onClick={() => r.username && setEditingCell({ rowId: r.id, field: 'enlistedDate' })} style={{ ...cellBase, background: bg, textAlign: 'center', fontSize: '0.6rem', color: 'rgba(237,237,237,0.4)', cursor: r.username ? 'pointer' : 'default' }} title={r.username ? 'Click to edit enlisted date' : undefined}>
                                            {editingCell?.rowId === r.id && editingCell.field === 'enlistedDate' ? (
                                                <input autoFocus defaultValue={r.enlistedDate || ''} onBlur={e => handleMilpacEdit(r.id, r.username, 'enlistedDate', e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', outline: 'none', color: 'rgba(237,237,237,0.7)', fontSize: '0.6rem', width: '100%', textAlign: 'center', padding: 0 }} />
                                            ) : r.enlistedDate || '—'}
                                        </td>
                                        <td style={{ ...cellBase, background: bg, textAlign: 'center', fontSize: '0.65rem', color: 'rgba(96,165,250,0.7)' }}>{r.serviceYears}</td>
                                        <td style={{ ...cellBase, background: bg, textAlign: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.72rem', color: r.promotionPoints > 0 ? 'rgba(237,237,237,0.85)' : 'rgba(255,255,255,0.2)' }}>{r.promotionPoints || 0}</span>
                                        </td>
                                        <td onClick={() => r.username && setEditingCell({ rowId: r.id, field: 'j4Points' })} style={{ ...cellBase, background: bg, textAlign: 'center', cursor: r.username ? 'pointer' : 'default' }} title={r.username ? 'Click to edit J4 points' : undefined}>
                                            {editingCell?.rowId === r.id && editingCell.field === 'j4Points' ? (
                                                <input autoFocus type='number' defaultValue={r.j4Points || 0} onBlur={e => handleMilpacEdit(r.id, r.username, 'j4Points', e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--amber)', fontSize: '0.72rem', fontWeight: 700, width: '100%', textAlign: 'center', padding: 0 }} />
                                            ) : <span style={{ fontWeight: 700, fontSize: '0.72rem', color: r.j4Points > 0 ? 'var(--amber)' : 'rgba(255,255,255,0.15)' }}>{r.j4Points || '—'}</span>}
                                        </td>

                                        {/* Billet — editable */}
                                        <td
                                            data-field='billet'
                                            onClick={() => setEditingCell({ rowId: r.id, field: 'billet' })}
                                            style={{ ...cellBase, background: billetPending ? 'rgba(245,158,11,0.05)' : bg, textAlign: 'center', fontSize: '0.65rem', color: billetVal ? 'var(--amber)' : 'rgba(237,237,237,0.2)', cursor: 'pointer', border: (isJump && ctx.jumpTarget?.field === 'billet') ? '1px solid rgba(96,165,250,0.5)' : billetPending ? '1px solid rgba(245,158,11,0.3)' : undefined, minWidth: 58 }}
                                            title='Click to edit'
                                        >
                                            {editingCell?.rowId === r.id && editingCell.field === 'billet' ? (
                                                <input
                                                    autoFocus
                                                    defaultValue={String(billetVal ?? '')}
                                                    onBlur={e => handleEndEdit(r.id, 'billet', 'Billet', r.name, e.target.value, r.billet)}
                                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
                                                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--amber)', fontSize: '0.7rem', width: '100%', textAlign: 'center', padding: 0 }}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : String(billetVal ?? '—')}
                                        </td>

                                        {/* Up To Date — editable toggle */}
                                        <td
                                            data-field='upToDate'
                                            onClick={() => {
                                                const current = upToDateVal as boolean | null
                                                const next = current === null ? true : !current
                                                handleEndEdit(r.id, 'upToDate', 'Up To Date', r.name, next ? 'ok' : 'no', r.upToDate)
                                            }}
                                            style={{ ...cellBase, background: upToDatePending ? 'rgba(245,158,11,0.05)' : bg, textAlign: 'center', cursor: 'pointer', border: (isJump && ctx.jumpTarget?.field === 'upToDate') ? '1px solid rgba(96,165,250,0.5)' : upToDatePending ? '1px solid rgba(245,158,11,0.3)' : undefined }}
                                            title='Click to toggle'
                                        >
                                            {upToDateVal === null
                                                ? <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.15)' }}>—</span>
                                                : <span style={{ fontSize: '0.58rem', fontWeight: 700, color: upToDateVal ? 'rgb(0,195,100)' : 'var(--red)' }}>{upToDateVal ? 'OK' : 'NO'}</span>
                                            }
                                        </td>

                                        {/* Last Update — editable */}
                                        <td
                                            data-field='lastUpdate'
                                            onClick={() => setEditingCell({ rowId: r.id, field: 'lastUpdate' })}
                                            style={{ ...cellBase, background: lastUpdPending ? 'rgba(245,158,11,0.05)' : bg, textAlign: 'center', fontSize: '0.58rem', color: 'rgba(245,158,11,0.5)', cursor: 'pointer', border: (isJump && ctx.jumpTarget?.field === 'lastUpdate') ? '1px solid rgba(96,165,250,0.5)' : lastUpdPending ? '1px solid rgba(245,158,11,0.3)' : undefined, minWidth: 74 }}
                                            title='Click to edit'
                                        >
                                            {editingCell?.rowId === r.id && editingCell.field === 'lastUpdate' ? (
                                                <input
                                                    autoFocus
                                                    defaultValue={String(lastUpdVal ?? '')}
                                                    onBlur={e => handleEndEdit(r.id, 'lastUpdate', 'Last Update', r.name, e.target.value, r.lastUpdate)}
                                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
                                                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--amber)', fontSize: '0.58rem', width: '100%', textAlign: 'center', padding: 0 }}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : String(lastUpdVal ?? '—')}
                                        </td>

                                        {/* Attendance */}
                                        {(['primaryNightOps','secondaryNightOps','primaryNightFTX','secondaryNightFTX','platoonTraining','sectionTraining','meetings','campaignMedals'] as const).map((field) => {
                                            const v = r[field] as number
                                            const isEditing = editingCell?.rowId === r.id && editingCell.field === field
                                            return (
                                                <td key={field} onClick={() => r.username && setEditingCell({ rowId: r.id, field })} style={{ ...cellBase, background: bg, cursor: r.username ? 'pointer' : 'default' }} title={r.username ? 'Click to edit' : undefined}>
                                                    {isEditing ? (
                                                        <input autoFocus type='number' defaultValue={v || 0} min={0} onBlur={e => handleMilpacEdit(r.id, r.username, field, e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', outline: 'none', color: '#ededed', fontSize: '0.72rem', fontWeight: 600, width: '100%', textAlign: 'center', padding: 0 }} />
                                                    ) : <Num v={v} />}
                                                </td>
                                            )
                                        })}

                                        {/* Dept actions */}
                                        {(['j1Interviews','j1InterviewBonus','j2MissionsRun','j3Bct12','j3OtherTrainings','j5ContentCreated','j5MilpacsGenerated','j5OfficialPR'] as const).map((field) => {
                                            const v = r[field] as number
                                            const isEditing = editingCell?.rowId === r.id && editingCell.field === field
                                            return (
                                                <td key={field} onClick={() => r.username && setEditingCell({ rowId: r.id, field })} style={{ ...cellBase, background: bg, cursor: r.username ? 'pointer' : 'default' }} title={r.username ? 'Click to edit' : undefined}>
                                                    {isEditing ? (
                                                        <input autoFocus type='number' defaultValue={v || 0} min={0} onBlur={e => handleMilpacEdit(r.id, r.username, field, e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} onClick={e => e.stopPropagation()} style={{ background: 'none', border: 'none', outline: 'none', color: '#ededed', fontSize: '0.72rem', fontWeight: 600, width: '100%', textAlign: 'center', padding: 0 }} />
                                                    ) : <Num v={v} />}
                                                </td>
                                            )
                                        })}

                                        {/* Certs */}
                                        {showCerts && ALL_CERTS.map(c => (
                                            <td key={c} style={{ ...cellBase, background: bg, padding: '6px 3px' }}><Tick has={r.certifications.includes(c)} /></td>
                                        ))}

                                        {/* Awards */}
                                        {showAwards && ALL_AWARDS.map(a => (
                                            <td key={a} style={{ ...cellBase, background: bg, padding: '6px 3px' }}><Tick has={r.awards.includes(a)} /></td>
                                        ))}

                                        {/* Delete */}
                                        <td style={{ ...cellBase, background: bg, width: 44, padding: '4px 6px', textAlign: 'center' }}>
                                            <button onClick={() => setDeleteTarget({ rowId: r.id, name: r.name })} title='Remove from billet' style={{ background: 'none', border: '1px solid rgba(219,0,29,0.18)', color: 'rgba(219,0,29,0.45)', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 7px', lineHeight: 1 }}>×</button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </SyncScrollTable>}

            <div style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.15)', letterSpacing: '0.1em', flexShrink: 0 }}>
                Identity, attendance, and dept action cells save directly when edited. Billet / Status / Last Update changes are staged — use Apply Changes to commit.
            </div>

            {/* Email popup */}
            {emailPopup && (
                <EmailPopup
                    memberId={emailPopup.row.id}
                    memberName={emailPopup.row.name}
                    currentEmail={emailPopup.row.currentEmail}
                    emailHistory={emailPopup.row.emailHistory}
                    onClose={() => setEmailPopup(null)}
                    onSaved={() => { setEmailPopup(null); load(search) }}
                />
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <ConfirmDialog
                    title='Remove from Billet'
                    message={<>Remove <strong>{deleteTarget.name}</strong> from the billet mastersheet? The member account is retained — this only hides them from this view. You can restore them via the Recycle Bin tab.</>}
                    confirmLabel='Remove'
                    dangerous
                    loading={deleting}
                    onConfirm={handleConfirmDeleteBillet}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {/* Personnel overlay */}
            {overlayUsername && (
                <PersonnelOverlay username={overlayUsername} onClose={() => setOverlayUsername(null)} />
            )}
        </div>
    )
}
