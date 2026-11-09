'use client'

import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, MenuItem, TextField, Typography } from '@mui/material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

/**
 * Rows 329 and 330: AAR Reports. Fix, Improve and Sustain rolled up by call
 * sign, platoon or company across a mission, a campaign, or the last six or
 * twelve months, with an AI summary per unit when AI is on and the raw
 * entries either way. Commendations are listed beneath, never summarised,
 * with a copyable post for Monday.
 */

type Scope = 'mission' | 'campaign' | '6m' | '1y'
type Level = 'section' | 'platoon' | 'company'

interface Entry {
    id: string; operationTitle: string; operationDate: string; name: string; section: string
    fix: string; improve: string; sustain: string
}
interface Summary { text: string; generatedAt: string; generatedByName: string; stale: boolean }
interface Group { unit: string; entries: Entry[]; summary: Summary | null }
interface Commendation { id: string; operationTitle: string; authorName: string; section: string; targetType: 'member' | 'callsign'; targetName: string; wording: string }
interface Payload {
    levels: Level[]
    level: Level | null
    options: { operations: { id: string; title: string; date: string }[]; campaigns: { id: string; title: string }[] }
    operationCount?: number
    aiEnabled: boolean
    groups: Group[]
    commendations: Commendation[]
    commendationsPost: string
}

const SCOPE_LABEL: Record<Scope, string> = { mission: 'Mission', campaign: 'Campaign', '6m': 'Last 6 months', '1y': 'Last 12 months' }
const LEVEL_LABEL: Record<Level, string> = { section: 'Call sign', platoon: 'Platoon', company: 'Company' }

const inputSx = {
    minWidth: 180,
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.8rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.8rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

const panel = { border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.03)' }
const label = { fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'rgba(237,237,237,0.45)' }

export default function AarReportsTab() {
    const [scope, setScope] = useState<Scope>('6m')
    const [ref, setRef] = useState('')
    const [level, setLevel] = useState<Level | ''>('')
    const [data, setData] = useState<Payload | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const q = new URLSearchParams({ scope, ref, ...(level ? { level } : {}) })
            const res = await fetch(`/api/aar-reports?${q}`)
            const body = await res.json()
            if (!res.ok) throw new Error(body.error ?? 'Could not load the reports')
            setData(body)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the reports')
        } finally {
            setLoading(false)
        }
    }, [scope, ref, level])

    useEffect(() => { load() }, [load])

    async function summarise(unit: string, force: boolean) {
        if (!data?.level) return
        setBusy(unit)
        setError(null)
        try {
            const res = await fetch('/api/aar-reports/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope, ref, level: data.level, unit, force }),
            })
            const body = await res.json()
            if (!res.ok) throw new Error(body.error ?? 'The summary could not be made')
            setData(d => d && { ...d, groups: d.groups.map(g => g.unit === unit ? { ...g, summary: body } : g) })
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The summary could not be made')
        } finally {
            setBusy(null)
        }
    }

    async function copyPost() {
        if (!data?.commendationsPost) return
        await navigator.clipboard.writeText(data.commendationsPost).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    if (loading && !data) return <div className='p-6'><TacticalSkeleton /></div>

    if (data && !data.level) {
        return (
            <div className='p-6'>
                <Alert severity='info' sx={{ borderRadius: 0 }}>
                    AAR Reports are read by section seniors for their own call sign, by platoon HQ for their platoon, and by CHQ and J4 for the company. Your ORBAT position does not cover any of those.
                </Alert>
            </div>
        )
    }

    const needsRef = scope === 'mission' || scope === 'campaign'
    const refOptions = scope === 'mission'
        ? (data?.options.operations ?? []).map(o => ({ id: o.id, title: `${o.title} · ${new Date(o.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}` }))
        : (data?.options.campaigns ?? [])

    return (
        <div className='p-6 flex flex-col gap-4'>
            <div className='flex flex-wrap gap-3 items-center'>
                <TextField select size='small' label='Scope' value={scope} sx={inputSx}
                    onChange={e => { setScope(e.target.value as Scope); setRef('') }}>
                    {(Object.keys(SCOPE_LABEL) as Scope[]).map(s => <MenuItem key={s} value={s}>{SCOPE_LABEL[s]}</MenuItem>)}
                </TextField>
                {needsRef && (
                    <TextField select size='small' label={scope === 'mission' ? 'Operation' : 'Campaign'} value={ref} sx={{ ...inputSx, minWidth: 260 }}
                        onChange={e => setRef(e.target.value)}>
                        {refOptions.map(o => <MenuItem key={o.id} value={o.id}>{o.title}</MenuItem>)}
                    </TextField>
                )}
                <TextField select size='small' label='Level' value={data?.level ?? ''} sx={inputSx}
                    onChange={e => setLevel(e.target.value as Level)}>
                    {(data?.levels ?? []).map(l => <MenuItem key={l} value={l}>{LEVEL_LABEL[l]}</MenuItem>)}
                </TextField>
                {loading && <CircularProgress size={18} sx={{ color: 'var(--red)' }} />}
                {data && !needsRef && (
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)' }}>
                        {data.operationCount ?? 0} operations
                    </Typography>
                )}
            </div>

            {error && <Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert>}
            {needsRef && !ref && <Alert severity='info' sx={{ borderRadius: 0 }}>Pick {scope === 'mission' ? 'an operation' : 'a campaign'}.</Alert>}
            {data && !data.aiEnabled && (
                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.45)' }}>
                    AI is switched off, so the entries are shown as written.
                </Typography>
            )}

            {data && (!needsRef || ref) && !data.groups.length && (
                <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.5)' }}>No AAR entries in this scope that you can read.</Typography>
            )}

            {data?.groups.map(g => {
                const shown = data.aiEnabled ? open === g.unit : open !== g.unit
                return (
                <div key={g.unit} className='flex flex-col gap-3 p-4' style={panel}>
                    <div className='flex items-center gap-3'>
                        <Typography fontWeight={700} fontSize='0.85rem' letterSpacing={2} style={{ textTransform: 'uppercase' }}>{g.unit}</Typography>
                        <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)' }}>{g.entries.length} entries</Typography>
                        <div className='flex-1' />
                        {data.aiEnabled && (
                            <Button size='small' disabled={busy === g.unit} onClick={() => summarise(g.unit, !!g.summary)}
                                sx={{ borderRadius: 0, fontSize: '0.68rem', letterSpacing: 1.5, color: 'var(--red)' }}>
                                {busy === g.unit ? 'Summarising…' : g.summary ? (g.summary.stale ? 'Update summary' : 'Regenerate') : 'Summarise'}
                            </Button>
                        )}
                        <Button size='small' onClick={() => setOpen(open === g.unit ? null : g.unit)}
                            sx={{ borderRadius: 0, fontSize: '0.68rem', letterSpacing: 1.5, color: 'rgba(237,237,237,0.7)' }}>
                            {shown ? 'Hide entries' : 'Show entries'}
                        </Button>
                    </div>

                    {g.summary && (
                        <div className='flex flex-col gap-1'>
                            <span style={label}>
                                Summary · {g.summary.generatedByName} · {new Date(g.summary.generatedAt).toLocaleDateString('en-AU')}
                                {g.summary.stale && ' · out of date, entries have changed'}
                            </span>
                            <Typography component='div' fontSize='0.8rem' style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{g.summary.text}</Typography>
                        </div>
                    )}

                    {/* Raw entries: always open when AI is off, on request otherwise. */}
                    {shown && (
                        <div className='flex flex-col gap-2'>
                            {g.entries.map(e => (
                                <div key={e.id} className='p-3 flex flex-col gap-1' style={{ borderLeft: '2px solid rgba(219,0,29,0.4)', background: 'rgba(0,0,0,0.15)' }}>
                                    <span style={label}>{e.operationTitle} · {e.section} · {e.name}</span>
                                    {(['fix', 'improve', 'sustain'] as const).map(k => e[k].trim() && (
                                        <Typography key={k} fontSize='0.78rem' style={{ whiteSpace: 'pre-wrap' }}>
                                            <strong style={{ textTransform: 'capitalize' }}>{k}:</strong> {e[k]}
                                        </Typography>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                )
            })}

            {data && data.commendations.length > 0 && (
                <div className='flex flex-col gap-3 p-4' style={panel}>
                    <div className='flex items-center gap-3'>
                        <Typography fontWeight={700} fontSize='0.85rem' letterSpacing={2} style={{ textTransform: 'uppercase' }}>Commendations</Typography>
                        <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)' }}>{data.commendations.length}</Typography>
                        <div className='flex-1' />
                        <Button size='small' onClick={copyPost} sx={{ borderRadius: 0, fontSize: '0.68rem', letterSpacing: 1.5, color: 'var(--red)' }}>
                            {copied ? 'Copied' : 'Copy Discord post'}
                        </Button>
                    </div>
                    {data.commendations.map(c => (
                        <div key={c.id} className='p-3 flex flex-col gap-1' style={{ borderLeft: '2px solid rgba(219,0,29,0.4)', background: 'rgba(0,0,0,0.15)' }}>
                            <span style={label}>{c.operationTitle} · {c.section || 'Staff'} · from {c.authorName}</span>
                            <Typography fontSize='0.8rem'><strong>{c.targetName}</strong>{c.targetType === 'callsign' ? ' (call sign)' : ''}</Typography>
                            <Typography fontSize='0.78rem' style={{ whiteSpace: 'pre-wrap' }}>{c.wording}</Typography>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
