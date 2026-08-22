'use client'

import { useState, useRef } from 'react'
import {
    Typography, Box, Button, Alert, Chip, CircularProgress,
    Tabs, Tab, List, ListItem, Autocomplete, TextField, FormControlLabel, Checkbox,
} from '@mui/material'
import {
    CloudUpload, CheckCircle, Error as ErrorIcon,
    AccountTree, EventAvailable, People, Archive, WarningAmber,
} from '@mui/icons-material'

// ── Shared styles ─────────────────────────────────────────────────────────────

const redBtn = {
    background: 'var(--red)',
    fontSize: '0.72rem',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    '&:hover': { background: 'rgba(219,0,29,0.8)' },
    '&:disabled': { background: 'rgba(219,0,29,0.2)' },
}
const ghostBtn = {
    color: 'rgba(237,237,237,0.4)',
    fontSize: '0.72rem',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
}
const lbl = {
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: 'rgba(237,237,237,0.4)',
    mb: 1,
}
const fileBtn = (hasFile: boolean) => ({
    borderColor: hasFile ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.15)',
    color: hasFile ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
    justifyContent: 'flex-start',
    textTransform: 'none' as const,
    fontSize: '0.78rem',
    letterSpacing: '0.02em',
})

// ─────────────────────────────────────────────────────────────────────────────
// ORBAT + Mastersheet import
// ─────────────────────────────────────────────────────────────────────────────

type OrbatStep = 'upload' | 'confirm' | 'loading' | 'result'
interface OrbatResult { orbatInserted: number; orbatMatched: number; mastersheetRows: number; mastersheetMatched: number; usersUpdated: number; namesUpdated: number }

function OrbatImportTab() {
    const [step, setStep]           = useState<OrbatStep>('upload')
    const [orbatFile, setOrbatFile] = useState<File | null>(null)
    const [sheetFile, setSheetFile] = useState<File | null>(null)
    const [confirmed, setConfirmed] = useState(false)
    const [result, setResult]       = useState<OrbatResult | null>(null)
    const [error, setError]         = useState<string | null>(null)
    const orbatRef                  = useRef<HTMLInputElement>(null)
    const sheetRef                  = useRef<HTMLInputElement>(null)
    const reset = () => { setStep('upload'); setOrbatFile(null); setSheetFile(null); setConfirmed(false); setResult(null); setError(null) }

    const handleImport = async () => {
        if (!orbatFile || !sheetFile) return
        setStep('loading'); setError(null)
        try {
            const fd = new FormData()
            fd.append('orbat', orbatFile)
            fd.append('mastersheet', sheetFile)
            const res  = await fetch('/api/admin/mass-import', { method: 'POST', body: fd })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); setStep('result'); return }
            setResult(data); setStep('result')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error'); setStep('result')
        }
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                Upload the Orbat CSV and Billet Mastersheet CSV to perform a full import.
                <strong style={{ color: 'rgba(219,0,29,0.8)' }}> This will wipe all existing ORBAT positions and milpac records.</strong>
            </Typography>

            {step === 'upload' && (
                <>
                    <Box>
                        <Typography sx={lbl}>Orbat CSV</Typography>
                        <input ref={orbatRef} type='file' accept='.csv' style={{ display: 'none' }} onChange={e => setOrbatFile(e.target.files?.[0] ?? null)} />
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => orbatRef.current?.click()} fullWidth sx={fileBtn(!!orbatFile)}>
                            {orbatFile ? orbatFile.name : 'Choose Orbat.csv…'}
                        </Button>
                    </Box>
                    <Box>
                        <Typography sx={lbl}>Billet Mastersheet CSV</Typography>
                        <input ref={sheetRef} type='file' accept='.csv' style={{ display: 'none' }} onChange={e => setSheetFile(e.target.files?.[0] ?? null)} />
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => sheetRef.current?.click()} fullWidth sx={fileBtn(!!sheetFile)}>
                            {sheetFile ? sheetFile.name : 'Choose Billet Mastersheet.csv…'}
                        </Button>
                    </Box>
                    <Button variant='contained' disabled={!orbatFile || !sheetFile} onClick={() => setStep('confirm')} sx={redBtn}>Next</Button>
                </>
            )}

            {step === 'confirm' && (
                <>
                    <Alert severity='warning' sx={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.42)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', '& .MuiAlert-icon': { color: 'rgba(219,0,29,0.8)' } }}>
                        This will <strong>permanently wipe</strong> all ORBAT positions and milpac records. This cannot be undone.
                    </Alert>
                    <Box sx={{ pl: 1 }}>
                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.5)', mb: 0.5 }}>Files to import:</Typography>
                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>Orbat: <strong>{orbatFile?.name}</strong></Typography>
                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>Mastersheet: <strong>{sheetFile?.name}</strong></Typography>
                    </Box>
                    <FormControlLabel
                        control={<Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)} sx={{ color: 'rgba(219,0,29,0.6)', '&.Mui-checked': { color: 'var(--red)' } }} />}
                        label={<Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>I understand this will overwrite all existing data</Typography>}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={() => setStep('upload')} sx={ghostBtn}>Back</Button>
                        <Button variant='contained' disabled={!confirmed} onClick={handleImport} sx={redBtn}>Import</Button>
                    </Box>
                </>
            )}

            {step === 'loading' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
                    <CircularProgress sx={{ color: 'var(--red)' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>Importing data, please wait…</Typography>
                </Box>
            )}

            {step === 'result' && (
                <>
                    {error ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <ErrorIcon sx={{ color: 'var(--red)' }} />
                            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>Import failed: {error}</Typography>
                        </Box>
                    ) : (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <CheckCircle sx={{ color: '#4caf50' }} />
                                <Typography fontWeight={700} fontSize='0.85rem' sx={{ textTransform: 'uppercase', letterSpacing: 2 }}>Import Complete</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pl: 0.5 }}>
                                {[
                                    ['ORBAT positions inserted', result?.orbatInserted],
                                    ['ORBAT users matched',      result?.orbatMatched],
                                    ['Mastersheet rows parsed',  result?.mastersheetRows],
                                    ['Mastersheet users matched',result?.mastersheetMatched],
                                    ['Milpac records updated',   result?.usersUpdated],
                                    ['Names updated',            result?.namesUpdated],
                                ].map(([l, val]) => (
                                    <Box key={l as string} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)' }}>{l}</Typography>
                                        <Typography fontSize='0.72rem' fontWeight={700} sx={{ color: 'rgba(237,237,237,0.8)' }}>{val}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </>
                    )}
                    <Button onClick={reset} sx={ghostBtn}>Start Over</Button>
                </>
            )}
        </Box>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance import
// ─────────────────────────────────────────────────────────────────────────────

type AttStep = 'upload' | 'loading' | 'resolve' | 'resolving' | 'result'
interface UnmatchedUser { name: string; rank: string; unit: string }
interface AttImportResult { operationsProcessed: number; membersMatched: number; unmatched: UnmatchedUser[] }
interface ResolveAction { csvName: string; csvRank: string; unit: string; action: 'match' | 'skeleton'; discordUserId?: string }

function AttendanceImportTab() {
    const [step, setStep]                 = useState<AttStep>('upload')
    const [attFiles, setAttFiles]         = useState<File[]>([])
    const [importResult, setImportResult] = useState<AttImportResult | null>(null)
    const [resolveMap, setResolveMap]     = useState<Record<string, ResolveAction>>({})
    const [finalResult, setFinalResult]   = useState<{ matched: number; skeletonsCreated: number } | null>(null)
    const [error, setError]               = useState<string | null>(null)
    const attRef                          = useRef<HTMLInputElement>(null)
    const [allUsers, setAllUsers]         = useState<{ id: string; displayName: string }[]>([])
    const [usersLoaded, setUsersLoaded]   = useState(false)

    const loadUsers = async () => {
        if (usersLoaded) return
        try {
            const res  = await fetch('/api/members')
            const data = await res.json()
            setAllUsers((data.members ?? data ?? []).map((u: Record<string, unknown>) => ({
                id: u.id,
                displayName: (u as any).guild?.displayName || (u as any).globalName || (u as any).username || u.id,
            })))
            setUsersLoaded(true)
        } catch { /* silently fail */ }
    }

    const handleImport = async () => {
        if (attFiles.length === 0) return
        setStep('loading'); setError(null)
        try {
            const fd = new FormData()
            for (const f of attFiles) fd.append('attendance', f)
            const res  = await fetch('/api/admin/attendance-import', { method: 'POST', body: fd })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); setStep('result'); return }
            setImportResult(data)
            if ((data.unmatched ?? []).length === 0) {
                setStep('result')
            } else {
                const defaultMap: Record<string, ResolveAction> = {}
                for (const u of data.unmatched) defaultMap[`${u.unit}|${u.name}`] = { csvName: u.name, csvRank: u.rank, unit: u.unit, action: 'skeleton' }
                setResolveMap(defaultMap)
                setStep('resolve')
                loadUsers()
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error'); setStep('result')
        }
    }

    const handleResolve = async () => {
        setStep('resolving')
        try {
            const actions = Object.values(resolveMap)
            const res  = await fetch('/api/admin/attendance-import/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actions) })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); setStep('result'); return }
            setFinalResult(data); setStep('result')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error'); setStep('result')
        }
    }

    const setAction = (key: string, action: 'match' | 'skeleton', discordUserId?: string) => {
        setResolveMap(prev => ({ ...prev, [key]: { ...prev[key], action, discordUserId } }))
    }

    const reset = () => { setStep('upload'); setAttFiles([]); setImportResult(null); setResolveMap({}); setFinalResult(null); setError(null) }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                Upload one or more Attendance Tracker CSVs (2024, 2025, 2026 formats supported).
                Operations will be matched to existing records; unmatched members can be linked or given skeleton accounts.
            </Typography>

            {step === 'upload' && (
                <>
                    <Box>
                        <Typography sx={lbl}>Attendance Tracker CSV(s)</Typography>
                        <input ref={attRef} type='file' accept='.csv' multiple style={{ display: 'none' }} onChange={e => setAttFiles(Array.from(e.target.files ?? []))} />
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => attRef.current?.click()} fullWidth sx={fileBtn(attFiles.length > 0)}>
                            {attFiles.length === 0 ? 'Choose CSV file(s)…' : attFiles.length === 1 ? attFiles[0].name : `${attFiles.length} files selected`}
                        </Button>
                        {attFiles.length > 1 && (
                            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {attFiles.map(f => <Typography key={f.name} fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.4)', pl: 0.5 }}>· {f.name}</Typography>)}
                            </Box>
                        )}
                    </Box>
                    <Button variant='contained' disabled={attFiles.length === 0} onClick={handleImport} sx={redBtn}>Import</Button>
                </>
            )}

            {step === 'loading' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
                    <CircularProgress sx={{ color: 'var(--red)' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>Parsing CSV and matching members…</Typography>
                </Box>
            )}

            {step === 'resolve' && importResult && (
                <>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Chip label={`${importResult.operationsProcessed} operations processed`} size='small' sx={{ background: 'rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem' }} />
                        <Chip label={`${importResult.membersMatched} members matched`} size='small' sx={{ background: 'rgba(76,175,80,0.15)', color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem' }} />
                        <Chip label={`${importResult.unmatched.length} unmatched`} size='small' sx={{ background: 'rgba(255,152,0,0.15)', color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem' }} />
                    </Box>
                    <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>
                        Link each unmatched member to an existing account or create a placeholder skeleton account.
                    </Typography>
                    <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 360, overflowY: 'auto' }}>
                        {importResult.unmatched.map(u => {
                            const key    = `${u.unit}|${u.name}`
                            const action = resolveMap[key]
                            return (
                                <ListItem key={key} disablePadding sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0.75, p: 1.5, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                        <Typography fontSize='0.78rem' fontWeight={700}>{u.rank} {u.name}</Typography>
                                        <Typography fontSize='0.65rem' sx={{ color: 'rgba(237,237,237,0.35)', letterSpacing: 2, textTransform: 'uppercase' }}>{u.unit}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                                        <Button size='small' variant={action?.action === 'skeleton' ? 'contained' : 'outlined'} onClick={() => setAction(key, 'skeleton')}
                                            sx={{ fontSize: '0.65rem', letterSpacing: 1.5, textTransform: 'uppercase', flexShrink: 0,
                                                ...(action?.action === 'skeleton' ? { background: 'rgba(219,0,29,0.5)', '&:hover': { background: 'rgba(219,0,29,0.7)' } } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.4)' }) }}>
                                            Skeleton
                                        </Button>
                                        <Autocomplete size='small' options={allUsers} getOptionLabel={o => o.displayName}
                                            onChange={(_, val) => { if (val) setAction(key, 'match', val.id); else setAction(key, 'skeleton') }}
                                            sx={{ flex: 1 }}
                                            renderInput={params => (
                                                <TextField {...params} placeholder='Match to Discord user…'
                                                    sx={{ '& .MuiInputBase-root': { fontSize: '0.75rem', background: 'rgba(255,255,255,0.03)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                                            )} />
                                    </Box>
                                </ListItem>
                            )
                        })}
                    </List>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={reset} sx={ghostBtn}>Cancel</Button>
                        <Button variant='contained' onClick={handleResolve} sx={redBtn}>Confirm &amp; Finish</Button>
                    </Box>
                </>
            )}

            {step === 'resolving' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
                    <CircularProgress sx={{ color: 'var(--red)' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>Resolving unmatched members…</Typography>
                </Box>
            )}

            {step === 'result' && (
                <>
                    {error ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <ErrorIcon sx={{ color: 'var(--red)' }} />
                            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>Import failed: {error}</Typography>
                        </Box>
                    ) : (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <CheckCircle sx={{ color: '#4caf50' }} />
                                <Typography fontWeight={700} fontSize='0.85rem' sx={{ textTransform: 'uppercase', letterSpacing: 2 }}>Import Complete</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pl: 0.5 }}>
                                {[
                                    ['Operations processed', importResult?.operationsProcessed],
                                    ['Members matched',      importResult?.membersMatched],
                                    ['Accounts linked',      finalResult?.matched],
                                    ['Skeleton accounts created', finalResult?.skeletonsCreated],
                                ].map(([l, val]) => val !== undefined && (
                                    <Box key={l as string} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)' }}>{l}</Typography>
                                        <Typography fontSize='0.72rem' fontWeight={700} sx={{ color: 'rgba(237,237,237,0.8)' }}>{val}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </>
                    )}
                    <Button onClick={reset} sx={ghostBtn}>Start Over</Button>
                </>
            )}
        </Box>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Retired Records import
// ─────────────────────────────────────────────────────────────────────────────

interface RetiredImportResult { ok: boolean; inserted: number; updated: number; skipped: number; total: number; skippedRows: { row: number; callsign: string; reason: string }[] }

function RetiredRecordsImportTab() {
    const [csvFile, setCsvFile]     = useState<File | null>(null)
    const [importing, setImporting] = useState(false)
    const [result, setResult]       = useState<RetiredImportResult | null>(null)
    const [error, setError]         = useState<string | null>(null)
    const fileRef                   = useRef<HTMLInputElement>(null)

    const reset = () => { setCsvFile(null); setResult(null); setError(null) }

    async function handleImport() {
        if (!csvFile) return
        setImporting(true); setError(null); setResult(null)
        try {
            const text = await csvFile.text()
            const res  = await fetch('/api/admin/retired/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: text }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); return }
            setResult(data)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error')
        } finally {
            setImporting(false)
        }
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                Upload the retired/discharged members CSV exported from the Discharge Register spreadsheet.
                Records are matched by callsign + discharge date — re-importing the same file is safe (upserts, does not duplicate).
            </Typography>

            <Box>
                <Typography sx={lbl}>Retired Members CSV</Typography>
                <input ref={fileRef} type='file' accept='.csv,text/csv' style={{ display: 'none' }} onChange={e => { setCsvFile(e.target.files?.[0] ?? null); setResult(null); setError(null) }} />
                <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => fileRef.current?.click()} fullWidth sx={fileBtn(!!csvFile)}>
                    {csvFile ? csvFile.name : 'Choose Discharge Register CSV…'}
                </Button>
            </Box>

            {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{error}</Alert>}

            {result && (
                <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CheckCircle sx={{ color: '#4caf50' }} />
                        <Typography fontWeight={700} fontSize='0.85rem' sx={{ textTransform: 'uppercase', letterSpacing: 2 }}>Import Complete</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pl: 0.5 }}>
                        {[
                            ['Total rows processed', result.total],
                            ['New records inserted', result.inserted],
                            ['Existing records updated', result.updated],
                            ['Rows skipped', result.skipped],
                        ].map(([l, val]) => (
                            <Box key={l as string} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)' }}>{l}</Typography>
                                <Typography fontSize='0.72rem' fontWeight={700} sx={{ color: 'rgba(237,237,237,0.8)' }}>{val}</Typography>
                            </Box>
                        ))}
                    </Box>
                    {result.skippedRows.length > 0 && (
                        <Box sx={{ border: '1px solid var(--line-2)', p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 200, overflowY: 'auto' }}>
                            <Typography fontSize='0.6rem' fontWeight={700} sx={{ letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', mb: 0.5 }}>Skipped Rows</Typography>
                            {result.skippedRows.map(r => (
                                <Typography key={r.row} fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.4)' }}>
                                    Row {r.row} — <strong>{r.callsign}</strong>: {r.reason}
                                </Typography>
                            ))}
                        </Box>
                    )}
                    <Button onClick={reset} sx={ghostBtn}>Import Another</Button>
                </>
            )}

            {!result && (
                <Button variant='contained' disabled={!csvFile || importing} onClick={handleImport}
                    startIcon={importing ? <CircularProgress size={14} color='inherit' /> : <Archive sx={{ fontSize: 16 }} />}
                    sx={{ ...redBtn, alignSelf: 'flex-start' }}>
                    {importing ? 'Importing…' : 'Run Import'}
                </Button>
            )}
        </Box>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Member Emails import
// ─────────────────────────────────────────────────────────────────────────────

type EmailStep = 'upload' | 'loading' | 'review' | 'confirming' | 'result'

interface EmailCandidate { memberId: string; memberName: string; confidence: string; source?: string }
interface EmailConfirmed { csvName: string; emails: string[]; memberId: string; memberName: string; confidence: string; source?: string }
interface EmailUncertain { csvName: string; emails: string[]; candidates: EmailCandidate[] }
interface EmailUnmatched { csvName: string; emails: string[] }
interface EmailAnalysis { confirmed: EmailConfirmed[]; uncertain: EmailUncertain[]; unmatched: EmailUnmatched[]; skipped: number }
interface EmailFinalResult { ok: boolean; inserted: number; duplicates: number }

function MemberEmailsImportTab() {
    const [step, setStep]           = useState<EmailStep>('upload')
    const [csvFile, setCsvFile]     = useState<File | null>(null)
    const [analysis, setAnalysis]   = useState<EmailAnalysis | null>(null)
    const [selections, setSelections] = useState<Record<string, string>>({})
    const [result, setResult]       = useState<EmailFinalResult | null>(null)
    const [error, setError]         = useState<string | null>(null)
    const fileRef                   = useRef<HTMLInputElement>(null)

    const reset = () => { setCsvFile(null); setAnalysis(null); setSelections({}); setResult(null); setError(null); setStep('upload') }

    async function handleAnalyze() {
        if (!csvFile) return
        setStep('loading'); setError(null)
        try {
            const fd = new FormData()
            fd.append('file', csvFile)
            const res  = await fetch('/api/admin/j4/member-emails/import', { method: 'POST', body: fd })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); setStep('upload'); return }
            setAnalysis(data)
            // Pre-select first candidate for uncertain rows
            const sel: Record<string, string> = {}
            for (const u of data.uncertain ?? []) {
                if (u.candidates.length > 0) sel[u.csvName] = u.candidates[0].memberId
            }
            setSelections(sel)
            setStep('review')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error'); setStep('upload')
        }
    }

    async function handleConfirm() {
        if (!analysis) return
        setStep('confirming')
        const entries: { memberId: string; email: string }[] = []
        for (const c of analysis.confirmed) {
            for (const email of c.emails) entries.push({ memberId: c.memberId, email })
        }
        for (const u of analysis.uncertain) {
            const memberId = selections[u.csvName]
            if (memberId) for (const email of u.emails) entries.push({ memberId, email })
        }
        try {
            const res  = await fetch('/api/admin/j4/member-emails/import/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); setStep('review'); return }
            setResult(data); setStep('result')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error'); setStep('review')
        }
    }

    const CONF_COLOR: Record<string, string> = { exact: 'rgba(0,200,80,0.8)', normalized: 'rgba(0,200,80,0.6)', partial: 'rgba(219,160,0,0.8)', fuzzy: 'rgba(237,100,0,0.8)' }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                Upload the Member Emails spreadsheet CSV. Members are matched by name using exact, normalized, and fuzzy matching.
                Uncertain matches require manual selection. Existing emails are deduplicated — re-importing is safe.
            </Typography>

            {step === 'upload' && (
                <>
                    <Box>
                        <Typography sx={lbl}>Member Emails CSV</Typography>
                        <input ref={fileRef} type='file' accept='.csv,text/csv' style={{ display: 'none' }} onChange={e => { setCsvFile(e.target.files?.[0] ?? null); setError(null) }} />
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => fileRef.current?.click()} fullWidth sx={fileBtn(!!csvFile)}>
                            {csvFile ? csvFile.name : 'Choose Member Emails CSV…'}
                        </Button>
                    </Box>
                    {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{error}</Alert>}
                    <Button variant='contained' disabled={!csvFile} onClick={handleAnalyze} sx={{ ...redBtn, alignSelf: 'flex-start' }}>
                        Analyse File
                    </Button>
                </>
            )}

            {step === 'loading' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
                    <CircularProgress sx={{ color: 'var(--red)' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>Analysing and matching members…</Typography>
                </Box>
            )}

            {step === 'review' && analysis && (
                <>
                    {/* Summary */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, px: 1.5, py: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-2)' }}>
                        {[
                            [`${analysis.confirmed.length} auto-matched`, 'rgba(0,200,80,0.7)'],
                            [`${analysis.uncertain.length} need selection`, 'rgba(219,160,0,0.7)'],
                            [`${analysis.unmatched.length} unmatched`, 'rgba(237,237,237,0.35)'],
                            [`${analysis.skipped} skipped`, 'rgba(237,237,237,0.25)'],
                        ].map(([lbl, color]) => (
                            <Typography key={lbl} fontSize='0.72rem' sx={{ color }}>{lbl}</Typography>
                        ))}
                    </Box>

                    {/* Auto-confirmed */}
                    {analysis.confirmed.length > 0 && (
                        <Box>
                            <Typography fontSize='0.6rem' fontWeight={700} sx={{ letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', mb: 1 }}>Auto-matched ({analysis.confirmed.length})</Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 200, overflowY: 'auto' }}>
                                {analysis.confirmed.map((c, i) => (
                                    <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 1.5, px: 1.5, py: 0.75, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                        <Typography fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.csvName}</Typography>
                                        <Typography fontSize='0.7rem' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.memberName}</Typography>
                                        <Typography fontSize='0.6rem' fontWeight={700} sx={{ color: CONF_COLOR[c.confidence] ?? 'rgba(237,237,237,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>{c.confidence}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    )}

                    {/* Uncertain — user picks */}
                    {analysis.uncertain.length > 0 && (
                        <Box>
                            <Typography fontSize='0.6rem' fontWeight={700} sx={{ letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,160,0,0.7)', mb: 1 }}>
                                <WarningAmber sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                                Needs selection ({analysis.uncertain.length})
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {analysis.uncertain.map((u, i) => (
                                    <Box key={i} sx={{ p: 1.5, border: '1px solid rgba(219,160,0,0.2)', background: 'rgba(219,160,0,0.04)' }}>
                                        <Typography fontSize='0.75rem' fontWeight={700} sx={{ mb: 0.75 }}>{u.csvName}</Typography>
                                        <Typography fontSize='0.68rem' sx={{ color: 'rgba(237,237,237,0.35)', mb: 1 }}>{u.emails.join(', ')}</Typography>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                            {u.candidates.map((c, ci) => (
                                                <Box key={ci} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <input
                                                        type='radio'
                                                        name={`uncertain-${i}`}
                                                        checked={selections[u.csvName] === c.memberId}
                                                        onChange={() => setSelections(prev => ({ ...prev, [u.csvName]: c.memberId }))}
                                                        style={{ accentColor: 'var(--red)' }}
                                                    />
                                                    <Typography fontSize='0.72rem'>{c.memberName}</Typography>
                                                    <Typography fontSize='0.6rem' fontWeight={700} sx={{ color: CONF_COLOR[c.confidence] ?? 'rgba(237,237,237,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>{c.confidence}</Typography>
                                                </Box>
                                            ))}
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <input
                                                    type='radio'
                                                    name={`uncertain-${i}`}
                                                    checked={!selections[u.csvName]}
                                                    onChange={() => setSelections(prev => { const n = { ...prev }; delete n[u.csvName]; return n })}
                                                    style={{ accentColor: 'var(--red)' }}
                                                />
                                                <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.35)' }}>Skip this row</Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    )}

                    {/* Unmatched */}
                    {analysis.unmatched.length > 0 && (
                        <Box sx={{ p: 1.5, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <Typography fontSize='0.6rem' fontWeight={700} sx={{ letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', mb: 1 }}>
                                No match found — will be skipped ({analysis.unmatched.length})
                            </Typography>
                            {analysis.unmatched.slice(0, 10).map((u, i) => (
                                <Typography key={i} fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.3)' }}>{u.csvName}</Typography>
                            ))}
                            {analysis.unmatched.length > 10 && (
                                <Typography fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.2)' }}>+ {analysis.unmatched.length - 10} more</Typography>
                            )}
                        </Box>
                    )}

                    {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{error}</Alert>}

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={reset} sx={ghostBtn}>Cancel</Button>
                        <Button variant='contained' onClick={handleConfirm} sx={redBtn}>
                            Confirm &amp; Import {analysis.confirmed.length + Object.keys(selections).length} Entries
                        </Button>
                    </Box>
                </>
            )}

            {step === 'confirming' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
                    <CircularProgress sx={{ color: 'var(--red)' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>Saving emails…</Typography>
                </Box>
            )}

            {step === 'result' && result && (
                <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CheckCircle sx={{ color: '#4caf50' }} />
                        <Typography fontWeight={700} fontSize='0.85rem' sx={{ textTransform: 'uppercase', letterSpacing: 2 }}>Import Complete</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pl: 0.5 }}>
                        {[
                            ['Email entries saved', result.inserted],
                            ['Duplicates skipped', result.duplicates],
                        ].map(([l, val]) => (
                            <Box key={l as string} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)' }}>{l}</Typography>
                                <Typography fontSize='0.72rem' fontWeight={700} sx={{ color: 'rgba(237,237,237,0.8)' }}>{val}</Typography>
                            </Box>
                        ))}
                    </Box>
                    <Button onClick={reset} sx={ghostBtn}>Import Another</Button>
                </>
            )}
        </Box>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// J4 Tab container
// ─────────────────────────────────────────────────────────────────────────────

const SUB_TABS = [
    { label: 'ORBAT & Mastersheet', icon: <AccountTree sx={{ fontSize: 15 }} /> },
    { label: 'Attendance',          icon: <EventAvailable sx={{ fontSize: 15 }} /> },
    { label: 'Member Emails',       icon: <People sx={{ fontSize: 15 }} /> },
    { label: 'Retired Records',     icon: <Archive sx={{ fontSize: 15 }} /> },
]

export default function J4ImportTab() {
    const [sub, setSub] = useState(0)

    const tabSx = {
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        minHeight: 38,
        padding: '6px 16px',
        textTransform: 'uppercase' as const,
        color: 'rgba(237,237,237,0.45)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ px: { xs: 3, md: 5 }, pt: 3 }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', mb: 0.5 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={2} sx={{ textTransform: 'uppercase', mb: 2 }}>
                    J4 Imports
                </Typography>
            </Box>

            <Box sx={{ px: { xs: 3, md: 5 }, borderBottom: '1px solid var(--line-2)' }}>
                <Tabs value={sub} onChange={(_, v) => setSub(v)} TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }} sx={{ minHeight: 38 }}>
                    {SUB_TABS.map((t, i) => (
                        <Tab key={i} icon={t.icon} iconPosition='start' label={t.label} sx={tabSx} />
                    ))}
                </Tabs>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 3, md: 5 }, pt: 3 }}>
                {sub === 0 && <OrbatImportTab />}
                {sub === 1 && <AttendanceImportTab />}
                {sub === 2 && <MemberEmailsImportTab />}
                {sub === 3 && <RetiredRecordsImportTab />}
            </Box>
        </Box>
    )
}
