'use client'

import { useState, useRef } from 'react'
import { Typography, Box, Button, Alert, Chip, CircularProgress } from '@mui/material'
import { CloudUpload, CheckCircle, Error as ErrorIcon, PersonAdd, WarningAmber } from '@mui/icons-material'

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

// ── CSV parser ────────────────────────────────────────────────────────────────

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

interface AppRecord {
    discordUsername: string; inGameName: string; age: number; experience: string
    submittedAt: string; notes: string; status: 'pending' | 'reviewing' | 'accepted' | 'rejected'
    steamUrl?: string; region?: string; armaHours?: string; availableNights?: string
    opsPerMonth?: string; primaryRole?: string; additionalRoles?: string
    departmentInterest?: string; previousUnits?: string; priorMilsim?: string
}

// ── Applications Register helpers ─────────────────────────────────────────────

const REG_COL = { JOIN_DATE: 0, NAME: 3, REJECTED: 4, DISCORD: 5, STEAM_URL: 6, STEAM_ID: 7, DISCORD_ID: 8, RECRUITER: 14, NOTES: 15 }

interface RegisterEntry {
    joinDate: string; inGameName: string; rejected: boolean; discordUsername: string
    steamUrl: string; steamId64: string; discordId: string; recruiter: string; notes: string
}

interface MergedRecord extends AppRecord {
    inGameName: string; discordId?: string; steamId64?: string; recruiter?: string
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

function mergeEntries(register: RegisterEntry[], appRecords: AppRecord[], fallbackStatus: AppRecord['status']): MergedRecord[] {
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
const SOURCE_COLOR: Record<MergedRecord['source'], string> = {
    merged: 'rgba(0,200,80,0.8)', 'register-only': 'rgba(219,160,0,0.8)', 'record-only': 'rgba(237,237,237,0.3)',
}
const SOURCE_LABEL: Record<MergedRecord['source'], string> = {
    merged: 'MATCHED', 'register-only': 'REG ONLY', 'record-only': 'FORM ONLY',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function J1ImportTab() {
    const registerFileRef = useRef<HTMLInputElement>(null)
    const recordsFileRef  = useRef<HTMLInputElement>(null)

    const [registerEntries, setRegisterEntries] = useState<RegisterEntry[]>([])
    const [appRecords, setAppRecords]           = useState<AppRecord[]>([])
    const [registerFileName, setRegisterFileName] = useState<string | null>(null)
    const [recordsFileName, setRecordsFileName]   = useState<string | null>(null)
    const [registerError, setRegisterError]       = useState<string | null>(null)
    const [recordsError, setRecordsError]         = useState<string | null>(null)
    const [fallbackStatus, setFallbackStatus]     = useState<AppRecord['status']>('pending')

    // Duplicate detection
    const [dupesChecked, setDupesChecked]         = useState(false)
    const [checkingDupes, setCheckingDupes]       = useState(false)
    const [duplicateUsernames, setDuplicateUsernames] = useState<Set<string>>(new Set())

    // Import
    const [importing, setImporting]       = useState(false)
    const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(null)
    const [importError, setImportError]   = useState<string | null>(null)
    const [skipDupes, setSkipDupes]       = useState(true)

    function handleRegisterFile(file: File) {
        setRegisterError(null); setImportResult(null); setImportError(null)
        setDupesChecked(false); setDuplicateUsernames(new Set())
        setRegisterFileName(file.name)
        const reader = new FileReader()
        reader.onload = e => {
            try {
                const entries = parseRegister(e.target?.result as string)
                if (entries.length === 0) { setRegisterError('No valid entries found. Check this is the Applications Register CSV.'); setRegisterEntries([]); return }
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
        setDupesChecked(false); setDuplicateUsernames(new Set())
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
                if (parsed.length === 0) { setRecordsError('No valid records found.'); setAppRecords([]); return }
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

    async function checkDuplicates() {
        if (merged.length === 0) return
        setCheckingDupes(true)
        try {
            const usernames = [...new Set(merged.map(r => normalizeDiscord(r.discordUsername)).filter(Boolean))]
            const res  = await fetch('/api/admin/j1/check-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usernames }),
            })
            const data = await res.json()
            setDuplicateUsernames(new Set((data.duplicates ?? []) as string[]))
            setDupesChecked(true)
        } catch {
            setDuplicateUsernames(new Set())
            setDupesChecked(true)
        } finally {
            setCheckingDupes(false)
        }
    }

    const isDupe = (r: MergedRecord) => duplicateUsernames.has(normalizeDiscord(r.discordUsername))

    async function handleImport() {
        setImporting(true); setImportError(null); setImportResult(null)
        const toImport = skipDupes ? merged.filter(r => !isDupe(r)) : merged
        try {
            const res = await fetch('/api/admin/j1/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: toImport }),
            })
            const data = await res.json()
            if (!res.ok) {
                setImportError(data.error || 'Import failed.')
            } else {
                setImportResult({
                    inserted: data.inserted,
                    skipped: skipDupes ? duplicateUsernames.size : 0,
                })
                setRegisterEntries([]); setAppRecords([])
                setRegisterFileName(null); setRecordsFileName(null)
                setDupesChecked(false); setDuplicateUsernames(new Set())
            }
        } catch {
            setImportError('Network error during import.')
        } finally {
            setImporting(false)
        }
    }

    return (
        <Box sx={{ p: { xs: 3, md: 5 }, display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 860 }}>
            <Box>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', mb: 0.5 }}>
                    J1 — Recruiting
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={2} sx={{ textTransform: 'uppercase', mb: 0.5 }}>
                    Application Records Import
                </Typography>
                <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.45)', letterSpacing: '0.03em' }}>
                    Upload the Applications Register and (optionally) the Application Records CSV.
                    The Register provides status, join date, and identity. The Records CSV provides questionnaire details.
                    Records are matched by Discord username. Duplicate detection checks against existing application records before import.
                </Typography>
            </Box>

            {importResult && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CheckCircle sx={{ color: '#4caf50' }} />
                    <Typography fontSize='0.78rem' sx={{ color: 'rgba(237,237,237,0.7)' }}>
                        Imported <strong>{importResult.inserted}</strong> record{importResult.inserted !== 1 ? 's' : ''}
                        {importResult.skipped > 0 ? `, skipped ${importResult.skipped} duplicate${importResult.skipped !== 1 ? 's' : ''}` : ''}.
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
                            {registerFileName ?? 'Choose Applications Register CSV…'}
                        </Button>
                        {registerEntries.length > 0 && (
                            <Button size='small' onClick={() => { setRegisterEntries([]); setRegisterFileName(null); setDupesChecked(false); setDuplicateUsernames(new Set()) }}
                                sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', borderColor: 'rgba(219,0,29,0.32)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                                Clear
                            </Button>
                        )}
                    </Box>
                    {registerEntries.length > 0 && (
                        <Typography fontSize='0.7rem' sx={{ color: 'rgba(0,200,80,0.7)', mt: 0.5 }}>✓ {registerEntries.length} entries loaded</Typography>
                    )}
                    {registerError && <Alert severity='error' sx={{ mt: 0.5, borderRadius: 0, fontSize: '0.75rem' }}>{registerError}</Alert>}
                </Box>

                <Box>
                    <Typography sx={{ ...label, mb: 0.5 }}>Application Records CSV <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.5 }}>(optional)</span></Typography>
                    <input ref={recordsFileRef} type='file' accept='.csv,text/csv' style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleRecordsFile(f) }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button variant='outlined' startIcon={<CloudUpload />} onClick={() => recordsFileRef.current?.click()} sx={{ ...fileBtn(!!recordsFileName), flex: 1 }}>
                            {recordsFileName ?? 'Choose Application Records CSV…'}
                        </Button>
                        {appRecords.length > 0 && (
                            <Button size='small' onClick={() => { setAppRecords([]); setRecordsFileName(null); setDupesChecked(false); setDuplicateUsernames(new Set()) }}
                                sx={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', borderColor: 'rgba(219,0,29,0.32)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                                Clear
                            </Button>
                        )}
                    </Box>
                    {appRecords.length > 0 && (
                        <Typography fontSize='0.7rem' sx={{ color: 'rgba(0,200,80,0.7)', mt: 0.5 }}>✓ {appRecords.length} records loaded</Typography>
                    )}
                    {recordsError && <Alert severity='error' sx={{ mt: 0.5, borderRadius: 0, fontSize: '0.75rem' }}>{recordsError}</Alert>}
                </Box>
            </Box>

            {/* Merge stats + duplicate check + preview */}
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
                        {dupesChecked && duplicateUsernames.size > 0 && (
                            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline' }}>
                                <Typography fontSize='0.78rem' fontWeight={700} sx={{ color: 'rgba(219,0,29,0.9)' }}>{duplicateUsernames.size}</Typography>
                                <Typography fontSize='0.65rem' sx={{ color: 'rgba(219,0,29,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Duplicates</Typography>
                            </Box>
                        )}
                    </Box>

                    {/* Duplicate check */}
                    {!dupesChecked ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Button
                                variant='outlined'
                                startIcon={checkingDupes ? <CircularProgress size={14} color='inherit' /> : <WarningAmber sx={{ fontSize: 16 }} />}
                                onClick={checkDuplicates}
                                disabled={checkingDupes}
                                sx={{ fontSize: '0.7rem', letterSpacing: 1.5, textTransform: 'uppercase', borderColor: 'rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.8)' }}
                            >
                                {checkingDupes ? 'Checking…' : 'Check for Duplicates'}
                            </Button>
                            <Typography fontSize='0.68rem' sx={{ color: 'rgba(237,237,237,0.3)' }}>
                                Recommended before importing — checks against existing application records
                            </Typography>
                        </Box>
                    ) : duplicateUsernames.size > 0 ? (
                        <Box sx={{ p: 1.5, background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.25)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <WarningAmber sx={{ color: 'rgba(219,0,29,0.8)', fontSize: 18 }} />
                                <Typography fontSize='0.75rem' fontWeight={700} sx={{ color: 'rgba(219,0,29,0.9)', letterSpacing: 1, textTransform: 'uppercase' }}>
                                    {duplicateUsernames.size} duplicate{duplicateUsernames.size !== 1 ? 's' : ''} detected
                                </Typography>
                            </Box>
                            <Typography fontSize='0.72rem' sx={{ color: 'rgba(237,237,237,0.5)' }}>
                                These records already exist in the database. They are highlighted below.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <Box
                                    component='select'
                                    value={skipDupes ? 'skip' : 'overwrite'}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSkipDupes(e.target.value === 'skip')}
                                    sx={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(219,0,29,0.3)', color: '#ededed', fontSize: '0.75rem', padding: '5px 10px', cursor: 'pointer', outline: 'none' }}
                                >
                                    <option value='skip'>Skip duplicates (recommended)</option>
                                    <option value='overwrite'>Import all (including duplicates)</option>
                                </Box>
                            </Box>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CheckCircle sx={{ color: '#4caf50', fontSize: 18 }} />
                            <Typography fontSize='0.75rem' sx={{ color: 'rgba(0,200,80,0.8)' }}>No duplicates found — all records are new</Typography>
                        </Box>
                    )}

                    {/* Fallback status */}
                    {recordOnlyCount > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ minWidth: 230 }}>
                                <Typography sx={{ ...label, mb: 0.5 }}>Status for form-only records</Typography>
                                <Box
                                    component='select'
                                    value={fallbackStatus}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFallbackStatus(e.target.value as AppRecord['status'])}
                                    sx={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem', padding: '6px 10px', width: '100%', cursor: 'pointer', outline: 'none', '&:focus': { borderColor: 'var(--red)' } }}
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
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 110px 80px 80px', gap: 1.5, px: 1.5, py: 1, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(219,0,29,0.22)' }}>
                            {['Discord', 'Name', 'Status', 'Join Date', 'Source', 'Dupe?'].map(h => (
                                <Typography key={h} fontSize='0.58rem' fontWeight={700} sx={{ letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</Typography>
                            ))}
                        </Box>
                        {merged.slice(0, 20).map((r, i) => {
                            const dupe = dupesChecked && isDupe(r)
                            return (
                                <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 110px 80px 80px', gap: 1.5, px: 1.5, py: 0.75, alignItems: 'center', borderBottom: '1px solid rgba(219,0,29,0.06)', background: dupe ? 'rgba(219,0,29,0.04)' : undefined }}>
                                    <Typography fontSize='0.72rem' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.discordUsername ? (dupe ? 'rgba(219,0,29,0.7)' : undefined) : 'rgba(237,237,237,0.3)' }}>
                                        {r.discordUsername || '—'}
                                    </Typography>
                                    <Typography fontSize='0.72rem' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.inGameName ? undefined : 'rgba(237,237,237,0.3)' }}>
                                        {r.inGameName || '—'}
                                    </Typography>
                                    <Chip label={r.status.toUpperCase()} color={APP_STATUS_COLORS[r.status]} size='small' sx={{ borderRadius: 0, fontSize: '0.55rem', fontWeight: 700, height: 17 }} />
                                    <Typography fontSize='0.68rem' sx={{ color: 'rgba(237,237,237,0.4)' }}>
                                        {new Date(r.submittedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </Typography>
                                    <Typography fontSize='0.6rem' fontWeight={700} sx={{ color: SOURCE_COLOR[r.source], letterSpacing: '0.05em' }}>
                                        {SOURCE_LABEL[r.source]}
                                    </Typography>
                                    <Typography fontSize='0.6rem' fontWeight={700} sx={{ color: dupe ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.15)', letterSpacing: '0.05em' }}>
                                        {dupesChecked ? (dupe ? 'EXISTS' : '—') : '?'}
                                    </Typography>
                                </Box>
                            )
                        })}
                        {merged.length > 20 && (
                            <Box sx={{ px: 1.5, py: 1, background: 'rgba(255,255,255,0.01)' }}>
                                <Typography fontSize='0.7rem' sx={{ color: 'rgba(237,237,237,0.25)' }}>+ {merged.length - 20} more records not shown</Typography>
                            </Box>
                        )}
                    </Box>

                    {importError && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{importError}</Alert>}

                    {!dupesChecked && (
                        <Typography fontSize='0.68rem' sx={{ color: 'rgba(219,0,29,0.6)' }}>
                            Run duplicate check before importing to avoid adding records that already exist.
                        </Typography>
                    )}

                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <Button
                            variant='contained'
                            disabled={importing}
                            onClick={handleImport}
                            startIcon={importing ? <CircularProgress size={14} color='inherit' /> : <PersonAdd sx={{ fontSize: 16 }} />}
                            sx={{ ...redBtn, alignSelf: 'flex-start' }}
                        >
                            {importing ? 'Importing…' : `Import ${skipDupes && dupesChecked ? merged.length - duplicateUsernames.size : merged.length} Records`}
                        </Button>
                        {!dupesChecked && (
                            <Typography fontSize='0.68rem' sx={{ color: 'rgba(237,237,237,0.3)' }}>(duplicate check not yet run)</Typography>
                        )}
                    </Box>
                </>
            )}
        </Box>
    )
}
