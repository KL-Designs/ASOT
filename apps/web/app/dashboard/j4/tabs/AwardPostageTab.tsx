'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Switch, TextField } from '@mui/material'
import ImageUploadField from '@/app/dashboard/_components/ImageUploadField'
import { POSTAGE_STATUS_LABEL, monthLabel } from '@/lib/military/award-postage'

/**
 * J4 → Admin → Awards and Citation Postage (row 384). LT GEN Thomas only;
 * the API refuses everyone else, J4 included. Left: who wants physical awards.
 * Right: what to post, month by month. Second sub-tab: the preference DM.
 */

type Pref = 'yes' | 'no' | 'unassigned'

interface Member {
    userId: string
    name: string
    rank: string
    preference: Pref
    discharged: boolean
    firstAskedAt: string | null
    lastReminderAt: string | null
    nextReminderAt: string | null
    answeredAt: string | null
    answeredBy: string | null
}

interface Item {
    id: string
    userId: string
    userName: string
    awardName: string
    awardType: string
    awardDate: string
    month: string
    carriedFrom: string | null
    status: AwardPostageStatus
    sentAt: string | null
    sentByName: string | null
}

const inputSx = {
    '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.82rem', '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}
const label: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }
const small: React.CSSProperties = { fontSize: '0.66rem', color: 'rgba(237,237,237,0.4)' }
const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const PREF_STYLE: Record<Pref, { label: string; color: string }> = {
    yes: { label: 'Yes', color: '#00c364' },
    no: { label: 'No', color: 'rgba(237,237,237,0.45)' },
    unassigned: { label: 'Unassigned', color: 'var(--amber)' },
}
const STATUS_COLOR: Record<AwardPostageStatus, string> = {
    awaiting_preference: 'var(--amber)',
    ready: 'var(--info)',
    sent: '#00c364',
    declined: 'rgba(237,237,237,0.35)',
}

function pill(active: boolean): React.CSSProperties {
    return {
        padding: '4px 12px', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
        background: active ? 'rgba(219,0,29,0.14)' : 'transparent',
        border: `1px solid ${active ? 'rgba(219,0,29,0.45)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? 'var(--red)' : 'rgba(237,237,237,0.5)',
    }
}

function PostageView() {
    const [data, setData] = useState<{ currentMonth: string; members: Member[]; items: Item[] } | null>(null)
    const [error, setError] = useState<string | null>(null)
    /** Which members the register lists. Discharged is its own filter, on top of the preference. */
    const [show, setShow] = useState<{ yes: boolean; no: boolean; unassigned: boolean; discharged: boolean }>({ yes: true, no: false, unassigned: true, discharged: false })
    const [importOpen, setImportOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [open, setOpen] = useState<Record<string, boolean>>({})
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch('/api/j4/award-postage')
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(setData)
            .catch(s => setError(s === 403 ? 'This page is restricted to LT GEN Thomas.' : 'Could not load postage.'))
    }, [])
    useEffect(load, [load])

    async function post(url: string, body: unknown, key: string) {
        setBusy(key); setError(null)
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'That did not save.'); return }
            load()
        } finally {
            setBusy(null)
        }
    }

    const months = useMemo(() => {
        if (!data) return []
        const byMonth = new Map<string, Map<string, Item[]>>()
        // The current month always shows, even when empty.
        byMonth.set(data.currentMonth, new Map())
        for (const i of data.items) {
            if (i.status === 'declined') continue
            if (!byMonth.has(i.month)) byMonth.set(i.month, new Map())
            const members = byMonth.get(i.month)!
            if (!members.has(i.userId)) members.set(i.userId, [])
            members.get(i.userId)!.push(i)
        }
        return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    }, [data])

    if (!data) return <div className='m-6'>{error ? <Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert> : <CircularProgress size={18} />}</div>

    const q = search.trim().toLowerCase()
    const members = data.members.filter(m => show[m.preference] && (show.discharged || !m.discharged) && (!q || m.name.toLowerCase().includes(q)))
    const counts = { yes: 0, no: 0, unassigned: 0, discharged: 0 }
    for (const m of data.members) {
        if (m.discharged) counts.discharged++
        else counts[m.preference]++
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24, alignItems: 'start' }}>
            {/* Left: preference register */}
            <section className='flex flex-col gap-3'>
                <div className='flex items-baseline justify-between gap-2 flex-wrap'>
                    <span style={label}>Member Physical Award Preference</span>
                    <span style={small}>{counts.yes} yes · {counts.unassigned} unassigned · {counts.no} no · {counts.discharged} discharged</span>
                </div>
                <div className='flex gap-2 items-center flex-wrap'>
                    <TextField size='small' placeholder='Search members' value={search} onChange={e => setSearch(e.target.value)} sx={{ ...inputSx, flex: 1, minWidth: 160 }} />
                    <Button variant='outlined' size='small' onClick={() => setImportOpen(true)}
                        sx={{ borderRadius: 0, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', borderColor: 'rgba(219,0,29,0.4)', color: 'var(--red)' }}>
                        Import
                    </Button>
                </div>
                <div className='flex gap-3 items-center flex-wrap' style={{ marginTop: -6 }}>
                    {([['yes', 'Show Yes'], ['unassigned', 'Show Unassigned'], ['no', 'Show No'], ['discharged', 'Show Discharged']] as const).map(([k, l]) => (
                        <FormControlLabel key={k} sx={{ mr: 0 }}
                            control={<Checkbox size='small' checked={show[k]} onChange={e => setShow({ ...show, [k]: e.target.checked })}
                                sx={{ p: 0.5, color: 'rgba(237,237,237,0.3)', '&.Mui-checked': { color: 'var(--red)' } }} />}
                            label={<span style={{ fontSize: '0.72rem' }}>{l}</span>} />
                    ))}
                </div>
                <div className='flex flex-col' style={{ maxHeight: '70vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {members.map(m => (
                        <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                                    {m.rank ? `${m.rank} ` : ''}{m.name}
                                    {m.discharged && <span style={{ marginLeft: 6, fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Discharged</span>}
                                </div>
                                <div style={small}>
                                    {m.answeredAt
                                        ? `Answered ${date(m.answeredAt)}${m.answeredBy === 'member' ? ' on Discord' : ' (set by hand)'}`
                                        : m.firstAskedAt
                                            ? `Asked ${date(m.firstAskedAt)}${m.lastReminderAt ? `, reminded ${date(m.lastReminderAt)}` : ''}${m.nextReminderAt ? `, next ${date(m.nextReminderAt)}` : ''}`
                                            : 'Not asked yet'}
                                </div>
                            </div>
                            <div className='flex' style={{ gap: 2 }}>
                                {(['yes', 'unassigned', 'no'] as const).map(p => (
                                    <button key={p} type='button' disabled={busy === m.userId}
                                        onClick={() => p !== m.preference && post('/api/j4/award-postage/preference', { userId: m.userId, preference: p }, m.userId)}
                                        style={{
                                            padding: '2px 8px', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                                            background: m.preference === p ? 'rgba(255,255,255,0.06)' : 'transparent',
                                            border: `1px solid ${m.preference === p ? PREF_STYLE[p].color : 'rgba(255,255,255,0.08)'}`,
                                            color: m.preference === p ? PREF_STYLE[p].color : 'rgba(237,237,237,0.3)',
                                        }}>
                                        {PREF_STYLE[p].label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    {!members.length && <div style={{ ...small, padding: 12 }}>No members match.</div>}
                </div>
            </section>

            {/* Right: monthly lists */}
            <section className='flex flex-col gap-3'>
                <span style={label}>Monthly Postage Lists</span>
                {months.map(([month, byMember]) => {
                    const isOpen = open[month] ?? month === data.currentMonth
                    const all = [...byMember.values()].flat()
                    const ready = all.filter(i => i.status === 'ready')
                    return (
                        <div key={month} style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                            <div className='flex items-center gap-3' style={{ padding: '9px 12px' }}>
                                <button type='button' onClick={() => setOpen(o => ({ ...o, [month]: !isOpen }))}
                                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{isOpen ? '▾' : '▸'} {monthLabel(month)}</span>
                                    <span style={{ ...small, marginLeft: 8 }}>{byMember.size} member{byMember.size === 1 ? '' : 's'} · {ready.length} ready</span>
                                </button>
                                {ready.length > 0 && (
                                    <button type='button' disabled={busy === month} onClick={() => post('/api/j4/award-postage/sent', { ids: ready.map(i => i.id) }, month)} style={pill(false)}>
                                        Mark All Sent
                                    </button>
                                )}
                            </div>
                            {isOpen && (
                                <div className='flex flex-col' style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    {!byMember.size && <div style={{ ...small, padding: 12 }}>Nothing to post this month.</div>}
                                    {[...byMember.entries()].map(([uid, items]) => {
                                        const memberReady = items.filter(i => i.status === 'ready')
                                        return (
                                            <div key={uid} style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <div className='flex items-center gap-2'>
                                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, flex: 1 }}>{items[0].userName}</span>
                                                    {memberReady.length > 1 && (
                                                        <button type='button' disabled={busy === uid + month} style={pill(false)}
                                                            onClick={() => post('/api/j4/award-postage/sent', { ids: memberReady.map(i => i.id) }, uid + month)}>
                                                            Mark Sent
                                                        </button>
                                                    )}
                                                </div>
                                                {items.map(i => (
                                                    <div key={i.id} className='flex items-center gap-2 flex-wrap' style={{ padding: '4px 0 0 10px' }}>
                                                        <span style={{ fontSize: '0.74rem', flex: 1, minWidth: 140 }}>{i.awardName} <span style={small}>{i.awardDate}</span></span>
                                                        {i.carriedFrom && <span style={{ ...small, color: 'var(--amber)' }}>Carried over from {monthLabel(i.carriedFrom)}</span>}
                                                        <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: STATUS_COLOR[i.status] }}>
                                                            {POSTAGE_STATUS_LABEL[i.status]}{i.status === 'sent' && i.sentAt ? ` ${date(i.sentAt)}${i.sentByName ? ` by ${i.sentByName}` : ''}` : ''}
                                                        </span>
                                                        {i.status === 'ready' && (
                                                            <button type='button' disabled={busy === i.id} style={pill(false)}
                                                                onClick={() => post('/api/j4/award-postage/sent', { ids: [i.id] }, i.id)}>
                                                                Sent
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </section>
            {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem', gridColumn: '1 / -1' }}>{error}</Alert>}
            <ImportDialog open={importOpen} onClose={changed => { setImportOpen(false); if (changed) load() }} />
        </div>
    )
}

interface MessageConfig {
    dmTitle: string
    dmBody: string
    imageUrl: string
    includeCampaignMedals: boolean
    updatedAt: string | null
    updatedByName: string | null
}

function MessageView() {
    const [form, setForm] = useState<MessageConfig | null>(null)
    const [preview, setPreview] = useState<{ title: string; description: string; image?: { url: string } } | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/j4/award-postage/config')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setForm(d.config); setPreview(d.preview) })
            .catch(() => setError('Could not load the message.'))
    }, [])

    async function save() {
        if (!form) return
        setSaving(true); setError(null); setSaved(false)
        try {
            const res = await fetch('/api/j4/award-postage/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'Saving failed.'); return }
            setForm(d.config); setPreview(d.preview); setSaved(true)
        } finally {
            setSaving(false)
        }
    }

    if (!form || !preview) return <div className='m-6'>{error ? <Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert> : <CircularProgress size={18} />}</div>
    const set = (patch: Partial<MessageConfig>) => { setForm({ ...form, ...patch }); setSaved(false) }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
            <div className='flex flex-col gap-3'>
                <span style={label}>Automated Message</span>
                <span style={{ fontSize: '0.74rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.5 }}>
                    Sent to a member with no preference when they are given a physical award, then every two weeks until they press Yes or No. Awards given together go in one message.
                </span>
                <TextField size='small' label='Title' value={form.dmTitle} onChange={e => set({ dmTitle: e.target.value })} sx={inputSx} />
                <TextField size='small' label='Message' multiline minRows={12} value={form.dmBody} onChange={e => set({ dmBody: e.target.value })} sx={inputSx}
                    helperText='{awards} becomes the list of awards; {name} the member. Discord formatting such as **bold** works.' />
                <ImageUploadField value={form.imageUrl} onChange={url => set({ imageUrl: url })} label='Case colours image' />
                <FormControlLabel control={<Switch size='small' checked={form.includeCampaignMedals} onChange={e => set({ includeCampaignMedals: e.target.checked })} />}
                    label={<span style={{ fontSize: '0.74rem' }}>Include Campaign Medallions</span>} />
                <div className='flex gap-3 items-center'>
                    <Button variant='outlined' size='small' disabled={saving} onClick={save}
                        sx={{ borderRadius: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', borderColor: 'rgba(219,0,29,0.4)', color: 'var(--red)' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                    {saved && <span style={{ fontSize: '0.72rem', color: '#00c364' }}>Saved</span>}
                    {form.updatedByName && form.updatedAt && <span style={small}>Last changed by {form.updatedByName}, {date(form.updatedAt)}</span>}
                </div>
                {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}
            </div>
            <div className='flex flex-col gap-2'>
                <span style={label}>Preview (as saved)</span>
                <div style={{ borderLeft: '4px solid #db001d', background: '#2b2d31', padding: '12px 14px', color: '#dbdee1', fontSize: '0.85rem', lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{preview.title}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{preview.description.replace(/\*\*(.+?)\*\*/g, '$1')}</div>
                    { }
                    {preview.image && <img src={preview.image.url} alt='' style={{ marginTop: 10, maxWidth: '100%', borderRadius: 4 }} />}
                </div>
                <div className='flex gap-2'>
                    <span style={{ padding: '5px 12px', background: '#248046', color: '#fff', fontSize: '0.75rem', borderRadius: 3 }}>Yes, send them</span>
                    <span style={{ padding: '5px 12px', background: '#da373c', color: '#fff', fontSize: '0.75rem', borderRadius: 3 }}>No thanks</span>
                </div>
                <span style={small}>The buttons record Yes or No only. Members send their details to you directly; the website never stores them.</span>
            </div>
        </div>
    )
}

export default function AwardPostageTab() {
    const [sub, setSub] = useState<'postage' | 'message'>('postage')
    return (
        <div className='m-6 mt-4 flex flex-col gap-4'>
            <div className='flex flex-col gap-1'>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Awards and Citation Postage</span>
                <span style={{ fontSize: '0.74rem', color: 'rgba(237,237,237,0.45)' }}>Restricted to LT GEN Thomas. No names, addresses or case colours are stored here.</span>
            </div>
            <div className='flex gap-2'>
                <button type='button' style={pill(sub === 'postage')} onClick={() => setSub('postage')}>Postage</button>
                <button type='button' style={pill(sub === 'message')} onClick={() => setSub('message')}>Automated Message</button>
            </div>
            {sub === 'postage' ? <PostageView /> : <MessageView />}
        </div>
    )
}

interface ImportResult {
    applied: boolean
    rows: number
    matched: number
    changes: { member: string; userId: string; from: Pref; to: Pref }[]
    unmatched: { line: number; member: string; reason: string }[]
}

/**
 * Two columns from J4's own list (member, yes or no), pasted or read from a
 * CSV. Checked first, then applied: nothing changes until Apply is pressed.
 */
function ImportDialog({ open, onClose }: { open: boolean; onClose: (changed: boolean) => void }) {
    const [text, setText] = useState('')
    const [result, setResult] = useState<ImportResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function run(apply: boolean) {
        setBusy(true); setError(null)
        try {
            const res = await fetch('/api/j4/award-postage/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, apply }) })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'Import failed.'); return }
            setResult(d)
            if (apply) { setText(''); onClose(true); setResult(null) }
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onClose={() => !busy && onClose(false)} maxWidth='sm' fullWidth
            PaperProps={{ sx: { background: '#0e0e0e', borderRadius: 0, border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid var(--red)', color: 'inherit' } }}>
            <DialogTitle sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>Import postage preferences</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <span style={small}>Two columns: the member (name as on the website, with or without rank, or Discord ID) and Yes, No or blank. Paste from a spreadsheet or choose a CSV. No addresses.</span>
                <input type='file' accept='.csv,.tsv,.txt,text/csv' style={{ fontSize: '0.72rem' }}
                    onChange={async e => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setResult(null) } }} />
                <TextField multiline minRows={6} maxRows={14} size='small' value={text} placeholder={'J Smith\tYes\nA Brown\tNo'}
                    onChange={e => { setText(e.target.value); setResult(null) }} sx={inputSx} />
                {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.78rem' }}>{error}</Alert>}
                {result && (
                    <div className='flex flex-col gap-2' style={{ fontSize: '0.76rem' }}>
                        <span>{result.rows} rows · {result.matched} matched · <strong>{result.changes.length} will change</strong> · {result.unmatched.length} not matched</span>
                        {result.changes.length > 0 && (
                            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', padding: '6px 10px' }}>
                                {result.changes.map(c => <div key={c.userId} style={small}>{c.member}: {PREF_STYLE[c.from].label} → <span style={{ color: PREF_STYLE[c.to].color }}>{PREF_STYLE[c.to].label}</span></div>)}
                            </div>
                        )}
                        {result.unmatched.length > 0 && (
                            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(245,158,11,0.25)', padding: '6px 10px' }}>
                                {result.unmatched.map(u => <div key={u.line} style={{ ...small, color: 'var(--amber)' }}>Line {u.line}, {u.member}: {u.reason}</div>)}
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size='small' disabled={busy} onClick={() => onClose(false)} sx={{ borderRadius: 0, fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)' }}>Cancel</Button>
                <Button size='small' variant='outlined' disabled={busy || !text.trim()} onClick={() => run(false)}
                    sx={{ borderRadius: 0, fontSize: '0.7rem', borderColor: 'rgba(255,255,255,0.2)', color: 'inherit' }}>Check</Button>
                <Button size='small' variant='contained' disabled={busy || !result || result.changes.length === 0} onClick={() => run(true)}
                    sx={{ borderRadius: 0, fontSize: '0.7rem', background: 'var(--red)', '&:hover': { background: 'var(--red)' } }}>
                    {busy ? 'Working…' : `Apply ${result?.changes.length ?? 0} change${result?.changes.length === 1 ? '' : 's'}`}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
