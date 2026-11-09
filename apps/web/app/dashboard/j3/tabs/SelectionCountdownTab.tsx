'use client'

import { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, FormControlLabel, Switch, TextField } from '@mui/material'
import ImageUploadField from '@/app/dashboard/_components/ImageUploadField'

/**
 * J3 → Admin → Selection Countdown Post (row 212).
 *
 * The date is not typed here: it is the next Selection course's Session 1,
 * read from the course instances. The override is for an intake announced
 * before its course exists, and stops applying once it passes.
 */

interface State {
    config: {
        enabled: boolean
        channelId: string
        title: string
        text: string
        imageUrl: string
        overrideAt: string | null
        messageId: string | null
        postedAt: string | null
        sentAt: string | null
        lastError: string | null
        updatedAt: string | null
        updatedByName: string | null
    }
    channelFromEnv: boolean
    devMode?: boolean
    next: { at: string; instanceRef: string } | null
    shownAt: string | null
    preview: { title: string; description: string; image?: { url: string } }
}

const inputSx = {
    '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.82rem', '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

const label: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }

const pad = (n: number) => String(n).padStart(2, '0')
function toLocalInput(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })

/** Discord renders <t:unix:F> in each reader's timezone; the preview does the same for you. */
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

export default function SelectionCountdownTab() {
    const [state, setState] = useState<State | null>(null)
    const [form, setForm] = useState<State['config'] | null>(null)
    const [saving, setSaving] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/j3/selection-countdown')
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then((d: State) => { setState(d); setForm(d.config) })
            .catch(() => setError('Could not load the countdown settings.'))
    }, [])

    async function save(patch?: Partial<State['config']>) {
        if (!form) return
        const next = { ...form, ...patch }
        setSaving(true); setError(null)
        try {
            const res = await fetch('/api/j3/selection-countdown', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: next.enabled, channelId: next.channelId, title: next.title, text: next.text, imageUrl: next.imageUrl,
                    overrideAt: next.overrideAt ? new Date(next.overrideAt).toISOString() : null,
                }),
            })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'Saving failed.'); return }
            setState(d); setForm(d.config)
        } finally {
            setSaving(false)
        }
    }

    async function sendNow() {
        setSending(true); setError(null)
        try {
            const res = await fetch('/api/j3/selection-countdown', { method: 'POST' })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'Sending failed.'); return }
            setState(d); setForm(f => f && { ...f, messageId: d.config.messageId, postedAt: d.config.postedAt, sentAt: d.config.sentAt, lastError: d.config.lastError })
        } finally {
            setSending(false)
        }
    }

    if (!form || !state) {
        return <div className='m-6'>{error ? <Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert> : <CircularProgress size={18} />}</div>
    }

    const set = (patch: Partial<State['config']>) => setForm({ ...form, ...patch })

    return (
        <div className='m-6 mt-4 flex flex-col gap-5' style={{ maxWidth: 880 }}>
            <div className='flex flex-col gap-1'>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Selection Countdown Post</span>
                <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.5 }}>
                    One post in the Want to Join channel showing when the next Selection starts. It is edited in place whenever the date, text or image changes, and shows &quot;To be confirmed&quot; when no Selection is scheduled.
                </span>
            </div>

            <FormControlLabel
                control={<Switch checked={form.enabled} disabled={saving} onChange={e => save({ enabled: e.target.checked })}
                    sx={{ '& .Mui-checked': { color: 'var(--red)' }, '& .Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' } }} />}
                label={<span style={{ fontSize: '0.82rem' }}>{form.enabled ? 'Enabled: the post is kept up to date' : 'Disabled: nothing is posted or edited'}</span>}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                <div className='flex flex-col gap-3'>
                    <div className='flex flex-col gap-1'>
                        <span style={label}>Next Selection (from the course records)</span>
                        <span style={{ fontSize: '0.85rem' }}>{state.next ? `${state.next.instanceRef}, Session 1: ${fmt(state.next.at)}` : 'None scheduled'}</span>
                    </div>
                    <TextField label='Override date and time (optional)' type='datetime-local' size='small' value={toLocalInput(form.overrideAt)}
                        onChange={e => set({ overrideAt: e.target.value || null })} InputLabelProps={{ shrink: true }} sx={inputSx}
                        helperText='Used instead of the course date while it is in the future.' />
                    <TextField label='Channel ID' size='small' value={form.channelId} onChange={e => set({ channelId: e.target.value })} sx={inputSx}
                        helperText={state.channelFromEnv ? 'Blank: using the channel set on the server.' : 'The Want to Join channel. Right-click it in Discord with developer mode on and copy the ID.'} />
                    <TextField label='Title' size='small' value={form.title} onChange={e => set({ title: e.target.value })} sx={inputSx} />
                    <TextField label='Text' size='small' multiline minRows={4} value={form.text} onChange={e => set({ text: e.target.value })} sx={inputSx}
                        helperText='{date} becomes the start date and countdown, shown in each reader’s own timezone.' />
                    <ImageUploadField value={form.imageUrl} onChange={url => set({ imageUrl: url })} />
                    <div className='flex gap-2 items-center'>
                        <Button variant='outlined' size='small' disabled={saving} onClick={() => save()}
                            sx={{ borderRadius: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', borderColor: 'rgba(219,0,29,0.4)', color: 'var(--red)' }}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        {form.updatedByName && form.updatedAt && (
                            <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>Last changed by {form.updatedByName}, {fmt(form.updatedAt)}</span>
                        )}
                    </div>
                    {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}
                    {state.devMode && <Alert severity='warning' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>Discord developer mode is on (J4 → Tools → Discord Dev Mode), so nothing is posted to Discord. The post goes out once it is turned off.</Alert>}
                    {form.lastError && <Alert severity='warning' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>Last Discord attempt failed: {form.lastError}</Alert>}
                </div>

                <div className='flex flex-col gap-2'>
                    <span style={label}>Preview (as saved)</span>
                    <div style={{ borderLeft: '4px solid #db001d', background: '#2b2d31', padding: '12px 14px', color: '#dbdee1', fontSize: '0.85rem', lineHeight: 1.45 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{state.preview.title}</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{renderTimestamps(state.preview.description)}</div>
                        { }
                        {state.preview.image && <img src={state.preview.image.url} alt='' style={{ marginTop: 10, maxWidth: '100%', borderRadius: 4 }} />}
                        <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#949ba4' }}>Times are shown in your own timezone</div>
                    </div>
                    <div className='flex flex-col gap-1 items-start' style={{ marginTop: 4 }}>
                        <Button variant='contained' size='small' disabled={sending || saving} onClick={sendNow}
                            sx={{ borderRadius: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', background: 'var(--red)', '&:hover': { background: 'var(--red)', filter: 'brightness(1.15)' } }}>
                            {sending ? 'Sending…' : 'Send post now'}
                        </Button>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)' }}>
                            {state.config.sentAt ?? state.config.postedAt
                                ? `Last posted ${fmt((state.config.sentAt ?? state.config.postedAt)!)}`
                                : 'Not posted yet'}
                            {state.config.sentAt && state.config.postedAt && state.config.postedAt !== state.config.sentAt ? `; last edited ${fmt(state.config.postedAt)}` : ''}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>Deletes the current post and sends it again at the bottom of the channel. Save changes first.</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
