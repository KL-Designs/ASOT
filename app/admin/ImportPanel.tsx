'use client'

import { useState, useRef } from 'react'
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, CircularProgress, Checkbox,
    FormControlLabel, Alert, Divider, Box, Tabs, Tab,
    List, ListItem, ListItemText, TextField, Autocomplete,
    Chip,
} from '@mui/material'
import {
    CloudUpload, CheckCircle, Error as ErrorIcon,
    AccountTree, EventAvailable, PersonAdd,
} from '@mui/icons-material'

interface Props {
    open: boolean
    onClose: () => void
}

// ── Shared styles ────────────────────────────────────────────────────────────

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
const label = {
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

// ── Tab 0: ORBAT + Mastersheet import (existing functionality) ───────────────

type OrbatStep = 'upload' | 'confirm' | 'loading' | 'result'
interface OrbatResult {
    orbatInserted: number
    orbatMatched: number
    mastersheetRows: number
    mastersheetMatched: number
    usersUpdated: number
    namesUpdated: number
}

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
            {step === 'upload' && (
                <>
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                        Upload the Orbat CSV and Billet Mastersheet CSV to perform a full import.
                        This will wipe all existing ORBAT positions and milpac records.
                    </Typography>

                    <Box>
                        <Typography sx={label}>Orbat CSV</Typography>
                        <input ref={orbatRef} type='file' accept='.csv' style={{ display: 'none' }} onChange={e => setOrbatFile(e.target.files?.[0] ?? null)} />
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => orbatRef.current?.click()} fullWidth sx={fileBtn(!!orbatFile)}>
                            {orbatFile ? orbatFile.name : 'Choose Orbat.csv…'}
                        </Button>
                    </Box>

                    <Box>
                        <Typography sx={label}>Billet Mastersheet CSV</Typography>
                        <input ref={sheetRef} type='file' accept='.csv' style={{ display: 'none' }} onChange={e => setSheetFile(e.target.files?.[0] ?? null)} />
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => sheetRef.current?.click()} fullWidth sx={fileBtn(!!sheetFile)}>
                            {sheetFile ? sheetFile.name : 'Choose Billet Mastersheet.csv…'}
                        </Button>
                    </Box>

                    <Button variant='contained' disabled={!orbatFile || !sheetFile} onClick={() => setStep('confirm')} sx={redBtn}>
                        Next
                    </Button>
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
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>Importing data, please wait…</Typography>
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
                                ].map(([lbl, val]) => (
                                    <Box key={lbl as string} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)', letterSpacing: '0.03em' }}>{lbl}</Typography>
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

// ── Tab 1: Attendance CSV import ─────────────────────────────────────────────

type AttStep = 'upload' | 'loading' | 'resolve' | 'resolving' | 'result'

interface UnmatchedUser { name: string; rank: string; unit: string }
interface AttImportResult { operationsProcessed: number; membersMatched: number; unmatched: UnmatchedUser[] }
interface ResolveAction { csvName: string; csvRank: string; unit: string; action: 'match' | 'skeleton'; discordUserId?: string }

function AttendanceImportTab() {
    const [step, setStep]                   = useState<AttStep>('upload')
    const [attFiles, setAttFiles]           = useState<File[]>([])
    const [importResult, setImportResult]   = useState<AttImportResult | null>(null)
    const [resolveMap, setResolveMap]       = useState<Record<string, ResolveAction>>({})
    const [finalResult, setFinalResult]     = useState<{ matched: number; skeletonsCreated: number } | null>(null)
    const [error, setError]                 = useState<string | null>(null)
    const attRef                            = useRef<HTMLInputElement>(null)

    // All Discord users for the match dropdown — loaded lazily
    const [allUsers, setAllUsers]           = useState<{ id: string; displayName: string }[]>([])
    const [usersLoaded, setUsersLoaded]     = useState(false)

    const loadUsers = async () => {
        if (usersLoaded) return
        try {
            const res  = await fetch('/api/members')
            const data = await res.json()
            setAllUsers((data.members ?? data ?? []).map((u: any) => ({
                id: u.id,
                displayName: u.guild?.displayName || u.globalName || u.username || u.id,
            })))
            setUsersLoaded(true)
        } catch { /* silently fail — user can still create skeletons */ }
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
                // Pre-populate skeleton as default action for each unmatched user
                const defaultMap: Record<string, ResolveAction> = {}
                for (const u of data.unmatched) {
                    defaultMap[`${u.unit}|${u.name}`] = { csvName: u.name, csvRank: u.rank, unit: u.unit, action: 'skeleton' }
                }
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
            const res  = await fetch('/api/admin/attendance-import/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actions),
            })
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

    const reset = () => {
        setStep('upload'); setAttFiles([]); setImportResult(null)
        setResolveMap({}); setFinalResult(null); setError(null)
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {step === 'upload' && (
                <>
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                        Upload one or more Attendance Tracker CSVs (2024, 2025, 2026 formats all supported).
                        Operations will be matched to existing records, and members matched to Discord accounts.
                        Any unmatched members can be linked or given skeleton accounts.
                    </Typography>
                    <Box>
                        <Typography sx={label}>Attendance Tracker CSV(s)</Typography>
                        <input
                            ref={attRef}
                            type='file'
                            accept='.csv'
                            multiple
                            style={{ display: 'none' }}
                            onChange={e => setAttFiles(Array.from(e.target.files ?? []))}
                        />
                        <Button
                            variant='outlined'
                            startIcon={<CloudUpload />}
                            onClick={() => attRef.current?.click()}
                            fullWidth
                            sx={fileBtn(attFiles.length > 0)}
                        >
                            {attFiles.length === 0
                                ? 'Choose CSV file(s)…'
                                : attFiles.length === 1
                                    ? attFiles[0].name
                                    : `${attFiles.length} files selected`}
                        </Button>
                        {attFiles.length > 1 && (
                            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {attFiles.map(f => (
                                    <Typography key={f.name} fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.4)', pl: 0.5 }}>
                                        · {f.name}
                                    </Typography>
                                ))}
                            </Box>
                        )}
                    </Box>
                    <Button variant='contained' disabled={attFiles.length === 0} onClick={handleImport} sx={redBtn}>
                        Import
                    </Button>
                </>
            )}

            {step === 'loading' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
                    <CircularProgress sx={{ color: 'var(--red)' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                        Parsing CSV and matching members…
                    </Typography>
                </Box>
            )}

            {step === 'resolve' && importResult && (
                <>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Chip label={`${importResult.operationsProcessed} operations processed`} size='small' sx={{ background: 'rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem' }} />
                        <Chip label={`${importResult.membersMatched} members matched`} size='small' sx={{ background: 'rgba(76,175,80,0.15)', color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem' }} />
                        <Chip label={`${importResult.unmatched.length} unmatched`} size='small' sx={{ background: 'rgba(255,152,0,0.15)', color: 'rgba(237,237,237,0.7)', fontSize: '0.7rem' }} />
                    </Box>

                    <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.03em' }}>
                        The following members could not be automatically matched to Discord accounts.
                        Choose to link them to an existing account or create a placeholder skeleton account.
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
                                        <Button
                                            size='small'
                                            variant={action?.action === 'skeleton' ? 'contained' : 'outlined'}
                                            onClick={() => setAction(key, 'skeleton')}
                                            sx={{ fontSize: '0.65rem', letterSpacing: 1.5, textTransform: 'uppercase', flexShrink: 0,
                                                ...(action?.action === 'skeleton' ? { background: 'rgba(219,0,29,0.5)', '&:hover': { background: 'rgba(219,0,29,0.7)' } } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.4)' })
                                            }}
                                        >
                                            Skeleton
                                        </Button>
                                        <Autocomplete
                                            size='small'
                                            options={allUsers}
                                            getOptionLabel={o => o.displayName}
                                            onChange={(_, val) => {
                                                if (val) setAction(key, 'match', val.id)
                                                else setAction(key, 'skeleton')
                                            }}
                                            sx={{ flex: 1 }}
                                            renderInput={params => (
                                                <TextField
                                                    {...params}
                                                    placeholder='Match to Discord user…'
                                                    sx={{
                                                        '& .MuiInputBase-root': { fontSize: '0.75rem', background: 'rgba(255,255,255,0.03)' },
                                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
                                                    }}
                                                />
                                            )}
                                        />
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
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>Resolving unmatched members…</Typography>
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
                                ].map(([lbl, val]) => val !== undefined && (
                                    <Box key={lbl as string} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.45)', letterSpacing: '0.03em' }}>{lbl}</Typography>
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

// ── Tab 2: Application Records (legacy Google Form CSV) ─────────────────────

// Handles quoted fields with internal commas/newlines and "" escape sequences.
function parseAppCSV(text: string): string[][] {
    const rows: string[][] = []
    let i = 0
    const len = text.length
    while (i < len) {
        const row: string[] = []
        rowLoop: while (true) {
            let field = ''
            if (text[i] === '"') {
                i++
                while (i < len) {
                    if (text[i] === '"') {
                        if (text[i + 1] === '"') { field += '"'; i += 2 }
                        else { i++; break }
                    } else { field += text[i++] }
                }
            } else {
                while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') field += text[i++]
            }
            row.push(field)
            if (i >= len || text[i] === '\n' || text[i] === '\r') break rowLoop
            if (text[i] === ',') { i++; continue }
        }
        if (i < len && text[i] === '\r') i++
        if (i < len && text[i] === '\n') i++
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row)
    }
    return rows
}

const APP_COL = { TIMESTAMP: 0, DISCORD: 2, STEAM: 3, AGE: 4, PREV_EXP: 5, EXPERIENCE: 6, HOURS: 7, NIGHTS: 8, OPS_MONTH: 9, PRIMARY: 10, ADDL: 11, DEPTS: 12, GROUPS: 15, REGION: 16 }

function parseAppDate(ts: string): string {
    const [datePart, timePart] = ts.trim().split(' ')
    if (!datePart) return new Date().toISOString()
    const [day, month, year] = datePart.split('/')
    if (!day || !month || !year) return new Date().toISOString()
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart || '00:00:00'}`)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function parseAppAge(s: string): number {
    const l = s.toLowerCase()
    if (l.includes('over')) return 18
    if (l.includes('under')) return 16
    return 0
}

function buildAppNotes(row: string[]): string {
    const parts: string[] = []
    const add = (label: string, idx: number) => { const v = row[idx]?.trim(); if (v) parts.push(`${label}: ${v}`) }
    add('Steam', APP_COL.STEAM)
    add('ARMA Hours', APP_COL.HOURS)
    add('Prior Milsim', APP_COL.PREV_EXP)
    add('Primary Role', APP_COL.PRIMARY)
    add('Additional Roles', APP_COL.ADDL)
    add('Department Interest', APP_COL.DEPTS)
    add('Availability', APP_COL.NIGHTS)
    add('Ops/Month', APP_COL.OPS_MONTH)
    add('Previous Units', APP_COL.GROUPS)
    add('Region', APP_COL.REGION)
    return parts.join('\n')
}

interface AppRecord {
    discordUsername: string; inGameName: string; age: number
    experience: string; submittedAt: string; notes: string
    status: 'pending' | 'reviewing' | 'accepted' | 'rejected'
}

const APP_STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error'> = {
    pending: 'warning', reviewing: 'info', accepted: 'success', rejected: 'error',
}

function ApplicationRecordsTab() {
    const fileRef = useRef<HTMLInputElement>(null)
    const [records, setRecords] = useState<AppRecord[]>([])
    const [defaultStatus, setDefaultStatus] = useState<AppRecord['status']>('pending')
    const [fileName, setFileName] = useState<string | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<{ inserted: number } | null>(null)
    const [importError, setImportError] = useState<string | null>(null)

    function handleFile(file: File) {
        setParseError(null); setImportResult(null); setImportError(null); setFileName(file.name)
        const reader = new FileReader()
        reader.onload = e => {
            const text = e.target?.result as string
            try {
                const rows = parseAppCSV(text)
                if (rows.length < 2) { setParseError('CSV appears empty or has no data rows.'); setRecords([]); return }
                const parsed: AppRecord[] = rows.slice(1)
                    .filter(r => r[APP_COL.DISCORD]?.trim())
                    .map(r => ({
                        discordUsername: r[APP_COL.DISCORD]?.trim() || '',
                        inGameName: '',
                        age: parseAppAge(r[APP_COL.AGE] || ''),
                        experience: r[APP_COL.EXPERIENCE]?.trim() || '',
                        submittedAt: parseAppDate(r[APP_COL.TIMESTAMP] || ''),
                        notes: buildAppNotes(r),
                        status: defaultStatus,
                    }))
                if (parsed.length === 0) { setParseError('No valid records found. Ensure column 3 (Discord name) is populated.'); setRecords([]); return }
                setRecords(parsed)
            } catch {
                setParseError('Failed to parse CSV. Ensure the file uses the standard Google Form export format.')
                setRecords([])
            }
        }
        reader.readAsText(file)
    }

    async function handleImport() {
        setImporting(true); setImportError(null); setImportResult(null)
        try {
            const res = await fetch('/api/admin/j1/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: records.map(r => ({ ...r, status: defaultStatus })) }),
            })
            const data = await res.json()
            if (!res.ok) { setImportError(data.error || 'Import failed.') }
            else { setImportResult({ inserted: data.inserted }); setRecords([]); setFileName(null) }
        } catch {
            setImportError('Network error during import.')
        } finally {
            setImporting(false)
        }
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                Upload a CSV exported from the legacy Google Form application to import past records into the Applications Register.
                Imported records will be assigned the selected status so J1 staff can finalise each entry.
            </Typography>

            {importResult && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CheckCircle sx={{ color: '#4caf50' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>
                        Successfully imported <strong>{importResult.inserted}</strong> record{importResult.inserted !== 1 ? 's' : ''}.
                    </Typography>
                </Box>
            )}

            {records.length === 0 ? (
                <Box>
                    <input ref={fileRef} type='file' accept='.csv,text/csv' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                    <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => fileRef.current?.click()} fullWidth sx={fileBtn(false)}>
                        {fileName ? fileName : 'Choose Application Records CSV…'}
                    </Button>
                    {parseError && <Alert severity='error' sx={{ mt: 1.5, borderRadius: 0, fontSize: '0.78rem' }}>{parseError}</Alert>}
                </Box>
            ) : (
                <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.6)' }}>
                            <strong style={{ color: '#ededed' }}>{records.length}</strong> records parsed from <em>{fileName}</em>
                        </Typography>
                        <Button size='small' onClick={() => { setRecords([]); setFileName(null) }}
                            sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', borderColor: 'rgba(219,0,29,0.32)', letterSpacing: 1 }}>
                            Clear
                        </Button>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ minWidth: 170 }}>
                            <Typography sx={{ ...label, mb: 0.5 }}>Import Status</Typography>
                            <Box
                                component='select'
                                value={defaultStatus}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDefaultStatus(e.target.value as AppRecord['status'])}
                                sx={{
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(219,0,29,0.25)',
                                    color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem', padding: '6px 10px',
                                    width: '100%', cursor: 'pointer', outline: 'none',
                                    '&:focus': { borderColor: 'var(--red)' },
                                }}
                            >
                                <option value='pending'>Pending</option>
                                <option value='reviewing'>Reviewing</option>
                                <option value='accepted'>Accepted</option>
                                <option value='rejected'>Rejected</option>
                            </Box>
                        </Box>
                    </Box>

                    {/* Preview */}
                    <Box sx={{ border: '1px solid rgba(219,0,29,0.22)', overflow: 'hidden' }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px 130px', gap: 1.5, px: 1.5, py: 1, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(219,0,29,0.22)' }}>
                            {['Discord', 'Age', 'Status', 'Submitted'].map(h => (
                                <Typography key={h} fontSize='0.58rem' fontWeight={700} sx={{ letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</Typography>
                            ))}
                        </Box>
                        {records.slice(0, 12).map((r, i) => (
                            <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px 130px', gap: 1.5, px: 1.5, py: 1, alignItems: 'center', borderBottom: '1px solid rgba(219,0,29,0.06)' }}>
                                <Typography fontSize='0.75rem' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.discordUsername}</Typography>
                                <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>{r.age || '—'}</Typography>
                                <Chip label={defaultStatus.toUpperCase()} color={APP_STATUS_COLORS[defaultStatus]} size='small'
                                    sx={{ borderRadius: 0, fontSize: '0.58rem', fontWeight: 700, height: 18 }} />
                                <Typography fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.4)' }}>
                                    {new Date(r.submittedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </Typography>
                            </Box>
                        ))}
                        {records.length > 12 && (
                            <Box sx={{ px: 1.5, py: 1, background: 'rgba(255,255,255,0.01)' }}>
                                <Typography fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.25)' }}>+ {records.length - 12} more records not shown</Typography>
                            </Box>
                        )}
                    </Box>

                    {importError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{importError}</Alert>}

                    <Button variant='contained' disabled={importing} onClick={handleImport}
                        startIcon={importing ? <CircularProgress size={14} color='inherit' /> : <PersonAdd sx={{ fontSize: 16 }} />}
                        sx={{ ...redBtn, alignSelf: 'flex-start' }}>
                        {importing ? 'Importing…' : `Import ${records.length} Records`}
                    </Button>
                </>
            )}
        </Box>
    )
}

// ── Main Import Panel dialog ─────────────────────────────────────────────────

export default function ImportPanel({ open, onClose }: Props) {
    const [tab, setTab] = useState(0)

    const handleClose = () => {
        setTab(0)
        onClose()
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth='sm'
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                },
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                    J4 Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                    Import Panel
                </Typography>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{
                    px: 3,
                    '& .MuiTab-root': { fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', minHeight: 44 },
                    '& .Mui-selected': { color: 'var(--red) !important' },
                    '& .MuiTabs-indicator': { background: 'var(--red)' },
                }}
            >
                <Tab icon={<AccountTree sx={{ fontSize: 16 }} />} iconPosition='start' label='ORBAT & Mastersheet' />
                <Tab icon={<EventAvailable sx={{ fontSize: 16 }} />} iconPosition='start' label='Attendance' />
                <Tab icon={<PersonAdd sx={{ fontSize: 16 }} />} iconPosition='start' label='Application Records' />
            </Tabs>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.08)' }} />

            <DialogContent sx={{ pt: 3 }}>
                {tab === 0 && <OrbatImportTab />}
                {tab === 1 && <AttendanceImportTab />}
                {tab === 2 && <ApplicationRecordsTab />}
            </DialogContent>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={handleClose} size='small' sx={ghostBtn}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}
