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

// ── Tab 2: Application Register + Records (dual-CSV J1 import) ──────────────

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

function normalizeRegion(raw: string): string {
    const s = raw.toLowerCase()
    if (!s) return raw
    if (s.includes('oceania') || s.includes('australia') || s.startsWith('aus') || s.includes('brisbane') || s.includes('new zealand') || s.includes('pacific island')) return 'Oceania'
    if (s.includes('asia') || s.includes('korea') || s.includes('japan') || s.includes('india') || s.includes('sri lanka') || s.includes('pakistan')) return 'Asia'
    if (s.includes('north america') || s.includes('canada') || s.includes('united states') || s.includes('usa')) return 'North America'
    if (s.includes('south america') || s.includes('central america') || s.includes('latin') || s.includes('north/central/south')) return 'South America'
    if (s.includes('europe')) return 'Europe'
    if (s.includes('middle east')) return 'Middle East'
    if (s.includes('russia') || s.includes('cis')) return 'Russia / CIS'
    if (s.includes('africa')) return 'Africa'
    return raw.trim()
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
    discordUsername: string
    inGameName: string
    age: number
    experience: string
    submittedAt: string
    notes: string
    status: 'pending' | 'reviewing' | 'accepted' | 'rejected'
    steamUrl?: string
    region?: string
    armaHours?: string
    availableNights?: string
    opsPerMonth?: string
    primaryRole?: string
    additionalRoles?: string
    departmentInterest?: string
    previousUnits?: string
    priorMilsim?: string
}

// ── Applications Register helpers ────────────────────────────────────────────

const REG_COL = {
    JOIN_DATE: 0, NAME: 3, REJECTED: 4, DISCORD: 5,
    STEAM_URL: 6, STEAM_ID: 7, DISCORD_ID: 8, RECRUITER: 14, NOTES: 15,
}

interface RegisterEntry {
    joinDate: string
    inGameName: string
    rejected: boolean
    discordUsername: string
    steamUrl: string
    steamId64: string
    discordId: string
    recruiter: string
    notes: string
}

interface MergedRecord extends AppRecord {
    inGameName: string
    discordId?: string
    steamId64?: string
    recruiter?: string
    source: 'register-only' | 'record-only' | 'merged'
}

function parseRegisterDate(s: string): string {
    const d = new Date(s.trim())
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function parseRegister(text: string): RegisterEntry[] {
    const rows = parseAppCSV(text)
    return rows.slice(1)
        .filter(r => {
            const date = r[REG_COL.JOIN_DATE]?.trim()
            if (!date) return false
            // Skip year-only rows like "2020", "2021" etc.
            return !/^\d{4}$/.test(date)
        })
        .map(r => ({
            joinDate:       parseRegisterDate(r[REG_COL.JOIN_DATE] || ''),
            inGameName:     r[REG_COL.NAME]?.trim() || '',
            rejected:       (r[REG_COL.REJECTED] || '').trim().toUpperCase() === 'TRUE',
            discordUsername:r[REG_COL.DISCORD]?.trim() || '',
            steamUrl:       r[REG_COL.STEAM_URL]?.trim() || '',
            steamId64:      r[REG_COL.STEAM_ID]?.trim() || '',
            discordId:      r[REG_COL.DISCORD_ID]?.trim() || '',
            recruiter:      r[REG_COL.RECRUITER]?.trim() || '',
            notes:          r[REG_COL.NOTES]?.trim() || '',
        }))
}

function normalizeDiscord(s: string): string {
    return s.toLowerCase().replace(/#\d+$/, '').trim()
}

function mergeEntries(
    register: RegisterEntry[],
    appRecords: AppRecord[],
    fallbackStatus: AppRecord['status'],
): MergedRecord[] {
    const recByDiscord = new Map<string, AppRecord>()
    for (const r of appRecords) {
        const key = normalizeDiscord(r.discordUsername)
        if (key) recByDiscord.set(key, r)
    }

    const out: MergedRecord[] = []

    for (const reg of register) {
        const key = normalizeDiscord(reg.discordUsername)
        const rec = key ? recByDiscord.get(key) : undefined

        const merged: MergedRecord = {
            discordUsername: reg.discordUsername || rec?.discordUsername || '',
            inGameName:      reg.inGameName,
            status:          reg.rejected ? 'rejected' : 'accepted',
            submittedAt:     reg.joinDate,
            notes:           reg.notes,
            age:             rec?.age ?? 0,
            experience:      rec?.experience ?? '',
            ...(rec?.armaHours        && { armaHours:        rec.armaHours }),
            ...(rec?.availableNights  && { availableNights:  rec.availableNights }),
            ...(rec?.opsPerMonth      && { opsPerMonth:      rec.opsPerMonth }),
            ...(rec?.primaryRole      && { primaryRole:      rec.primaryRole }),
            ...(rec?.additionalRoles  && { additionalRoles:  rec.additionalRoles }),
            ...(rec?.departmentInterest && { departmentInterest: rec.departmentInterest }),
            ...(rec?.previousUnits    && { previousUnits:    rec.previousUnits }),
            ...(rec?.region           && { region:           rec.region }),
            ...(rec?.priorMilsim      && { priorMilsim:      rec.priorMilsim }),
            steamUrl:  rec?.steamUrl || reg.steamUrl || undefined,
            ...(reg.steamId64  && { steamId64:  reg.steamId64 }),
            ...(reg.discordId  && { discordId:  reg.discordId }),
            ...(reg.recruiter  && { recruiter:  reg.recruiter }),
            source: rec ? 'merged' : 'register-only',
        }

        if (merged.discordUsername || merged.inGameName) out.push(merged)
        if (key && rec) recByDiscord.delete(key)
    }

    for (const rec of recByDiscord.values()) {
        out.push({ ...rec, inGameName: '', status: fallbackStatus, source: 'record-only' })
    }

    return out
}

const APP_STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error'> = {
    pending: 'warning', reviewing: 'info', accepted: 'success', rejected: 'error',
}

function ApplicationRecordsTab() {
    const registerFileRef = useRef<HTMLInputElement>(null)
    const recordsFileRef  = useRef<HTMLInputElement>(null)

    const [registerEntries, setRegisterEntries] = useState<RegisterEntry[]>([])
    const [appRecords, setAppRecords]           = useState<AppRecord[]>([])
    const [registerFileName, setRegisterFileName] = useState<string | null>(null)
    const [recordsFileName, setRecordsFileName]   = useState<string | null>(null)
    const [registerError, setRegisterError]       = useState<string | null>(null)
    const [recordsError, setRecordsError]         = useState<string | null>(null)
    const [fallbackStatus, setFallbackStatus]     = useState<AppRecord['status']>('pending')
    const [importing, setImporting]               = useState(false)
    const [importResult, setImportResult]         = useState<{ inserted: number } | null>(null)
    const [importError, setImportError]           = useState<string | null>(null)

    function handleRegisterFile(file: File) {
        setRegisterError(null); setImportResult(null); setImportError(null)
        setRegisterFileName(file.name)
        const reader = new FileReader()
        reader.onload = e => {
            try {
                const entries = parseRegister(e.target?.result as string)
                if (entries.length === 0) { setRegisterError('No valid entries found. Check the file is the Applications Register CSV.'); setRegisterEntries([]); return }
                setRegisterEntries(entries)
            } catch {
                setRegisterError('Failed to parse Applications Register CSV.')
                setRegisterEntries([])
            }
        }
        reader.readAsText(file)
    }

    function handleRecordsFile(file: File) {
        setRecordsError(null); setImportResult(null); setImportError(null)
        setRecordsFileName(file.name)
        const reader = new FileReader()
        reader.onload = e => {
            const text = e.target?.result as string
            try {
                const rows = parseAppCSV(text)
                if (rows.length < 2) { setRecordsError('CSV appears empty or has no data rows.'); setAppRecords([]); return }
                const parsed: AppRecord[] = rows.slice(1)
                    .filter(r => r[APP_COL.DISCORD]?.trim())
                    .map(r => {
                        const rec: AppRecord = {
                            discordUsername: r[APP_COL.DISCORD]?.trim() || '',
                            inGameName: '',
                            age: parseAppAge(r[APP_COL.AGE] || ''),
                            experience: r[APP_COL.EXPERIENCE]?.trim() || '',
                            submittedAt: parseAppDate(r[APP_COL.TIMESTAMP] || ''),
                            notes: '',
                            status: fallbackStatus,
                        }
                        const steam = r[APP_COL.STEAM]?.trim(); if (steam) rec.steamUrl = steam
                        const region = r[APP_COL.REGION]?.trim(); if (region) rec.region = normalizeRegion(region)
                        const hours = r[APP_COL.HOURS]?.trim(); if (hours) rec.armaHours = hours
                        const nights = r[APP_COL.NIGHTS]?.trim(); if (nights) rec.availableNights = nights
                        const ops = r[APP_COL.OPS_MONTH]?.trim(); if (ops) rec.opsPerMonth = ops
                        const primary = r[APP_COL.PRIMARY]?.trim(); if (primary) rec.primaryRole = primary
                        const addl = r[APP_COL.ADDL]?.trim(); if (addl) rec.additionalRoles = addl
                        const depts = r[APP_COL.DEPTS]?.trim(); if (depts) rec.departmentInterest = depts
                        const groups = r[APP_COL.GROUPS]?.trim(); if (groups) rec.previousUnits = groups
                        const prevExp = r[APP_COL.PREV_EXP]?.trim(); if (prevExp) rec.priorMilsim = prevExp
                        return rec
                    })
                if (parsed.length === 0) { setRecordsError('No valid records found. Ensure column 3 (Discord name) is populated.'); setAppRecords([]); return }
                setAppRecords(parsed)
            } catch {
                setRecordsError('Failed to parse Application Records CSV.')
                setAppRecords([])
            }
        }
        reader.readAsText(file)
    }

    const merged = mergeEntries(registerEntries, appRecords, fallbackStatus)
    const matchedCount      = merged.filter(r => r.source === 'merged').length
    const registerOnlyCount = merged.filter(r => r.source === 'register-only').length
    const recordOnlyCount   = merged.filter(r => r.source === 'record-only').length
    const hasData = merged.length > 0

    const SOURCE_COLOR: Record<MergedRecord['source'], string> = {
        merged:          'rgba(0,200,80,0.8)',
        'register-only': 'rgba(219,160,0,0.8)',
        'record-only':   'rgba(237,237,237,0.3)',
    }
    const SOURCE_LABEL: Record<MergedRecord['source'], string> = {
        merged: 'MATCHED', 'register-only': 'REG ONLY', 'record-only': 'FORM ONLY',
    }

    async function handleImport() {
        setImporting(true); setImportError(null); setImportResult(null)
        try {
            const res = await fetch('/api/admin/j1/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: merged }),
            })
            const data = await res.json()
            if (!res.ok) { setImportError(data.error || 'Import failed.') }
            else {
                setImportResult({ inserted: data.inserted })
                setRegisterEntries([]); setAppRecords([])
                setRegisterFileName(null); setRecordsFileName(null)
            }
        } catch {
            setImportError('Network error during import.')
        } finally {
            setImporting(false)
        }
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.04em' }}>
                Upload the Applications Register and (optionally) the Application Records CSV together.
                The Register provides status, join date, and identity fields. The Records CSV provides questionnaire details.
                Records are matched by Discord username.
            </Typography>

            {importResult && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CheckCircle sx={{ color: '#4caf50' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>
                        Successfully imported <strong>{importResult.inserted}</strong> record{importResult.inserted !== 1 ? 's' : ''}.
                    </Typography>
                </Box>
            )}

            {/* File inputs */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box>
                    <Typography sx={{ ...label, mb: 0.5 }}>Applications Register CSV</Typography>
                    <input ref={registerFileRef} type='file' accept='.csv,text/csv' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleRegisterFile(f) }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => registerFileRef.current?.click()} sx={{ ...fileBtn(!!registerFileName), flex: 1 }}>
                            {registerFileName ? registerFileName : 'Choose Applications Register CSV…'}
                        </Button>
                        {registerEntries.length > 0 && (
                            <Button size='small' onClick={() => { setRegisterEntries([]); setRegisterFileName(null) }}
                                sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', borderColor: 'rgba(219,0,29,0.32)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                                Clear
                            </Button>
                        )}
                    </Box>
                    {registerEntries.length > 0 && (
                        <Typography fontSize='0.7rem' sx={{ color: 'rgba(0,200,80,0.7)', mt: 0.5 }}>
                            ✓ {registerEntries.length} entries loaded
                        </Typography>
                    )}
                    {registerError && <Alert severity='error' sx={{ mt: 0.5, borderRadius: 0, fontSize: '0.75rem' }}>{registerError}</Alert>}
                </Box>

                <Box>
                    <Typography sx={{ ...label, mb: 0.5 }}>Application Records CSV <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.5 }}>(optional)</span></Typography>
                    <input ref={recordsFileRef} type='file' accept='.csv,text/csv' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleRecordsFile(f) }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => recordsFileRef.current?.click()} sx={{ ...fileBtn(!!recordsFileName), flex: 1 }}>
                            {recordsFileName ? recordsFileName : 'Choose Application Records CSV…'}
                        </Button>
                        {appRecords.length > 0 && (
                            <Button size='small' onClick={() => { setAppRecords([]); setRecordsFileName(null) }}
                                sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', borderColor: 'rgba(219,0,29,0.32)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                                Clear
                            </Button>
                        )}
                    </Box>
                    {appRecords.length > 0 && (
                        <Typography fontSize='0.7rem' sx={{ color: 'rgba(0,200,80,0.7)', mt: 0.5 }}>
                            ✓ {appRecords.length} records loaded
                        </Typography>
                    )}
                    {recordsError && <Alert severity='error' sx={{ mt: 0.5, borderRadius: 0, fontSize: '0.75rem' }}>{recordsError}</Alert>}
                </Box>
            </Box>

            {/* Merge stats + preview */}
            {hasData && (
                <>
                    {/* Stats banner */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, px: 1.5, py: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(219,0,29,0.15)' }}>
                        {[
                            ['Total',         merged.length,      'rgba(237,237,237,0.6)'],
                            ['Matched',        matchedCount,       'rgba(0,200,80,0.7)'],
                            ['Register Only',  registerOnlyCount,  'rgba(219,160,0,0.7)'],
                            ['Form Only',      recordOnlyCount,    'rgba(237,237,237,0.35)'],
                        ].map(([lbl, val, color]) => (
                            <Box key={lbl as string} sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline' }}>
                                <Typography fontSize='0.78rem' fontWeight={700} sx={{ color }}>{val}</Typography>
                                <Typography fontSize='0.65rem' sx={{ color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{lbl}</Typography>
                            </Box>
                        ))}
                    </Box>

                    {/* Fallback status for form-only records */}
                    {recordOnlyCount > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ minWidth: 230 }}>
                                <Typography sx={{ ...label, mb: 0.5 }}>Status for form-only records</Typography>
                                <Box
                                    component='select'
                                    value={fallbackStatus}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFallbackStatus(e.target.value as AppRecord['status'])}
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
                    )}

                    {/* Preview table */}
                    <Box sx={{ border: '1px solid rgba(219,0,29,0.22)', overflow: 'hidden' }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 110px 80px', gap: 1.5, px: 1.5, py: 1, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(219,0,29,0.22)' }}>
                            {['Discord', 'Name', 'Status', 'Join Date', 'Source'].map(h => (
                                <Typography key={h} fontSize='0.58rem' fontWeight={700} sx={{ letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</Typography>
                            ))}
                        </Box>
                        {merged.slice(0, 15).map((r, i) => (
                            <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 110px 80px', gap: 1.5, px: 1.5, py: 0.75, alignItems: 'center', borderBottom: '1px solid rgba(219,0,29,0.06)' }}>
                                <Typography fontSize='0.72rem' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.discordUsername ? undefined : 'rgba(237,237,237,0.3)' }}>
                                    {r.discordUsername || '—'}
                                </Typography>
                                <Typography fontSize='0.72rem' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.inGameName ? undefined : 'rgba(237,237,237,0.3)' }}>
                                    {r.inGameName || '—'}
                                </Typography>
                                <Chip label={r.status.toUpperCase()} color={APP_STATUS_COLORS[r.status]} size='small'
                                    sx={{ borderRadius: 0, fontSize: '0.55rem', fontWeight: 700, height: 17 }} />
                                <Typography fontSize='0.68rem' sx={{ color: 'rgba(237,237,237,0.4)' }}>
                                    {new Date(r.submittedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </Typography>
                                <Typography fontSize='0.6rem' fontWeight={700} sx={{ color: SOURCE_COLOR[r.source], letterSpacing: '0.05em' }}>
                                    {SOURCE_LABEL[r.source]}
                                </Typography>
                            </Box>
                        ))}
                        {merged.length > 15 && (
                            <Box sx={{ px: 1.5, py: 1, background: 'rgba(255,255,255,0.01)' }}>
                                <Typography fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.25)' }}>+ {merged.length - 15} more records not shown</Typography>
                            </Box>
                        )}
                    </Box>

                    {importError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{importError}</Alert>}

                    <Button variant='contained' disabled={importing} onClick={handleImport}
                        startIcon={importing ? <CircularProgress size={14} color='inherit' /> : <PersonAdd sx={{ fontSize: 16 }} />}
                        sx={{ ...redBtn, alignSelf: 'flex-start' }}>
                        {importing ? 'Importing…' : `Import ${merged.length} Records`}
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
