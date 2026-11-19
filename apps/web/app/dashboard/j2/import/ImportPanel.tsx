'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    Lock, Visibility, Warning, CheckCircle, Cancel,
    CloudUpload, Search, Close, ExpandMore,
} from '@mui/icons-material'

// ── Shared style tokens ────────────────────────────────────────────────────────

const RED = '#db001d'
const BG = '#080808'
const CARD_BG = 'rgba(255,255,255,0.03)'
const BORDER = '1px solid rgba(255,255,255,0.08)'
const BORDER_RED = `1px solid rgba(219,0,29,0.3)`
const TXT = 'rgba(237,237,237,0.85)'
const TXT_MUTED = 'rgba(237,237,237,0.42)'
const TXT_DIM = 'rgba(237,237,237,0.28)'
const FONT_HEAD = "'Oswald', Arial, sans-serif"
const FONT_BODY = 'Arial, sans-serif'

// ── Type helpers (UI-only) ─────────────────────────────────────────────────────

interface ParseResponse {
    importId: string
    preview: ImportPreviewSnapshot
}

interface CommitResponse {
    operationId: string
}

interface BatchStartResponse {
    batchId: string
}

interface BatchPollResponse {
    batch: OperationImportBatch
    imports: OperationImport[]
}

interface MatchResponse {
    matches: ImportCampaignMatch[]
}

type ImportMode = 'single' | 'bulk'
type SingleStep = 'upload' | 'processing' | 'review' | 'done'
type BulkStep = 'upload' | 'processing' | 'complete'

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
    const pct = Math.round(value * 100)
    const color = pct >= 80 ? '#1ec860' : pct >= 50 ? '#d4a000' : RED
    return (
        <span style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
            color, border: `1px solid ${color}40`, padding: '1px 6px',
            background: `${color}18`, whiteSpace: 'nowrap',
        }}>
            {pct}%
        </span>
    )
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100)
    const color = pct >= 80 ? '#1ec860' : pct >= 50 ? '#d4a000' : RED
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
                flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden',
            }}>
                <div style={{
                    width: `${pct}%`, height: '100%',
                    background: `linear-gradient(90deg, ${color}99, ${color})`,
                    borderRadius: 2,
                }} />
            </div>
            <span style={{ fontSize: '0.62rem', color, fontFamily: 'monospace', flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
                {pct}%
            </span>
        </div>
    )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OperationImportStatus }) {
    const map: Record<OperationImportStatus, { color: string; label: string }> = {
        imported:     { color: '#1ec860', label: 'Imported' },
        needs_review: { color: '#d4a000', label: 'Needs Review' },
        failed:       { color: RED,       label: 'Failed' },
        processing:   { color: 'rgba(237,237,237,0.55)', label: 'Processing' },
        skipped:      { color: TXT_MUTED, label: 'Skipped' },
        duplicate:    { color: 'rgba(100,150,237,0.8)', label: 'Duplicate' },
    }
    const { color, label } = map[status] ?? { color: TXT_MUTED, label: status }
    return (
        <span style={{
            fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
            color, border: `1px solid ${color}40`, padding: '2px 7px', background: `${color}18`, whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    )
}

// ── Section label map ─────────────────────────────────────────────────────────

const SMEAC_LABELS: Record<ImportSectionDetection['smeacLabel'], string> = {
    situation:   'Situation',
    mission:     'Mission',
    execution:   'Execution',
    admin_log:   'Admin & Log',
    command_sig: 'Command & Sig',
    other:       'Other',
}

// ── Shared card wrapper ───────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            background: CARD_BG,
            border: BORDER,
            borderTop: `3px solid ${RED}`,
            padding: '18px 20px',
            ...style,
        }}>
            {children}
        </div>
    )
}

function CardHeading({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: RED, fontFamily: FONT_HEAD, marginBottom: 14,
        }}>
            {children}
        </div>
    )
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: TXT_MUTED, marginBottom: 5, fontFamily: FONT_HEAD,
        }}>
            {children}
        </div>
    )
}

// ── Text input ────────────────────────────────────────────────────────────────

function StyledInput({
    value, onChange, placeholder, style,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    style?: React.CSSProperties
}) {
    return (
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
                background: 'rgba(255,255,255,0.05)',
                border: BORDER,
                color: TXT,
                padding: '8px 12px',
                fontSize: '0.82rem',
                fontFamily: FONT_BODY,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                ...style,
            }}
        />
    )
}

// ── Button ────────────────────────────────────────────────────────────────────

function Btn({
    children, onClick, disabled, variant = 'primary', style,
}: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    variant?: 'primary' | 'danger' | 'outline' | 'ghost'
    style?: React.CSSProperties
}) {
    const base: React.CSSProperties = {
        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        padding: '9px 20px', cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
        fontFamily: FONT_HEAD, opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 6,
    }
    const variants: Record<string, React.CSSProperties> = {
        primary: { background: 'rgba(0,180,80,0.9)', color: '#fff' },
        danger:  { background: 'rgba(219,0,29,0.85)', color: '#fff' },
        outline: { background: 'transparent', border: `1px solid rgba(219,0,29,0.45)`, color: RED },
        ghost:   { background: 'rgba(255,255,255,0.06)', border: BORDER, color: TXT },
    }
    return (
        <button disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
            {children}
        </button>
    )
}

// ── Campaign search modal ─────────────────────────────────────────────────────

function CampaignSearchModal({
    onSelect,
    onClose,
}: {
    onSelect: (match: ImportCampaignMatch) => void
    onClose: () => void
}) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ImportCampaignMatch[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!query.trim()) { setResults([]); return }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            setLoading(true)
            setError(null)
            try {
                const res = await fetch('/api/operations/import/match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query }),
                })
                const data: MatchResponse = await res.json()
                if (!res.ok) { setError('Search failed'); return }
                setResults(data.matches ?? [])
            } catch {
                setError('Search failed')
            } finally {
                setLoading(false)
            }
        }, 300)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [query])

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300,
        }}>
            <div style={{
                background: '#0e0e0e', border: BORDER_RED, width: 520, maxHeight: '70vh',
                display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderBottom: BORDER,
                }}>
                    <span style={{
                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: RED, fontFamily: FONT_HEAD,
                    }}>
                        Search Campaign / Mission
                    </span>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: TXT_MUTED, padding: 2, display: 'flex',
                    }}>
                        <Close sx={{ fontSize: '1rem' }} />
                    </button>
                </div>

                {/* Search input */}
                <div style={{ padding: '12px 18px', borderBottom: BORDER }}>
                    <div style={{ position: 'relative' }}>
                        <Search sx={{ fontSize: '0.9rem', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TXT_MUTED }} />
                        <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Type campaign or mission name..."
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: 'rgba(255,255,255,0.05)', border: BORDER,
                                color: TXT, padding: '8px 12px 8px 32px',
                                fontSize: '0.82rem', fontFamily: FONT_BODY, outline: 'none',
                            }}
                        />
                    </div>
                </div>

                {/* Results */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                    {error && (
                        <div style={{ padding: '10px 18px', color: RED, fontSize: '0.78rem' }}>{error}</div>
                    )}
                    {loading && (
                        <div style={{ padding: '10px 18px', color: TXT_MUTED, fontSize: '0.78rem' }}>Searching...</div>
                    )}
                    {!loading && !error && results.length === 0 && query.trim() && (
                        <div style={{ padding: '10px 18px', color: TXT_MUTED, fontSize: '0.78rem' }}>No matches found.</div>
                    )}
                    {results.map((m, i) => (
                        <button
                            key={i}
                            onClick={() => onSelect(m)}
                            style={{
                                width: '100%', background: 'none', border: 'none',
                                borderBottom: BORDER, padding: '10px 18px',
                                cursor: 'pointer', textAlign: 'left',
                                display: 'flex', flexDirection: 'column', gap: 4,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ color: TXT, fontSize: '0.82rem', fontFamily: FONT_BODY }}>
                                    {m.campaignName}
                                    {m.missionName && (
                                        <span style={{ color: TXT_MUTED, marginLeft: 8 }}>→ {m.missionName}</span>
                                    )}
                                </span>
                                <ConfidenceBadge value={m.confidence} />
                            </div>
                            {m.reason && (
                                <span style={{ fontSize: '0.68rem', color: TXT_DIM }}>{m.reason}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Review form ───────────────────────────────────────────────────────────────

function ReviewForm({
    importId,
    preview,
    onCommitted,
    onCancel,
}: {
    importId: string
    preview: ImportPreviewSnapshot
    onCommitted: (operationId: string) => void
    onCancel: () => void
}) {
    const [title, setTitle] = useState(preview.detectedTitle ?? '')
    const [selectedMatch, setSelectedMatch] = useState<ImportCampaignMatch | null>(
        preview.campaignMatches?.[0] ?? null
    )
    const [daySlot, setDaySlot] = useState<'saturday' | 'sunday' | null>(null)
    const [showCampaignSearch, setShowCampaignSearch] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const topMatchLowConfidence = selectedMatch && selectedMatch.confidence < 0.5

    async function handleCommit() {
        if (!title.trim()) { setSubmitError('Title is required'); return }
        setSubmitting(true)
        setSubmitError(null)
        try {
            const res = await fetch('/api/operations/import/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    importId,
                    operationTitle: title.trim(),
                    campaignId: selectedMatch?.campaignId ?? null,
                    campaignMissionId: selectedMatch?.missionId ?? null,
                    daySlot,
                    sections: preview.proposedSections,
                }),
            })
            const data: CommitResponse & { error?: string } = await res.json()
            if (!res.ok) { setSubmitError(data.error ?? 'Commit failed'); return }
            onCommitted(data.operationId)
        } catch {
            setSubmitError('Network error — please try again')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Detected Information */}
            <Card>
                <CardHeading>Detected Information</CardHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <FieldLabel>Title</FieldLabel>
                        <StyledInput value={title} onChange={setTitle} placeholder="Operation title..." />
                    </div>
                    {preview.detectedDate && (
                        <div>
                            <FieldLabel>Detected Date</FieldLabel>
                            <div style={{ color: TXT, fontSize: '0.82rem', fontFamily: FONT_BODY }}>
                                {preview.detectedDate}
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* Sections */}
            <Card>
                <CardHeading>Detected Sections</CardHeading>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT_BODY }}>
                        <thead>
                            <tr style={{ borderBottom: BORDER }}>
                                {['Section Title', 'SMEAC Label', 'Confidence', 'Visibility'].map(h => (
                                    <th key={h} style={{
                                        textAlign: 'left', padding: '6px 10px',
                                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em',
                                        textTransform: 'uppercase', color: TXT_MUTED, fontFamily: FONT_HEAD,
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {preview.sections.map((s, i) => (
                                <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                                    <td style={{ padding: '8px 10px', color: TXT }}>{s.detectedTitle}</td>
                                    <td style={{ padding: '8px 10px', color: TXT_MUTED }}>
                                        {SMEAC_LABELS[s.smeacLabel]}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <ConfidenceBadge value={s.confidence} />
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {s.isPublic ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1ec860', fontSize: '0.72rem' }}>
                                                <Visibility sx={{ fontSize: '0.85rem' }} /> Public
                                            </span>
                                        ) : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: TXT_MUTED, fontSize: '0.72rem' }}>
                                                <Lock sx={{ fontSize: '0.85rem' }} /> Members Only
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Campaign & Mission */}
            <Card>
                <CardHeading>Campaign &amp; Mission</CardHeading>

                {topMatchLowConfidence && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'rgba(212,160,0,0.12)', border: '1px solid rgba(212,160,0,0.35)',
                        padding: '8px 12px', marginBottom: 14,
                    }}>
                        <Warning sx={{ fontSize: '0.9rem', color: '#d4a000' }} />
                        <span style={{ fontSize: '0.72rem', color: '#d4a000' }}>
                            Low confidence match — please verify the campaign selection below
                        </span>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {/* Unassigned option */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        border: selectedMatch === null ? BORDER_RED : BORDER,
                        background: selectedMatch === null ? 'rgba(219,0,29,0.07)' : 'transparent',
                        cursor: 'pointer',
                    }}>
                        <input
                            type='radio'
                            name='campaign'
                            checked={selectedMatch === null}
                            onChange={() => setSelectedMatch(null)}
                            style={{ accentColor: RED }}
                        />
                        <span style={{ color: TXT_MUTED, fontSize: '0.78rem', fontFamily: FONT_BODY }}>
                            Leave Unassigned
                        </span>
                    </label>

                    {/* Top 3 matches */}
                    {(preview.campaignMatches ?? []).slice(0, 3).map((m, i) => (
                        <label key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                            border: selectedMatch?.campaignId === m.campaignId && selectedMatch?.missionId === m.missionId
                                ? BORDER_RED : BORDER,
                            background: selectedMatch?.campaignId === m.campaignId && selectedMatch?.missionId === m.missionId
                                ? 'rgba(219,0,29,0.07)' : 'transparent',
                            cursor: 'pointer',
                        }}>
                            <input
                                type='radio'
                                name='campaign'
                                checked={selectedMatch?.campaignId === m.campaignId && selectedMatch?.missionId === m.missionId}
                                onChange={() => setSelectedMatch(m)}
                                style={{ accentColor: RED, marginTop: 3, flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                    <span style={{ color: TXT, fontSize: '0.82rem', fontFamily: FONT_BODY }}>
                                        {m.campaignName}
                                        {m.missionName && (
                                            <span style={{ color: TXT_MUTED, marginLeft: 8 }}>→ {m.missionName}</span>
                                        )}
                                    </span>
                                    <ConfidenceBadge value={m.confidence} />
                                </div>
                                <ConfidenceBar value={m.confidence} />
                                {m.reason && (
                                    <div style={{ marginTop: 4, fontSize: '0.68rem', color: TXT_DIM }}>{m.reason}</div>
                                )}
                            </div>
                        </label>
                    ))}
                </div>

                <button
                    onClick={() => setShowCampaignSearch(true)}
                    style={{
                        background: 'none', border: `1px dashed rgba(255,255,255,0.18)`,
                        color: TXT_MUTED, padding: '8px 14px', cursor: 'pointer', fontSize: '0.72rem',
                        fontFamily: FONT_BODY, display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                >
                    <Search sx={{ fontSize: '0.85rem' }} />
                    Choose different campaign / mission
                </button>
            </Card>

            {/* Images */}
            <Card>
                <CardHeading>Images</CardHeading>
                {preview.images.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle sx={{ fontSize: '0.9rem', color: '#1ec860' }} />
                        <span style={{ color: TXT, fontSize: '0.82rem', fontFamily: FONT_BODY }}>
                            {preview.images.length} image{preview.images.length !== 1 ? 's' : ''} extracted and ready to import
                        </span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <Warning sx={{ fontSize: '0.9rem', color: '#d4a000', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ color: '#d4a000', fontSize: '0.78rem', fontFamily: FONT_BODY }}>
                            No images were extracted from this document. If this was a PDF,
                            images may need to be added manually after import.
                        </span>
                    </div>
                )}
            </Card>

            {/* Warnings */}
            {preview.warnings?.length > 0 && (
                <div style={{
                    background: 'rgba(212,160,0,0.08)', border: '1px solid rgba(212,160,0,0.3)',
                    padding: '14px 18px',
                }}>
                    <div style={{
                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em',
                        textTransform: 'uppercase', color: '#d4a000', marginBottom: 10, fontFamily: FONT_HEAD,
                    }}>
                        Warnings
                    </div>
                    <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {preview.warnings.map((w, i) => (
                            <li key={i} style={{ color: '#d4a000', fontSize: '0.78rem', fontFamily: FONT_BODY }}>{w}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Visibility summary */}
            <Card>
                <CardHeading>Visibility Summary</CardHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {preview.sections.map((s, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '6px 0', borderBottom: `1px solid rgba(255,255,255,0.04)`,
                        }}>
                            <span style={{ color: TXT, fontSize: '0.78rem', fontFamily: FONT_BODY }}>{s.detectedTitle}</span>
                            {s.isPublic ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1ec860', fontSize: '0.72rem' }}>
                                    <Visibility sx={{ fontSize: '0.8rem' }} /> Public
                                </span>
                            ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: TXT_MUTED, fontSize: '0.72rem' }}>
                                    <Lock sx={{ fontSize: '0.8rem' }} /> Members Only
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </Card>

            {/* Day slot */}
            <Card>
                <CardHeading>Day Slot</CardHeading>
                <div style={{ display: 'flex', gap: 10 }}>
                    {(['saturday', 'sunday', null] as const).map(opt => (
                        <label key={String(opt)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                            padding: '8px 14px',
                            border: daySlot === opt ? BORDER_RED : BORDER,
                            background: daySlot === opt ? 'rgba(219,0,29,0.07)' : 'transparent',
                        }}>
                            <input
                                type='radio'
                                name='daySlot'
                                checked={daySlot === opt}
                                onChange={() => setDaySlot(opt)}
                                style={{ accentColor: RED }}
                            />
                            <span style={{ color: TXT, fontSize: '0.78rem', fontFamily: FONT_BODY, textTransform: 'capitalize' }}>
                                {opt ?? 'Neither'}
                            </span>
                        </label>
                    ))}
                </div>
            </Card>

            {/* Error */}
            {submitError && (
                <div style={{
                    background: 'rgba(219,0,29,0.1)', border: `1px solid rgba(219,0,29,0.4)`,
                    padding: '10px 14px', color: RED, fontSize: '0.78rem', fontFamily: FONT_BODY,
                }}>
                    {submitError}
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
                <Btn onClick={handleCommit} disabled={submitting} variant='primary'>
                    {submitting ? 'Importing...' : 'Import'}
                </Btn>
                <Btn onClick={onCancel} variant='outline'>Cancel</Btn>
            </div>

            {showCampaignSearch && (
                <CampaignSearchModal
                    onSelect={m => { setSelectedMatch(m); setShowCampaignSearch(false) }}
                    onClose={() => setShowCampaignSearch(false)}
                />
            )}
        </div>
    )
}

// ── Single file import ────────────────────────────────────────────────────────

function SingleImport() {
    const [step, setStep] = useState<SingleStep>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [importId, setImportId] = useState<string | null>(null)
    const [preview, setPreview] = useState<ImportPreviewSnapshot | null>(null)
    const [doneOpId, setDoneOpId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    async function handleStart() {
        if (!file) return
        setError(null)
        setStep('processing')

        const form = new FormData()
        form.append('file', file)
        form.append('filename', file.name)

        try {
            const res = await fetch('/api/operations/import/parse', { method: 'POST', body: form })
            const data: ParseResponse & { error?: string } = await res.json()

            if (!res.ok) {
                setError(data.error ?? 'Parse failed')
                setStep('upload')
                return
            }

            setImportId(data.importId)
            setPreview(data.preview)
            setStep('review')
        } catch {
            setError('Network error — please try again')
            setStep('upload')
        }
    }

    function handleReset() {
        setStep('upload')
        setFile(null)
        setImportId(null)
        setPreview(null)
        setDoneOpId(null)
        setError(null)
    }

    return (
        <div>
            {/* Upload step */}
            {step === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {error && (
                        <div style={{
                            background: 'rgba(219,0,29,0.1)', border: `1px solid rgba(219,0,29,0.4)`,
                            padding: '10px 14px', color: RED, fontSize: '0.78rem', fontFamily: FONT_BODY,
                        }}>
                            {error}
                        </div>
                    )}
                    <div style={{
                        border: `2px dashed rgba(255,255,255,0.14)`,
                        padding: '32px 24px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                        background: 'rgba(255,255,255,0.02)',
                    }}>
                        <CloudUpload sx={{ fontSize: '2rem', color: TXT_MUTED }} />
                        <div style={{ color: TXT_MUTED, fontSize: '0.78rem', fontFamily: FONT_BODY, textAlign: 'center' }}>
                            Select a <strong style={{ color: TXT }}>.docx</strong> or <strong style={{ color: TXT }}>.pdf</strong> file to import
                        </div>
                        {file && (
                            <div style={{
                                color: TXT, fontSize: '0.78rem', fontFamily: 'monospace',
                                background: 'rgba(255,255,255,0.06)', padding: '5px 12px', border: BORDER,
                            }}>
                                {file.name}
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='.pdf,.docx'
                            style={{ display: 'none' }}
                            onChange={e => setFile(e.target.files?.[0] ?? null)}
                        />
                        <Btn onClick={() => fileInputRef.current?.click()} variant='ghost'>
                            Select File
                        </Btn>
                    </div>
                    <div>
                        <Btn onClick={handleStart} disabled={!file} variant='primary'>
                            Start Import
                        </Btn>
                    </div>
                </div>
            )}

            {/* Processing */}
            {step === 'processing' && (
                <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                    <div style={{ position: 'relative', width: 48, height: 48 }}>
                        <div style={{
                            position: 'absolute', inset: 0, border: `3px solid rgba(219,0,29,0.2)`,
                            borderTopColor: RED, borderRadius: '50%',
                            animation: 'spin 0.9s linear infinite',
                        }} />
                    </div>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    <span style={{ color: TXT_MUTED, fontSize: '0.82rem', fontFamily: FONT_BODY, letterSpacing: '0.08em' }}>
                        Analysing document...
                    </span>
                </div>
            )}

            {/* Review */}
            {step === 'review' && importId && preview && (
                <ReviewForm
                    importId={importId}
                    preview={preview}
                    onCommitted={opId => { setDoneOpId(opId); setStep('done') }}
                    onCancel={handleReset}
                />
            )}

            {/* Done */}
            {step === 'done' && doneOpId && (
                <div style={{
                    background: 'rgba(0,180,80,0.08)', border: '1px solid rgba(0,180,80,0.35)',
                    padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle sx={{ fontSize: '1.1rem', color: '#1ec860' }} />
                        <span style={{
                            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em',
                            textTransform: 'uppercase', color: '#1ec860', fontFamily: FONT_HEAD,
                        }}>
                            Import Complete
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <a
                            href={`/operations/${doneOpId}`}
                            style={{
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
                                textTransform: 'uppercase', color: '#1ec860', fontFamily: FONT_HEAD,
                                textDecoration: 'none', border: '1px solid rgba(0,180,80,0.4)',
                                padding: '8px 16px', display: 'inline-block',
                            }}
                        >
                            View Operation
                        </a>
                        <Btn onClick={handleReset} variant='ghost'>Import Another</Btn>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Bulk import ───────────────────────────────────────────────────────────────

function BulkImport({ initialBatchId }: { initialBatchId?: string }) {
    const [step, setStep] = useState<BulkStep>(initialBatchId ? 'processing' : 'upload')
    const [file, setFile] = useState<File | null>(null)
    const [batchId, setBatchId] = useState<string | null>(initialBatchId ?? null)
    const [batchData, setBatchData] = useState<BatchPollResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showQueue, setShowQueue] = useState(false)
    const [reviewItem, setReviewItem] = useState<OperationImport | null>(null)
    const [reviewPreview, setReviewPreview] = useState<ImportPreviewSnapshot | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const dragRef = useRef<HTMLDivElement>(null)

    const pollBatch = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/operations/import/batch/${id}`)
            if (!res.ok) return
            const data: BatchPollResponse = await res.json()
            setBatchData(data)
            if (data.batch.status === 'completed' || data.batch.status === 'failed') {
                if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
                setStep('complete')
            }
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        if (step === 'processing' && batchId) {
            pollBatch(batchId)
            intervalRef.current = setInterval(() => pollBatch(batchId), 2000)
        }
        return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
    }, [step, batchId, pollBatch])

    async function handleStart() {
        if (!file) return
        setError(null)

        const form = new FormData()
        form.append('file', file)

        try {
            const res = await fetch('/api/operations/import/batch', { method: 'POST', body: form })
            const data: BatchStartResponse & { error?: string } = await res.json()
            if (!res.ok) { setError(data.error ?? 'Batch start failed'); return }
            setBatchId(data.batchId)
            setStep('processing')
        } catch {
            setError('Network error — please try again')
        }
    }

    async function handlePauseResume() {
        if (!batchId || !batchData) return
        const action = batchData.batch.status === 'paused' ? 'resume' : 'pause'
        await fetch(`/api/operations/import/batch/${batchId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        })
        pollBatch(batchId)
    }

    function handleReset() {
        setStep('upload')
        setFile(null)
        setBatchId(null)
        setBatchData(null)
        setError(null)
        setShowQueue(false)
    }

    const batch = batchData?.batch
    const pct = batch && batch.totalFiles > 0
        ? Math.round((batch.processedCount / batch.totalFiles) * 100) : 0
    const outstanding = batchData?.imports.filter(
        i => i.status === 'needs_review' || i.status === 'failed'
    ) ?? []

    return (
        <div>
            {/* Upload */}
            {step === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {error && (
                        <div style={{
                            background: 'rgba(219,0,29,0.1)', border: `1px solid rgba(219,0,29,0.4)`,
                            padding: '10px 14px', color: RED, fontSize: '0.78rem', fontFamily: FONT_BODY,
                        }}>
                            {error}
                        </div>
                    )}
                    <div
                        ref={dragRef}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: `2px dashed rgba(255,255,255,0.14)`,
                            padding: '40px 24px',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                            background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
                        }}
                    >
                        <CloudUpload sx={{ fontSize: '2.2rem', color: TXT_MUTED }} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: TXT, fontSize: '0.82rem', fontFamily: FONT_BODY }}>
                                Drop a <strong>.zip</strong> file here
                            </div>
                            <div style={{ color: TXT_MUTED, fontSize: '0.72rem', fontFamily: FONT_BODY, marginTop: 4 }}>
                                or select file
                            </div>
                        </div>
                        {file && (
                            <div style={{
                                color: TXT, fontSize: '0.78rem', fontFamily: 'monospace',
                                background: 'rgba(255,255,255,0.06)', padding: '5px 12px', border: BORDER,
                            }}>
                                {file.name}
                            </div>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type='file'
                        accept='.zip'
                        style={{ display: 'none' }}
                        onChange={e => setFile(e.target.files?.[0] ?? null)}
                    />
                    <Btn onClick={handleStart} disabled={!file} variant='primary'>
                        Start Bulk Import
                    </Btn>
                </div>
            )}

            {/* Processing */}
            {step === 'processing' && batch && (
                <Card>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{
                            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em',
                            textTransform: 'uppercase', color: RED, fontFamily: FONT_HEAD,
                        }}>
                            Bulk Import In Progress
                        </div>
                        <Btn
                            variant='ghost'
                            onClick={handlePauseResume}
                            style={{ fontSize: '0.6rem', padding: '5px 12px' }}
                        >
                            {batch.status === 'paused' ? 'Resume' : 'Pause'}
                        </Btn>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: '0.68rem', color: TXT_MUTED, fontFamily: FONT_HEAD, letterSpacing: '0.1em' }}>
                                OVERALL PROGRESS
                            </span>
                            <span style={{ fontSize: '0.68rem', color: TXT, fontFamily: 'monospace' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
                            <div style={{
                                width: `${pct}%`, height: '100%',
                                background: `linear-gradient(90deg, rgba(219,0,29,0.7), ${RED})`,
                                transition: 'width 0.4s ease',
                            }} />
                        </div>
                    </div>

                    <div style={{ marginBottom: 20, color: TXT_MUTED, fontSize: '0.72rem', fontFamily: 'monospace' }}>
                        Files: {batch.processedCount} / {batch.totalFiles} processed
                    </div>

                    {/* Status breakdown */}
                    <div style={{
                        background: 'rgba(0,0,0,0.3)', border: BORDER,
                        padding: '12px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 5,
                    }}>
                        {[
                            { label: 'Imported',      count: batch.importedCount,     color: '#1ec860', symbol: '✓' },
                            { label: 'Needs Review',  count: batch.needsReviewCount,  color: '#d4a000', symbol: '⚑' },
                            { label: 'Failed',        count: batch.failedCount,       color: RED,       symbol: '✗' },
                            { label: 'Duplicates',    count: batch.duplicateCount,    color: 'rgba(100,150,237,0.8)', symbol: '=' },
                            { label: 'Skipped',       count: batch.skippedCount,      color: TXT_MUTED, symbol: '⟳' },
                        ].map(row => (
                            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ color: row.color, fontFamily: 'monospace', fontSize: '0.8rem', width: 14, textAlign: 'center' }}>
                                    {row.symbol}
                                </span>
                                <span style={{ color: TXT_MUTED, fontSize: '0.72rem', fontFamily: FONT_HEAD, letterSpacing: '0.08em', flex: 1 }}>
                                    {row.label}
                                </span>
                                <span style={{ color: row.count > 0 ? row.color : TXT_DIM, fontFamily: 'monospace', fontSize: '0.8rem', minWidth: 24, textAlign: 'right' }}>
                                    {row.count}
                                </span>
                            </div>
                        ))}
                    </div>

                    {batch.currentFile && (
                        <div style={{ color: TXT_MUTED, fontSize: '0.72rem', fontFamily: 'monospace' }}>
                            Currently processing: <span style={{ color: TXT }}>{batch.currentFile}</span>
                        </div>
                    )}
                </Card>
            )}

            {/* Complete */}
            {step === 'complete' && batch && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Card style={{ borderTop: `3px solid #1ec860` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <CheckCircle sx={{ fontSize: '1.1rem', color: '#1ec860' }} />
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em',
                                textTransform: 'uppercase', color: '#1ec860', fontFamily: FONT_HEAD,
                            }}>
                                Import Complete
                            </span>
                        </div>
                        <div style={{ color: TXT_MUTED, fontSize: '0.78rem', fontFamily: FONT_BODY, marginBottom: 16 }}>
                            {batch.totalFiles} file{batch.totalFiles !== 1 ? 's' : ''} processed
                        </div>
                        <div style={{
                            background: 'rgba(0,0,0,0.3)', border: BORDER,
                            padding: '12px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 5,
                        }}>
                            {[
                                { label: 'Imported',     count: batch.importedCount,     color: '#1ec860' },
                                { label: 'Needs Review', count: batch.needsReviewCount,  color: '#d4a000' },
                                { label: 'Duplicates',   count: batch.duplicateCount,    color: 'rgba(100,150,237,0.8)' },
                                { label: 'Failed',       count: batch.failedCount,       color: RED },
                            ].map(row => (
                                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ color: TXT_MUTED, fontSize: '0.72rem', fontFamily: FONT_HEAD, letterSpacing: '0.08em' }}>
                                        {row.label}
                                    </span>
                                    <span style={{ color: row.count > 0 ? row.color : TXT_DIM, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                        {row.count}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {outstanding.length > 0 && (
                                <Btn onClick={() => setShowQueue(v => !v)} variant='outline'>
                                    {showQueue ? 'Hide' : 'Review Outstanding Items'}
                                    <ExpandMore sx={{ fontSize: '0.9rem', transform: showQueue ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </Btn>
                            )}
                            <a
                                href='/dashboard/j2'
                                style={{
                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
                                    textTransform: 'uppercase', fontFamily: FONT_HEAD, textDecoration: 'none',
                                    color: TXT_MUTED, border: BORDER, padding: '9px 20px', display: 'inline-flex', alignItems: 'center',
                                }}
                            >
                                View Import History
                            </a>
                            <Btn onClick={handleReset} variant='ghost'>Import Another</Btn>
                        </div>
                    </Card>

                    {/* Review queue */}
                    {showQueue && outstanding.length > 0 && (
                        <Card>
                            <CardHeading>Review Queue ({outstanding.length})</CardHeading>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {outstanding.map(imp => (
                                    <div key={imp._id.toString()} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                                        border: BORDER, background: 'rgba(0,0,0,0.2)',
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ color: TXT, fontSize: '0.78rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {imp.sourceFile}
                                            </div>
                                            {imp.failureReason && (
                                                <div style={{ color: RED, fontSize: '0.68rem', fontFamily: FONT_BODY, marginTop: 2 }}>
                                                    {imp.failureReason}
                                                </div>
                                            )}
                                        </div>
                                        <StatusBadge status={imp.status} />
                                        {imp.status === 'needs_review' && imp.preview && (
                                            <Btn
                                                variant='ghost'
                                                onClick={() => { setReviewItem(imp); setReviewPreview(imp.preview!) }}
                                                style={{ fontSize: '0.6rem', padding: '5px 12px' }}
                                            >
                                                Review
                                            </Btn>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* Review modal for outstanding items */}
            {reviewItem && reviewPreview && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                    zIndex: 1200, overflowY: 'auto', padding: '40px 20px',
                }}>
                    <div style={{
                        background: '#0e0e0e', border: BORDER_RED,
                        width: '100%', maxWidth: 760, padding: '24px',
                        boxShadow: '0 12px 60px rgba(0,0,0,0.7)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <span style={{
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em',
                                textTransform: 'uppercase', color: RED, fontFamily: FONT_HEAD,
                            }}>
                                Review: {reviewItem.sourceFile}
                            </span>
                            <button onClick={() => { setReviewItem(null); setReviewPreview(null) }} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: TXT_MUTED, padding: 2, display: 'flex',
                            }}>
                                <Close sx={{ fontSize: '1rem' }} />
                            </button>
                        </div>
                        <ReviewForm
                            importId={reviewItem._id.toString()}
                            preview={reviewPreview}
                            onCommitted={() => {
                                setReviewItem(null)
                                setReviewPreview(null)
                                if (batchId) pollBatch(batchId)
                            }}
                            onCancel={() => { setReviewItem(null); setReviewPreview(null) }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Mode card ─────────────────────────────────────────────────────────────────

function ModeCard({
    title, subtitle, active, onClick,
}: {
    title: string
    subtitle: string
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            style={{
                flex: 1, background: active ? 'rgba(219,0,29,0.09)' : CARD_BG,
                border: active ? BORDER_RED : BORDER,
                borderTop: active ? `3px solid ${RED}` : `3px solid transparent`,
                padding: '22px 24px', cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s',
            }}
        >
            <div style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: active ? RED : TXT,
                fontFamily: FONT_HEAD, marginBottom: 6,
            }}>
                {title}
            </div>
            <div style={{ fontSize: '0.76rem', color: TXT_MUTED, fontFamily: FONT_BODY }}>
                {subtitle}
            </div>
        </button>
    )
}

// ── Template examples section ─────────────────────────────────────────────────

interface TemplateExample { id: string; title: string }

function TemplateExamplesSection() {
    const [open, setOpen]               = useState(false)
    const [examples, setExamples]       = useState<TemplateExample[]>([])
    const [search, setSearch]           = useState('')
    const [results, setResults]         = useState<TemplateExample[]>([])
    const [searching, setSearching]     = useState(false)
    const [saving, setSaving]           = useState(false)
    const [loaded, setLoaded]           = useState(false)
    const searchTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!open || loaded) return
        fetch('/api/operations/import/templates')
            .then(r => r.json())
            .then(d => { setExamples(d.examples ?? []); setLoaded(true) })
            .catch(() => setLoaded(true))
    }, [open, loaded])

    useEffect(() => {
        if (!search.trim()) { setResults([]); return }
        if (searchTimer.current) clearTimeout(searchTimer.current)
        setSearching(true)
        searchTimer.current = setTimeout(() => {
            fetch(`/api/operations/import/templates/search?q=${encodeURIComponent(search)}`)
                .then(r => r.json())
                .then(d => setResults(d.results ?? []))
                .catch(() => setResults([]))
                .finally(() => setSearching(false))
        }, 300)
    }, [search])

    function addExample(ex: TemplateExample) {
        if (examples.some(e => e.id === ex.id)) return
        const next = [...examples, ex]
        setExamples(next)
        setSearch('')
        setResults([])
        save(next)
    }

    function removeExample(id: string) {
        const next = examples.filter(e => e.id !== id)
        setExamples(next)
        save(next)
    }

    function save(list: TemplateExample[]) {
        setSaving(true)
        fetch('/api/operations/import/templates', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examples: list }),
        }).finally(() => setSaving(false))
    }

    return (
        <div style={{ marginBottom: 24 }}>
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', background: CARD_BG, border: BORDER, padding: '14px 18px',
                    cursor: 'pointer', color: TXT,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: FONT_HEAD }}>
                        AI Template Examples
                    </span>
                    {examples.length > 0 && (
                        <span style={{ fontSize: '0.58rem', color: '#d4a000', border: '1px solid #d4a00040', background: '#d4a00018', padding: '1px 6px' }}>
                            {examples.length} selected
                        </span>
                    )}
                </div>
                <span style={{ fontSize: '0.62rem', color: TXT_MUTED }}>{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div style={{ border: BORDER, borderTop: 'none', padding: '16px 18px', background: 'rgba(255,255,255,0.015)' }}>
                    <p style={{ fontSize: '0.74rem', color: TXT_MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
                        Select existing operations as examples for the AI to reference when analysing imported documents.
                        Add a range — older, newer, and varied formats help the AI understand your orders structure.
                    </p>

                    {/* Search */}
                    <div style={{ position: 'relative', marginBottom: 12 }}>
                        <StyledInput
                            value={search}
                            onChange={setSearch}
                            placeholder='Search operations to add as examples…'
                        />
                        {searching && (
                            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: TXT_DIM }}>
                                …
                            </span>
                        )}
                        {results.length > 0 && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                background: '#111', border: BORDER, maxHeight: 220, overflowY: 'auto',
                            }}>
                                {results.map(r => (
                                    <button key={r.id} onClick={() => addExample(r)}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left',
                                            padding: '8px 12px', background: 'transparent', border: 'none',
                                            color: TXT, fontSize: '0.78rem', cursor: 'pointer',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        {r.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected list */}
                    {examples.length === 0 ? (
                        <p style={{ fontSize: '0.72rem', color: TXT_DIM, margin: 0, fontStyle: 'italic' }}>
                            No template examples selected yet.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {examples.map(ex => (
                                <div key={ex.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '7px 10px', background: 'rgba(212,160,0,0.07)',
                                    border: '1px solid rgba(212,160,0,0.2)',
                                }}>
                                    <span style={{ fontSize: '0.78rem', color: TXT }}>{ex.title}</span>
                                    <button onClick={() => removeExample(ex.id)}
                                        style={{ background: 'none', border: 'none', color: TXT_MUTED, cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = RED)}
                                        onMouseLeave={e => (e.currentTarget.style.color = TXT_MUTED)}
                                    >✕</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {saving && <p style={{ fontSize: '0.62rem', color: TXT_DIM, margin: '8px 0 0', fontStyle: 'italic' }}>Saving…</p>}
                </div>
            )}
        </div>
    )
}

// ── Root panel ────────────────────────────────────────────────────────────────

export default function ImportPanel({ batchId }: { batchId?: string }) {
    const [mode, setMode] = useState<ImportMode | null>(batchId ? 'bulk' : null)

    return (
        <div style={{
            background: BG, minHeight: '100%', padding: '24px',
            fontFamily: FONT_BODY, color: TXT,
        }}>
            {/* Page header */}
            <div style={{
                position: 'relative', border: BORDER, borderTop: `3px solid ${RED}`,
                background: 'rgba(255,255,255,0.03)', padding: '18px 22px',
                marginBottom: 24,
            }}>
                <div style={{
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.24em',
                    textTransform: 'uppercase', color: TXT_MUTED, fontFamily: 'monospace',
                    marginBottom: 4,
                }}>
                    <span style={{ color: TXT_DIM }}>{'//'}</span> J2 — OPERATIONS
                </div>
                <div style={{
                    fontSize: '1rem', fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', fontFamily: FONT_HEAD, color: TXT,
                }}>
                    Operations Import
                </div>
            </div>

            {/* Template examples */}
            <TemplateExamplesSection />

            {/* Mode selector */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <ModeCard
                    title='Single File Import'
                    subtitle='Test one document before bulk importing'
                    active={mode === 'single'}
                    onClick={() => setMode(mode === 'single' ? null : 'single')}
                />
                <ModeCard
                    title='Bulk Import (ZIP / Folder)'
                    subtitle='Import a folder of historical orders as a ZIP'
                    active={mode === 'bulk'}
                    onClick={() => setMode(mode === 'bulk' ? null : 'bulk')}
                />
            </div>

            {/* Panel body */}
            {mode === 'single' && (
                <div>
                    <div style={{
                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: TXT_MUTED, fontFamily: FONT_HEAD,
                        marginBottom: 16,
                    }}>
                        Single File Import
                    </div>
                    <SingleImport />
                </div>
            )}
            {mode === 'bulk' && (
                <div>
                    <div style={{
                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em',
                        textTransform: 'uppercase', color: TXT_MUTED, fontFamily: FONT_HEAD,
                        marginBottom: 16,
                    }}>
                        Bulk Import
                    </div>
                    <BulkImport initialBatchId={batchId} />
                </div>
            )}
        </div>
    )
}
