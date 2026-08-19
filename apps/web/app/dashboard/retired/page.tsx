'use client'

import { useState, useRef } from 'react'
import { Alert, CircularProgress } from '@mui/material'
import { CheckCircle, Upload, TableRows } from '@mui/icons-material'

interface SkippedRow {
    row: number
    callsign: string
    reason: string
}

interface ImportResult {
    ok: boolean
    inserted: number
    updated: number
    skipped: number
    skippedRows: SkippedRow[]
    total: number
    error?: string
}

export default function RetiredMembersImportPage() {
    const [csvText, setCsvText]     = useState('')
    const [result, setResult]       = useState<ImportResult | null>(null)
    const [loading, setLoading]     = useState(false)
    const [error, setError]         = useState<string | null>(null)
    const [fileName, setFileName]   = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    // Fix/patch panel state
    const [patchJson, setPatchJson]     = useState('')
    const [patchLoading, setPatchLoading] = useState(false)
    const [patchResult, setPatchResult]   = useState<{ patched: number; errors?: string[] } | null>(null)
    const [patchError, setPatchError]     = useState<string | null>(null)

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setFileName(file.name)
        const reader = new FileReader()
        reader.onload = ev => {
            setCsvText((ev.target?.result as string) ?? '')
            setResult(null)
            setError(null)
        }
        reader.readAsText(file, 'utf-8')
    }

    async function handlePatch() {
        if (!patchJson.trim()) { setPatchError('Paste the JSON patch array first.'); return }
        let parsed: unknown
        try { parsed = JSON.parse(patchJson) } catch { setPatchError('Invalid JSON — check syntax.'); return }
        if (!Array.isArray(parsed)) { setPatchError('Must be a JSON array [ ... ].'); return }
        setPatchLoading(true); setPatchResult(null); setPatchError(null)
        try {
            const res = await fetch('/api/admin/retired/import', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: patchJson,
            })
            const data = await res.json()
            if (!res.ok || !data.ok) setPatchError(data.error ?? 'Patch failed.')
            else { setPatchResult(data); setPatchJson('') }
        } catch {
            setPatchError('Network error.')
        } finally {
            setPatchLoading(false)
        }
    }

    async function handleImport() {
        if (!csvText.trim()) { setError('No CSV data. Upload a file or paste CSV text.'); return }
        setLoading(true)
        setResult(null)
        setError(null)
        try {
            const res = await fetch('/api/admin/retired/import', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: csvText,
            })
            const data: ImportResult = await res.json()
            if (!res.ok || !data.ok) {
                setError(data.error ?? 'Import failed.')
            } else {
                setResult(data)
                setCsvText('')
                setFileName(null)
            }
        } catch {
            setError('Network error — check your connection and try again.')
        } finally {
            setLoading(false)
        }
    }

    const labelSx: React.CSSProperties = {
        fontSize: '0.58rem', fontWeight: 700, letterSpacing: 3,
        textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 8, display: 'block',
    }

    const cardSx: React.CSSProperties = {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--line-2)',
        padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 8,
    }

    return (
        <div style={{ padding: '32px 28px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header */}
            <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Retired Members Import
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.6 }}>
                    Import discharge history from the HQ leaving history spreadsheet. The importer reads columns A–J (Ticket, Name, Steam ID, Discord ID, Date, Grace, Type, Return, Authorised By, Reason). Only GD and HD records are shown on the public wall — DD records are stored internally.
                </div>
            </div>

            {/* CSV column reference */}
            <div style={cardSx}>
                <span style={labelSx}>Column Reference</span>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 140px 1fr', gap: '4px 12px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)' }}>
                    {[
                        ['A', 'Ticket No.',    'Discharge ticket number (blank for early records)'],
                        ['B', 'Name',          'Member callsign — required, rows without are skipped'],
                        ['C', 'Steam ID',      'Steam ID or profile URL'],
                        ['D', 'Discord ID',    'Discord user ID (scientific notation handled)'],
                        ['E', 'Date',          'Leaving date — multiple formats supported'],
                        ['F', 'Grace',         'Grace period status (stored, not displayed)'],
                        ['G', 'Type',          'DD / GD / HD — controls visibility on wall'],
                        ['H', 'Return',        'YES / NO / REVIEW — stored for future recruitment checks'],
                        ['I', 'Auth By',       'Who authorised the discharge'],
                        ['J', 'Reason',        'Internal notes (J4-only, not shown publicly)'],
                    ].map(([col, name, desc]) => (
                        <>
                            <span key={col + 'c'} style={{ color: 'var(--red)', fontWeight: 700, fontFamily: 'monospace' }}>{col}</span>
                            <span key={col + 'n'} style={{ color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{name}</span>
                            <span key={col + 'd'}>{desc}</span>
                        </>
                    ))}
                </div>
            </div>

            {/* Upload area */}
            <div style={cardSx}>
                <span style={labelSx}>Step 1 — Select CSV File</span>
                <input
                    ref={fileRef}
                    type='file'
                    accept='.csv,text/csv,text/plain'
                    onChange={handleFile}
                    style={{ display: 'none' }}
                />
                <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                        alignSelf: 'flex-start',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 18px', cursor: 'pointer',
                        background: 'rgba(219,0,29,0.08)',
                        border: '1px solid rgba(219,0,29,0.35)',
                        color: 'rgba(237,237,237,0.75)',
                        fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}
                >
                    <Upload style={{ fontSize: 16 }} />
                    {fileName ? fileName : 'Choose file…'}
                </button>
                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.28)', marginTop: 2 }}>
                    "HQ Sheet - ASOT Leaving History.csv" — accepts any .csv or .txt file
                </div>
            </div>

            {/* Paste fallback */}
            <div style={cardSx}>
                <span style={labelSx}>Step 1 (alternative) — Paste CSV Text</span>
                <textarea
                    value={csvText}
                    onChange={e => { setCsvText(e.target.value); setResult(null); setError(null); setFileName(null) }}
                    placeholder={'Discharge Ticket,NAME,STEAM ID,DISCORD ID,LEAVING/REMOVAL DATE,...\n,Brock,...'}
                    rows={6}
                    style={{
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--line-2)',
                        color: 'rgba(237,237,237,0.7)',
                        fontFamily: 'monospace', fontSize: '0.7rem',
                        padding: 10, resize: 'vertical', width: '100%',
                        outline: 'none',
                    }}
                />
            </div>

            {/* Preview row count */}
            {csvText.trim() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                    <TableRows style={{ fontSize: 15 }} />
                    {csvText.trim().split('\n').filter(l => l.trim()).length - 1} data rows detected
                    {fileName && <span style={{ color: 'rgba(219,0,29,0.6)' }}>from {fileName}</span>}
                </div>
            )}

            {/* Import button */}
            <button
                onClick={handleImport}
                disabled={loading || !csvText.trim()}
                style={{
                    alignSelf: 'flex-start',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 24px', cursor: loading || !csvText.trim() ? 'not-allowed' : 'pointer',
                    background: loading || !csvText.trim() ? 'rgba(219,0,29,0.25)' : 'var(--red)',
                    border: 'none', color: loading || !csvText.trim() ? 'rgba(237,237,237,0.35)' : '#fff',
                    fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    transition: 'background 0.15s',
                }}
            >
                {loading
                    ? <><CircularProgress size={14} color='inherit' /> Importing…</>
                    : 'Run Import'
                }
            </button>

            {/* Result */}
            {result && (
                <div style={{
                    padding: '16px 18px',
                    background: 'rgba(0,195,100,0.06)',
                    border: '1px solid rgba(0,195,100,0.25)',
                    borderLeft: '3px solid #00c364',
                    display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: '#00c364' }}>
                        <CheckCircle style={{ fontSize: 18 }} />
                        Import complete
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '6px 24px', fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)', width: 'fit-content' }}>
                        <span style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase' }}>Rows processed</span>
                        <span style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase' }}>Inserted</span>
                        <span style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase' }}>Updated</span>
                        <span style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase' }}>Skipped</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>{result.total}</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#00c364' }}>{result.inserted}</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#f59e0b' }}>{result.updated}</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'rgba(237,237,237,0.35)' }}>{result.skipped}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>
                        Re-importing is safe — existing records are updated rather than duplicated. Visit <a href='/community/retired' target='_blank' style={{ color: 'var(--red)' }}>/community/retired</a> to see the wall.
                    </div>

                    {/* Skipped rows breakdown */}
                    {result.skippedRows?.length > 0 && (
                        <details style={{ marginTop: 6 }}>
                            <summary style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', userSelect: 'none' }}>
                                {result.skipped} skipped rows — click to expand
                            </summary>
                            <div style={{ marginTop: 10, overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', color: 'rgba(237,237,237,0.55)' }}>
                                    <thead>
                                        <tr>
                                            {['Row', 'Name / Callsign', 'Reason'].map(h => (
                                                <th key={h} style={{ textAlign: 'left', padding: '4px 10px', fontSize: '0.58rem', letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.skippedRows.map((s, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '4px 10px', fontFamily: 'monospace', color: 'rgba(237,237,237,0.3)' }}>{s.row}</td>
                                                <td style={{ padding: '4px 10px', color: 'rgba(237,237,237,0.65)' }}>{s.callsign}</td>
                                                <td style={{ padding: '4px 10px', color: 'rgba(237,237,237,0.4)' }}>{s.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    )}
                </div>
            )}

            {error && (
                <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{error}</Alert>
            )}

            {/* ── Fix / patch individual records ── */}
            <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                    <span style={labelSx}>Fix Individual Records</span>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
                        Paste a JSON array of patch operations. Two operation types:<br />
                        <code style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.7)' }}>{`{"find": {"callsign": "Old Name"}, "set": {"callsign": "New Name", "steamId": "..."}}`}</code> — update existing record<br />
                        <code style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.7)' }}>{`{"upsert": {"callsign": "Name", "dischargeDate": "2023-11-11", "dischargeType": "GD", ...}}`}</code> — insert or update
                    </div>
                </div>
                <textarea
                    value={patchJson}
                    onChange={e => { setPatchJson(e.target.value); setPatchResult(null); setPatchError(null) }}
                    placeholder={'[\n  {"find": {"callsign": "Old Name"}, "set": {"callsign": "New Name", "steamId": "76561198..."}},\n  {"upsert": {"callsign": "Cosmo", "dischargeDate": "2023-11-11", "dischargeType": "GD", ...}}\n]'}
                    rows={10}
                    style={{
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--line-2)',
                        color: 'rgba(237,237,237,0.7)',
                        fontFamily: 'monospace', fontSize: '0.7rem',
                        padding: 10, resize: 'vertical', width: '100%', outline: 'none',
                    }}
                />
                <button
                    onClick={handlePatch}
                    disabled={patchLoading || !patchJson.trim()}
                    style={{
                        alignSelf: 'flex-start',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 22px', cursor: patchLoading || !patchJson.trim() ? 'not-allowed' : 'pointer',
                        background: patchLoading || !patchJson.trim() ? 'rgba(219,0,29,0.25)' : 'var(--red)',
                        border: 'none', color: patchLoading || !patchJson.trim() ? 'rgba(237,237,237,0.35)' : '#fff',
                        fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}
                >
                    {patchLoading ? <><CircularProgress size={13} color='inherit' /> Applying…</> : 'Apply Fixes'}
                </button>
                {patchResult && (
                    <div style={{ padding: '12px 16px', background: 'rgba(0,195,100,0.06)', border: '1px solid rgba(0,195,100,0.25)', borderLeft: '3px solid #00c364', fontSize: '0.78rem', color: '#00c364', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle style={{ fontSize: 16 }} /> {patchResult.patched} record{patchResult.patched !== 1 ? 's' : ''} patched successfully</div>
                        {patchResult.errors?.map((e, i) => <div key={i} style={{ color: '#ef4444', fontSize: '0.72rem' }}>{e}</div>)}
                    </div>
                )}
                {patchError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.75rem' }}>{patchError}</Alert>}
            </div>
        </div>
    )
}
