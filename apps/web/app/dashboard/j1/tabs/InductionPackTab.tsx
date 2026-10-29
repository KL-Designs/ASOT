'use client'

import { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, IconButton, TextField } from '@mui/material'
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material'
import ImageUploadField from '@/app/dashboard/_components/ImageUploadField'

/**
 * J1 → Admin → Induction Pack (row 213, Part C). The DM J1 sends a new member
 * and the website induction it links to. Every J1 member can see it and the
 * numbers; J1 leads edit it. Steps are data: add, reorder or remove them here.
 */

type Link = { label: string; url: string }
type Step = { id: string; title: string; body: string; links?: Link[] }

interface Config {
    dmTitle: string
    dmBody: string
    welcomeText: string
    imageUrl: string
    links: Link[]
    selectionText: string
    calendarUrl: string
    steps: Step[]
    updatedAt: string | null
    updatedByName: string | null
}

interface State {
    config: Config
    canEdit: boolean
    next: { at: string; instanceRef: string } | null
    preview: { title: string; description: string; image?: { url: string } }
    stats: { sent: number; opened: number; completed: number; selectionInterest: number }
}

const inputSx = {
    '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.82rem', '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}
const label: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function slug(title: string, taken: Set<string>): string {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'step'
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    return id
}

function renderTimestamps(text: string): string {
    return text.replace(/<t:(\d+):([FRfDt])>/g, (_, unix: string, style: string) => {
        const d = new Date(Number(unix) * 1000)
        if (style === 'R') {
            const days = Math.round((d.getTime() - Date.now()) / 86_400_000)
            return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : days === 0 ? 'today' : `${-days} days ago`
        }
        return d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })
    })
}

function LinksEditor({ value, onChange, disabled }: { value: Link[]; onChange: (v: Link[]) => void; disabled: boolean }) {
    return (
        <div className='flex flex-col gap-2'>
            {value.map((l, i) => (
                <div key={i} className='flex gap-2 items-center'>
                    <TextField size='small' label='Label' value={l.label} disabled={disabled} sx={{ ...inputSx, flex: 1 }}
                        onChange={e => onChange(value.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                    <TextField size='small' label='URL' value={l.url} disabled={disabled} sx={{ ...inputSx, flex: 2 }}
                        onChange={e => onChange(value.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                    {!disabled && <IconButton size='small' onClick={() => onChange(value.filter((_, j) => j !== i))}><Delete sx={{ fontSize: 16 }} /></IconButton>}
                </div>
            ))}
            {!disabled && value.length < 10 && (
                <button type='button' onClick={() => onChange([...value, { label: '', url: '' }])}
                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.72rem', color: 'rgba(219,0,29,0.8)' }}>
                    + Add link
                </button>
            )}
        </div>
    )
}

export default function InductionPackTab() {
    const [state, setState] = useState<State | null>(null)
    const [form, setForm] = useState<Config | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        fetch('/api/admin/j1/induction-pack')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then((d: State) => { setState(d); setForm(d.config) })
            .catch(() => setError('Could not load the Induction Pack.'))
    }, [])

    async function save() {
        if (!form) return
        setSaving(true); setError(null); setSaved(false)
        try {
            const res = await fetch('/api/admin/j1/induction-pack', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
            })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'Saving failed.'); return }
            setState(d); setForm(d.config); setSaved(true)
        } finally {
            setSaving(false)
        }
    }

    if (!form || !state) {
        return <div className='m-6'>{error ? <Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert> : <CircularProgress size={18} />}</div>
    }

    const ro = !state.canEdit
    const set = (patch: Partial<Config>) => { setForm({ ...form, ...patch }); setSaved(false) }
    const setStep = (i: number, patch: Partial<Step>) => set({ steps: form.steps.map((s, j) => j === i ? { ...s, ...patch } : s) })
    const move = (i: number, by: number) => {
        const steps = [...form.steps]
        const [s] = steps.splice(i, 1)
        steps.splice(i + by, 0, s)
        set({ steps })
    }

    return (
        <div className='m-6 mt-4 flex flex-col gap-5' style={{ maxWidth: 960 }}>
            <div className='flex flex-col gap-1'>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Induction Pack</span>
                <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.5 }}>
                    The DM sent from the recruit wizard&apos;s finish screen or an application, and the website induction it links to.
                    {ro && ' Only J1 leads can change it.'}
                </span>
            </div>

            <div className='flex gap-6 flex-wrap' style={{ fontSize: '0.8rem' }}>
                {([['Sent', state.stats.sent], ['Opened', state.stats.opened], ['Completed', state.stats.completed], ['Selection interest', state.stats.selectionInterest]] as const).map(([k, v]) => (
                    <div key={k} className='flex flex-col'>
                        <span style={label}>{k}</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{v}</span>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                <div className='flex flex-col gap-3'>
                    <span style={label}>Discord DM</span>
                    <TextField label='Title' size='small' value={form.dmTitle} disabled={ro} onChange={e => set({ dmTitle: e.target.value })} sx={inputSx} />
                    <TextField label='Message' size='small' multiline minRows={7} value={form.dmBody} disabled={ro} onChange={e => set({ dmBody: e.target.value })} sx={inputSx}
                        helperText='{name}, {selectionDate}, {inductionUrl}, {selectionUrl} and {calendarUrl} are filled in when it is sent.' />
                    <ImageUploadField value={form.imageUrl} onChange={url => !ro && set({ imageUrl: url })} label='Image (DM and induction page)' />
                    <TextField label='Unit Training Calendar link' size='small' value={form.calendarUrl} disabled={ro} onChange={e => set({ calendarUrl: e.target.value })} sx={inputSx} />
                </div>
                <div className='flex flex-col gap-2'>
                    <span style={label}>DM preview</span>
                    <div style={{ borderLeft: '4px solid #db001d', background: '#2b2d31', padding: '12px 14px', color: '#dbdee1', fontSize: '0.85rem', lineHeight: 1.45 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{state.preview.title}</div>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderTimestamps(state.preview.description)}</div>
                        { }
                        {state.preview.image && <img src={state.preview.image.url} alt='' style={{ marginTop: 10, maxWidth: '100%', borderRadius: 4 }} />}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>
                        Preview as saved. Next Selection: {state.next ? `${state.next.instanceRef}, ${fmt(state.next.at)}` : 'none scheduled, so the DM says "To be confirmed"'}.
                    </span>
                </div>
            </div>

            <div className='flex flex-col gap-3'>
                <span style={label}>Induction page</span>
                <TextField label='Welcome text' size='small' multiline minRows={2} value={form.welcomeText} disabled={ro} onChange={e => set({ welcomeText: e.target.value })} sx={inputSx} />
                <span style={{ ...label, fontSize: '0.55rem' }}>Useful links</span>
                <LinksEditor value={form.links} disabled={ro} onChange={links => set({ links })} />
                <TextField label='Selection section text' size='small' multiline minRows={2} value={form.selectionText} disabled={ro} onChange={e => set({ selectionText: e.target.value })} sx={inputSx} />
            </div>

            <div className='flex flex-col gap-3'>
                <span style={label}>Steps ({form.steps.length})</span>
                {form.steps.map((s, i) => (
                    <div key={s.id} className='flex flex-col gap-2' style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
                        <div className='flex gap-2 items-center'>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(237,237,237,0.4)', width: 18 }}>{i + 1}</span>
                            <TextField size='small' label='Title' value={s.title} disabled={ro} onChange={e => setStep(i, { title: e.target.value })} sx={{ ...inputSx, flex: 1 }} />
                            {!ro && <>
                                <IconButton size='small' disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpward sx={{ fontSize: 16 }} /></IconButton>
                                <IconButton size='small' disabled={i === form.steps.length - 1} onClick={() => move(i, 1)}><ArrowDownward sx={{ fontSize: 16 }} /></IconButton>
                                <IconButton size='small' disabled={form.steps.length === 1} onClick={() => set({ steps: form.steps.filter((_, j) => j !== i) })}><Delete sx={{ fontSize: 16 }} /></IconButton>
                            </>}
                        </div>
                        <TextField size='small' label='Text' multiline minRows={3} value={s.body} disabled={ro} onChange={e => setStep(i, { body: e.target.value })} sx={inputSx}
                            helperText='A blank line starts a new paragraph.' />
                        <LinksEditor value={s.links ?? []} disabled={ro} onChange={links => setStep(i, { links })} />
                    </div>
                ))}
                {!ro && form.steps.length < 20 && (
                    <Button size='small' startIcon={<Add />} onClick={() => set({ steps: [...form.steps, { id: slug('new step', new Set(form.steps.map(s => s.id))), title: 'New step', body: '', links: [] }] })}
                        sx={{ alignSelf: 'flex-start', borderRadius: 0, fontSize: '0.7rem', color: 'var(--red)' }}>
                        Add step
                    </Button>
                )}
            </div>

            {!ro && (
                <div className='flex gap-3 items-center'>
                    <Button variant='outlined' size='small' disabled={saving} onClick={save}
                        sx={{ borderRadius: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', borderColor: 'rgba(219,0,29,0.4)', color: 'var(--red)' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                    {saved && <span style={{ fontSize: '0.72rem', color: '#00c364' }}>Saved</span>}
                    {form.updatedByName && form.updatedAt && (
                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>Last changed by {form.updatedByName}, {fmt(form.updatedAt)}</span>
                    )}
                </div>
            )}
            {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}
        </div>
    )
}
