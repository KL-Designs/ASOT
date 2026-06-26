'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Refresh } from '@mui/icons-material'

type ImportedRecord = {
    _id: string
    date: string
    trainingTypeName: string
    traineeNames: string[]
    staffNames: string[]
    notes?: string
    ticketRef?: string
    importedByName: string
    importedAt: string
}

function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '2px solid rgba(219,0,29,0.4)',
    color: 'rgba(237,237,237,0.9)',
    fontSize: '0.82rem',
    padding: '8px 10px',
    outline: 'none',
}

const PAGE_SIZE = 50

export default function TrainingImportTab() {
    const [records, setRecords] = useState<ImportedRecord[]>([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<{ imported: number; skipped: number; skippedDetails?: { row: number; reason: string }[] } | null>(null)
    const [csvText, setCsvText] = useState('')
    const [showImport, setShowImport] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const loadRecords = useCallback(async () => {
        setLoading(true)
        const res = await fetch(`/api/training/import?limit=${PAGE_SIZE}&offset=${offset}`)
        if (res.ok) {
            const data = await res.json()
            setRecords(data.records)
            setTotal(data.total)
        }
        setLoading(false)
    }, [offset])

    useEffect(() => { loadRecords() }, [loadRecords])

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = ev => setCsvText(ev.target?.result as string ?? '')
        reader.readAsText(file)
    }

    async function handleImport() {
        if (!csvText.trim()) return
        setImporting(true)
        setResult(null)
        try {
            const res = await fetch('/api/training/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: csvText }),
            })
            const data = await res.json()
            setResult(data)
            if (data.imported > 0) {
                setCsvText('')
                setShowImport(false)
                setOffset(0)
                loadRecords()
            }
        } finally {
            setImporting(false)
        }
    }

    const cols = ['Date', 'Training Type', 'J3 Staff', 'Trainees', 'Ticket Ref', 'Imported By', 'Notes']
    const colWidths = '100px 1fr 1fr 1fr 100px 120px 1fr'

    return (
        <div style={{ padding: 'clamp(0.75rem, 2vw, 1.5rem)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace' }}>
                    // TRAINING IMPORT RECORDS
                </span>
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => setShowImport(s => !s)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: showImport ? 'rgba(219,0,29,0.25)' : 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.35)', color: 'rgba(237,237,237,0.8)', padding: '6px 12px', cursor: 'pointer' }}
                >
                    <Upload sx={{ fontSize: '0.85rem' }} /> Import CSV
                </button>
                <button
                    onClick={loadRecords}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', padding: '6px 10px', cursor: 'pointer' }}
                >
                    <Refresh sx={{ fontSize: '0.8rem' }} />
                </button>
                <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)' }}>{total} records</span>
            </div>

            {/* Import panel */}
            {showImport && (
                <div style={{ border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid rgba(219,0,29,0.6)', padding: 20, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>Import CSV</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.6 }}>
                        Expected columns: <code style={{ fontFamily: 'monospace', color: 'rgba(237,237,237,0.5)' }}>F, Date, Trainees, J3 Staff, Training Run, Notes, Ticket #</code>
                        <br />Dates should be in DD/MM/YYYY format. Multiple trainees or staff in one cell should be comma- or semicolon-separated.
                    </div>

                    {/* File picker */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                            ref={fileRef}
                            type='file'
                            accept='.csv,text/csv'
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                        <button
                            onClick={() => fileRef.current?.click()}
                            style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.65)', padding: '6px 12px', cursor: 'pointer' }}
                        >
                            Choose File
                        </button>
                        {csvText && (
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                                {csvText.split('\n').filter(Boolean).length - 1} data row(s) loaded
                            </span>
                        )}
                    </div>

                    {/* Paste area */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                            Or paste CSV text directly
                        </label>
                        <textarea
                            value={csvText}
                            onChange={e => setCsvText(e.target.value)}
                            rows={6}
                            placeholder={'F,Date,Trainees,J3 Staff,Training Run,Notes,Ticket #\n1,01/06/2025,\"Pvt Smith, Pvt Jones\",Sgt Davis,BCT 1,,T-001'}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.72rem' }}
                        />
                    </div>

                    {/* Result */}
                    {result && (
                        <div style={{ padding: '10px 14px', background: result.imported > 0 ? 'rgba(80,200,120,0.08)' : 'rgba(219,0,29,0.08)', border: `1px solid ${result.imported > 0 ? 'rgba(80,200,120,0.25)' : 'rgba(219,0,29,0.25)'}` }}>
                            <div style={{ fontSize: '0.72rem', color: result.imported > 0 ? 'rgba(80,200,120,0.9)' : 'rgba(219,0,29,0.8)', fontWeight: 700 }}>
                                {result.imported} row{result.imported !== 1 ? 's' : ''} imported
                                {result.skipped > 0 && `, ${result.skipped} skipped`}
                            </div>
                            {result.skippedDetails?.map(s => (
                                <div key={s.row} style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                                    Row {s.row}: {s.reason}
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            disabled={importing || !csvText.trim()}
                            onClick={handleImport}
                            style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.25)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)', padding: '7px 18px', cursor: importing || !csvText.trim() ? 'not-allowed' : 'pointer', opacity: !csvText.trim() ? 0.5 : 1 }}
                        >
                            {importing ? 'Importing…' : 'Run Import'}
                        </button>
                        <button
                            onClick={() => { setShowImport(false); setResult(null); setCsvText('') }}
                            style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', padding: '7px 14px', cursor: 'pointer' }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Records table */}
            <div style={{ border: '1px solid rgba(219,0,29,0.18)', overflowX: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: colWidths, padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(219,0,29,0.15)', minWidth: 900 }}>
                    {cols.map(c => (
                        <span key={c} style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace' }}>{c}</span>
                    ))}
                </div>

                {loading ? (
                    <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                ) : records.length === 0 ? (
                    <div style={{ padding: '48px 0', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.18)' }}>
                        No import records yet
                    </div>
                ) : (
                    records.map((r, i) => (
                        <div key={r._id} style={{
                            display: 'grid',
                            gridTemplateColumns: colWidths,
                            padding: '7px 10px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                            alignItems: 'start',
                            minWidth: 900,
                            gap: 4,
                        }}>
                            <span style={{ fontSize: '0.63rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>{fmt(r.date)}</span>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.8)', fontWeight: 600 }}>{r.trainingTypeName}</span>
                            <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)' }}>{r.staffNames.join(', ') || '—'}</span>
                            <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.45)' }}>{r.traineeNames.join(', ') || '—'}</span>
                            <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace' }}>{r.ticketRef || '—'}</span>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)' }}>{r.importedByName}</span>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', lineHeight: 1.5 }}>{r.notes || '—'}</span>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                    <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '5px 14px', cursor: offset === 0 ? 'not-allowed' : 'pointer', opacity: offset === 0 ? 0.4 : 1 }}>
                        ← Prev
                    </button>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)' }}>
                        {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                    </span>
                    <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}
                        style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '5px 14px', cursor: offset + PAGE_SIZE >= total ? 'not-allowed' : 'pointer', opacity: offset + PAGE_SIZE >= total ? 0.4 : 1 }}>
                        Next →
                    </button>
                </div>
            )}
        </div>
    )
}
