'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Typography, CircularProgress, LinearProgress, Dialog, DialogContent, Menu, Tooltip as MuiTooltip } from '@mui/material'
import { CheckCircleOutline, ErrorOutline } from '@mui/icons-material'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import type { BackupPoint, BackupStatus, BackupConfig, StorageUsage, BackupPart } from '@/lib/backups'

// ── Duration history (localStorage) ──────────────────────────────────────────

const DURATION_KEY = 'snapshot_op_durations'

type DurationSample = { durationSecs: number; sizeBytes: number }
type DurationHistory = { create: DurationSample[]; revert: DurationSample[] }

function loadHistory(): DurationHistory {
    try {
        const raw = localStorage.getItem(DURATION_KEY)
        if (!raw) return { create: [], revert: [] }
        const parsed = JSON.parse(raw) as { create?: unknown[]; revert?: unknown[] }
        // Migrate the old bare-number-array format (no size data) — treated
        // as sizeBytes: 0 so getEstimate() falls back to a flat average for
        // these entries instead of a bogus rate calculation. Anything that
        // isn't a number and isn't a well-formed sample (e.g. hand-edited
        // localStorage) is dropped rather than trusted as-is.
        const isSample = (v: unknown): v is DurationSample =>
            typeof v === 'object' && v !== null
            && typeof (v as DurationSample).durationSecs === 'number'
            && typeof (v as DurationSample).sizeBytes === 'number'
        const migrate = (arr?: unknown[]): DurationSample[] =>
            (arr ?? [])
                .map(v => typeof v === 'number' ? { durationSecs: v, sizeBytes: 0 } : v)
                .filter(isSample)
        return { create: migrate(parsed.create), revert: migrate(parsed.revert) }
    } catch { return { create: [], revert: [] } }
}

function recordDuration(type: 'create' | 'revert', secs: number, sizeBytes: number) {
    const h = loadHistory()
    if (!h.create) h.create = []
    if (!h.revert) h.revert = []
    h[type].push({ durationSecs: Math.round(secs), sizeBytes })
    h[type] = h[type].slice(-5)  // keep last 5
    try { localStorage.setItem(DURATION_KEY, JSON.stringify(h)) } catch {}
}

// Averages the last 3 recorded runs, weighted by size when both the history
// and the operation about to run have size data — a backup/revert covering
// 10x more data should take roughly 10x as long, which a flat duration
// average completely misses. Falls back to a flat average when size data
// isn't available yet (fresh install, or history migrated from the old
// bare-duration format).
function getEstimate(type: 'create' | 'revert', currentSizeBytes: number): number {
    const h = loadHistory()
    const samples = (h[type] ?? []).slice(-3)
    if (samples.length === 0) return type === 'create' ? 90 : 45

    const withSize = samples.filter(s => s.sizeBytes > 0)
    if (withSize.length > 0 && currentSizeBytes > 0) {
        const avgRate = withSize.reduce((sum, s) => sum + s.durationSecs / s.sizeBytes, 0) / withSize.length
        return Math.max(5, avgRate * currentSizeBytes)
    }
    return samples.reduce((a, s) => a + s.durationSecs, 0) / samples.length
}

function fmtTime(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${String(s).padStart(2, '0')}`
}

function fmtBytes(bytes: number): string {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ open, title, body, danger, onConfirm, onCancel }: {
    open: boolean
    title: string
    body: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    return (
        <Dialog
            open={open}
            onClose={onCancel}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 420,
                    maxWidth: 520,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={2}
                    style={{ textTransform: 'uppercase', marginBottom: 16 }}>
                    {title}
                </Typography>
                <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.7)', marginBottom: 24, lineHeight: 1.6 }}>
                    {body}
                </Typography>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            background: 'none',
                            border: '1px solid rgba(237,237,237,0.15)',
                            color: 'rgba(237,237,237,0.6)',
                            padding: '7px 18px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            letterSpacing: 1,
                        }}
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            background: danger ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.08)',
                            border: `1px solid ${danger ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.2)'}`,
                            color: '#ededed',
                            padding: '7px 18px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            letterSpacing: 1,
                        }}
                    >
                        CONFIRM
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ── Storage donut ─────────────────────────────────────────────────────────────

const STORAGE_PALETTE = { database: '#00c3ff', gallery: '#db001d', uploads: '#f59e0b' }
const storageTooltipStyle = {
    contentStyle: { background: '#111', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0, fontSize: '0.78rem', color: '#ededed' },
    cursor: { fill: 'rgba(255,255,255,0.04)' },
}

function StorageDonut({ title, data }: { title: string; data: { name: string; value: number; color: string }[] }) {
    const total = data.reduce((sum, d) => sum + d.value, 0)
    return (
        <div>
            <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={2}
                style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>
                {title}
            </Typography>
            <Typography fontSize='0.9rem' fontWeight={700} fontFamily='monospace' style={{ color: 'rgba(237,237,237,0.85)', marginBottom: 6 }}>
                {fmtBytes(total)}
            </Typography>
            {total > 0 ? (
                <>
                    <div style={{ width: '100%', height: 160 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={data} dataKey='value' nameKey='name' cx='50%' cy='50%' innerRadius={36} outerRadius={62} paddingAngle={3}>
                                    {data.map((e, i) => <Cell key={i} fill={e.color} />)}
                                </Pie>
                                <RechartsTooltip {...storageTooltipStyle} formatter={(v, name) => [fmtBytes(Number(v ?? 0)), name]} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        {data.map(d => (
                            <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 8, height: 8, background: d.color, display: 'inline-block' }} />
                                    <span style={{ color: 'rgba(237,237,237,0.55)' }}>{d.name}</span>
                                </div>
                                <span style={{ color: 'rgba(237,237,237,0.7)', fontFamily: 'monospace' }}>{fmtBytes(d.value)}</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.25)', padding: '20px 0' }}>
                    No data yet.
                </Typography>
            )}
        </div>
    )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function BackupsTab({ canRestore }: { canRestore: boolean }) {
    const [points, setPoints]       = useState<BackupPoint[]>([])
    const [status, setStatus]       = useState<BackupStatus>({ state: 'idle' })
    const [loading, setLoading]     = useState(true)
    const [error, setError]         = useState<string | null>(null)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadParts, setUploadParts] = useState<Record<BackupPart, boolean>>({ database: true, gallery: true, uploads: true })
    const [uploading, setUploading]   = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)

    const [elapsed, setElapsed] = useState(0)
    const prevBusy   = useRef(false)
    const opStartMs  = useRef(0)
    const opTypeRef  = useRef<'create' | 'revert'>('create')
    const opSizeRef  = useRef(0) // bytes "about to be processed" — captured when an operation is triggered, used for size-aware duration estimates

    const [resticHealthy, setResticHealthy] = useState<boolean | null>(null)
    const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null)
    const [storageError, setStorageError] = useState<string | null>(null)

    const [cancelling, setCancelling] = useState(false)

    // Per-button pointer feedback. Inline styles can't express :hover/:active,
    // and these buttons had neither — a click produced no visible reaction at
    // all, which on the download is a ~3 second wait before the browser's own
    // download UI appears. Keyed by `${point.id}:${button}`.
    const [hoveredRow, setHoveredRow] = useState<string | null>(null)
    const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)
    const [pressedBtn, setPressedBtn] = useState<string | null>(null)

    // The point whose download has been asked for but hasn't started arriving
    // yet, and the one whose revert request is in flight.
    const [startingDownload, setStartingDownload] = useState<string | null>(null)
    const [revertPending, setRevertPending] = useState<string | null>(null)

    // The open scope menu (which row, which action, where to anchor it) and the
    // parts ticked inside it. The plain Download/Revert buttons still act on
    // everything; this is the caret beside them.
    const [scopeMenu, setScopeMenu] = useState<{ point: BackupPoint; action: 'download' | 'revert'; anchor: HTMLElement } | null>(null)
    const [scopeSel, setScopeSel] = useState<Record<BackupPart, boolean>>({ database: true, gallery: true, uploads: true })
    // On by default, matching the database half of a restore: collections are
    // dropped and reinserted, so the database already comes back as the backup
    // had it. Media merging was the odd one out, and a restore that leaves
    // files the backup never contained is not the restore most people mean.
    // Untick to merge instead. The safety backup taken first makes the
    // deletion recoverable, which is what allows this to default on.
    const [wipeMedia, setWipeMedia] = useState(true)
    const [uploadWipe, setUploadWipe] = useState(true)

    // Which parts a given point can offer at all.
    const availableParts = (p: BackupPoint): BackupPart[] => [
        ...(p.dbSnapshotId ? ['database' as const] : []),
        ...(p.mediaSnapshotId ? ['gallery' as const, 'uploads' as const] : []),
    ]

    function openScopeMenu(point: BackupPoint, action: 'download' | 'revert', anchor: HTMLElement) {
        const available = availableParts(point)
        setScopeSel({
            database: available.includes('database'),
            gallery:  available.includes('gallery'),
            uploads:  available.includes('uploads'),
        })
        setScopeMenu({ point, action, anchor })
    }

    const selectedParts = (point: BackupPoint): BackupPart[] =>
        availableParts(point).filter(p => scopeSel[p])

    const [config, setConfig] = useState<BackupConfig>({ autoEnabled: true, keepHourly: 48, keepDaily: 14, keepWeekly: 8, keepMonthly: 12 })
    const [configDraft, setConfigDraft] = useState<BackupConfig>({ autoEnabled: true, keepHourly: 48, keepDaily: 14, keepWeekly: 8, keepMonthly: 12 })
    const [configDirty, setConfigDirty] = useState(false)
    const [configSaving, setConfigSaving] = useState(false)
    const [configError, setConfigError] = useState<string | null>(null)

    const [confirm, setConfirm] = useState<{
        open: boolean
        title: string
        body: string
        danger?: boolean
        action: (() => void) | null
    }>({ open: false, title: '', body: '', action: null })

    const busy = status.state !== 'idle'

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/backups')
            if (!res.ok) throw new Error('Failed to load')
            const data = await res.json()
            setPoints(data.points ?? [])
            setStatus(data.status ?? { state: 'idle' })
            setResticHealthy(typeof data.resticHealthy === 'boolean' ? data.resticHealthy : null)
            setError(null)
        } catch {
            setError('Failed to load backups.')
        } finally {
            setLoading(false)
        }
    }, [])

    const fetchStorageUsage = useCallback(async () => {
        try {
            const res = await fetch('/api/backups/storage')
            if (!res.ok) throw new Error('Failed to load')
            setStorageUsage(await res.json())
            setStorageError(null)
        } catch {
            setStorageError('Failed to load storage usage.')
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])
    useEffect(() => { fetchStorageUsage() }, [fetchStorageUsage])

    useEffect(() => {
        fetch('/api/backups/config')
            .then(r => r.ok ? r.json() : null)
            .then((cfg: BackupConfig | null) => {
                if (cfg) { setConfig(cfg); setConfigDraft(cfg) }
            })
            .catch(() => {})
    }, [])

    // Poll every 3s while an operation is in progress
    useEffect(() => {
        if (status.state !== 'idle') {
            if (!pollRef.current) pollRef.current = setInterval(fetchData, 3000)
        } else {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
        return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
    }, [status.state, fetchData])

    // Record duration when operation completes; set start time when it begins
    useEffect(() => {
        if (busy && !prevBusy.current) {
            opStartMs.current = status.startedAt ? new Date(status.startedAt).getTime() : Date.now()
            opTypeRef.current = status.state === 'backing-up' ? 'create' : 'revert'
        }
        if (!busy && prevBusy.current && opStartMs.current) {
            const secs = (Date.now() - opStartMs.current) / 1000
            if (secs > 2) recordDuration(opTypeRef.current, secs, opSizeRef.current)
            opSizeRef.current = 0 // don't let a locally-untriggered run (cron, another tab) inherit a stale size on the next transition
            fetchStorageUsage() // storage changed — refresh the breakdown now that the operation finished
        }
        prevBusy.current = busy
    }, [busy, status.state, status.startedAt, fetchStorageUsage])

    // Sub-second ticker for smooth progress bar
    useEffect(() => {
        if (!busy) { setElapsed(0); return }
        const startMs = status.startedAt ? new Date(status.startedAt).getTime() : Date.now()
        const id = setInterval(() => setElapsed((Date.now() - startMs) / 1000), 200)
        return () => clearInterval(id)
    }, [busy, status.startedAt])

    function openConfirm(title: string, body: string, action: () => void, danger = false) {
        setConfirm({ open: true, title, body, danger, action })
    }

    function closeConfirm() {
        setConfirm(c => ({ ...c, open: false, action: null }))
    }

    async function handleForceReset() {
        openConfirm(
            'Force Reset Status',
            'This aborts the running operation: any restic process it started is stopped, the status resets to idle immediately, and a new backup can be started straight away. Temp files it created are always cleaned up. A backup stopped this way simply leaves no snapshot behind; a restore stopped partway through may leave data half-restored, so prefer letting a restore finish. Only use this if the operation appears stuck.',
            async () => {
                setCancelling(true)
                try {
                    const res = await fetch('/api/backups/cancel', { method: 'POST' })
                    const data = await res.json()
                    if (!res.ok) setError(data.error ?? 'Reset failed')
                    else fetchData()
                } finally {
                    setCancelling(false)
                }
            },
            true
        )
    }

    async function handleCreateNow() {
        // Total live size of what's about to be backed up — used by
        // getEstimate() for a size-aware duration estimate.
        opSizeRef.current = storageUsage
            ? storageUsage.live.database + storageUsage.live.gallery + storageUsage.live.uploads
            : 0
        const res = await fetch('/api/backups/create', { method: 'POST' })
        const data = await res.json()
        if (!res.ok) setError(data.error ?? 'Failed to start')
        else fetchData()
    }

    // A download is a plain browser navigation, so the page cannot observe it
    // directly — and the server spends a few seconds opening the restic stream
    // before the first byte, during which nothing visible happens anywhere.
    // The route echoes this one-shot nonce back as a cookie the moment it
    // starts responding, which is the earliest truthful signal that the
    // download is actually underway rather than a guessed timeout.
    const downloadNonces = useMemo(
        () => new Map(points.map(p => [p.id, Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, '') || 'dl'])),
        [points],
    )

    const downloadTimers = useRef<Set<number>>(new Set())
    useEffect(() => () => { downloadTimers.current.forEach(t => window.clearInterval(t)) }, [])

    // Used by the scope menu, where there is no anchor to click — a temporary
    // one keeps the browser's native download behaviour (and the filename hint)
    // rather than navigating the tab.
    function triggerDownload(point: BackupPoint, parts: BackupPart[]) {
        const nonce = downloadNonces.get(point.id) ?? 'dl'
        const query = new URLSearchParams({ dl: nonce })
        if (parts.length < availableParts(point).length) query.set('parts', parts.join(','))
        const a = document.createElement('a')
        a.href = `/api/backups/${encodeURIComponent(point.id)}/download?${query}`
        a.download = `backup-${point.id}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        watchForDownloadStart(point.id, nonce)
    }

    function watchForDownloadStart(pointId: string, nonce: string) {
        setStartingDownload(pointId)
        const deadline = Date.now() + 90_000
        const timer = window.setInterval(() => {
            const started = document.cookie.split('; ').some(c => c === `backup-dl=${nonce}`)
            if (started) document.cookie = 'backup-dl=; Path=/; Max-Age=0'
            // Also give up at the deadline: if the request failed outright the
            // cookie never arrives, and an indicator that never clears is
            // worse than one that clears early.
            if (started || Date.now() > deadline) {
                window.clearInterval(timer)
                downloadTimers.current.delete(timer)
                setStartingDownload(prev => (prev === pointId ? null : prev))
            }
        }, 250)
        downloadTimers.current.add(timer)
    }

    // A parameter rather than read from state, so the caller decides. The
    // default is true because the plain Revert button shows no checkbox: two
    // adjacent buttons that quietly differ would be worse than one consistent
    // rule, and the confirmation names the deletion either way.
    async function handleRevert(point: BackupPoint, parts: BackupPart[] = availableParts(point), wipe = true) {
        const label: Record<BackupPart, string> = { database: 'the database', gallery: 'the gallery', uploads: 'uploaded files' }
        const what = parts.map(p => label[p]).join(', ').replace(/, ([^,]*)$/, ' and $1')
        // A partial restore is a sharper tool than the all-or-nothing one: the
        // database references media by path, so restoring one without the other
        // can leave records pointing at files that no longer match. Worth
        // saying out loud at the moment of choosing, not in a doc somewhere.
        const partial = parts.length < availableParts(point).length
        openConfirm(
            'Revert to Backup',
            `This will restore ${what} from ${new Date(point.time).toLocaleString()}, overwriting the current state. `
            + (partial
                ? `Everything else is left exactly as it is now — which can leave the database and the media out of step with each other, since records reference files by path. `
                : '')
            + (wipe
                ? `Media files added since that backup will be DELETED, not merged — the gallery and uploads will match the backup exactly. `
                : '')
            + `The current state cannot be recovered unless you have another backup. Are you sure?`,
            async () => {
                opSizeRef.current = (point.dbSizeBytes ?? 0) + (point.mediaSizeBytes ?? 0)
                // Held until the request returns, so the row shows the restore
                // was accepted rather than looking inert until the next status
                // poll flips `busy`.
                setRevertPending(point.id)
                try {
                    const res = await fetch('/api/backups/revert', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: point.id, parts, wipeMedia: wipe }),
                    })
                    const data = await res.json()
                    if (!res.ok) setError(data.error ?? 'Failed to start revert')
                    else fetchData()
                } finally {
                    setRevertPending(prev => (prev === point.id ? null : prev))
                }
            },
            true
        )
    }

    async function handleUploadRevert() {
        if (!uploadFile) return
        const chosen = (['database', 'gallery', 'uploads'] as BackupPart[]).filter(p => uploadParts[p])
        if (chosen.length === 0) { setError('Choose at least one part to restore from the upload.'); return }
        const labels: Record<BackupPart, string> = { database: 'the database', gallery: 'the gallery', uploads: 'uploaded files' }
        const what = chosen.map(p => labels[p]).join(', ').replace(/, ([^,]*)$/, ' and $1')
        // Only meaningful when a media part is actually being restored.
        const wipesMedia = uploadWipe && (chosen.includes('gallery') || chosen.includes('uploads'))
        openConfirm(
            'Upload & Revert',
            `Upload "${uploadFile.name}" and restore ${what} from it? This DROPS the current copy of ${chosen.length === 3 ? 'all of it' : 'those parts'} and cannot be undone.`
            + (chosen.length < 3
                ? ` Everything else is left as it is, which can leave the database and the media out of step with each other.`
                : '')
            + (wipesMedia
                ? ` Media files not in the archive will be DELETED rather than kept alongside it.`
                : ''),
            async () => {
                setUploading(true)
                setError(null)
                opSizeRef.current = uploadFile.size
                try {
                    const form = new FormData()
                    form.append('backup', uploadFile)
                    form.append('parts', chosen.join(','))
                    form.append('wipeMedia', String(wipesMedia))
                    const res = await fetch('/api/backups/upload', { method: 'POST', body: form })
                    const data = await res.json()
                    if (!res.ok) setError(data.error ?? 'Upload failed')
                    else {
                        setUploadFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                        fetchData()
                    }
                } catch {
                    setError('Network error during upload.')
                } finally {
                    setUploading(false)
                }
            },
            true
        )
    }

    function patchConfigDraft(patch: Partial<BackupConfig>) {
        setConfigDraft(d => {
            const next = { ...d, ...patch }
            setConfigDirty(
                next.autoEnabled  !== config.autoEnabled  ||
                next.keepHourly   !== config.keepHourly   ||
                next.keepDaily    !== config.keepDaily    ||
                next.keepWeekly   !== config.keepWeekly   ||
                next.keepMonthly  !== config.keepMonthly
            )
            return next
        })
    }

    async function handleSaveConfig() {
        setConfigSaving(true)
        setConfigError(null)
        try {
            const res = await fetch('/api/backups/config', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configDraft),
            })
            const data = await res.json()
            if (!res.ok) {
                setConfigError(data.error ?? 'Failed to save')
            } else {
                setConfig(data)
                setConfigDraft(data)
                setConfigDirty(false)
            }
        } catch {
            setConfigError('Network error')
        } finally {
            setConfigSaving(false)
        }
    }

    // `key` opts the button into pointer feedback: pass the same key to the
    // element's mouse handlers. Omit it and the button renders exactly as it
    // always did (used by the disabled/static cases).
    const rowBtnSx = (accent?: 'red' | 'green', key?: string): React.CSSProperties => {
        const interactive = !busy && key !== undefined
        const hovered = interactive && hoveredBtn === key
        const pressed = interactive && pressedBtn === key

        // Border and text are tinted independently: the neutral button has a
        // red border but light text, which the original styling established.
        const edge = accent === 'green' ? '0,195,100' : '219,0,29'
        const ink  = accent === 'green' ? '0,195,100' : accent === 'red' ? '219,0,29' : '237,237,237'

        return {
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '3px 16px',
            cursor: busy ? 'not-allowed' : 'pointer',
            border: `1px solid rgba(${edge},${hovered || pressed ? 0.6 : accent ? 0.3 : 0.25})`,
            color: busy
                ? 'rgba(237,237,237,0.2)'
                : `rgba(${ink},${hovered || pressed ? 1 : accent ? 0.8 : 0.75})`,
            background: pressed ? `rgba(${edge},0.2)` : hovered ? `rgba(${edge},0.09)` : 'none',
            // A real displacement on press, so the click registers even when
            // the resulting work is server-side and invisible for seconds.
            transform: pressed ? 'translateY(1px)' : 'none',
            transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.06s ease',
            whiteSpace: 'nowrap' as const,
            width: '100%',
            display: 'inline-flex' as const,
            alignItems: 'center',
            justifyContent: 'center',
        }
    }

    // Wired onto every row button that has a `key`.
    const btnPointerProps = (key: string) => ({
        onMouseEnter: () => setHoveredBtn(key),
        onMouseLeave: () => {
            setHoveredBtn(prev => (prev === key ? null : prev))
            setPressedBtn(prev => (prev === key ? null : prev))
        },
        onMouseDown: () => setPressedBtn(key),
        onMouseUp:   () => setPressedBtn(prev => (prev === key ? null : prev)),
    })

    // `min` is the currently saved value, not 1: PATCH /api/backups/config
    // rejects any reduction (issue #55 requirement 6), so offering a lower
    // number in the stepper would only produce a 400. Retention is raised
    // from here and lowered only in storage/backup-meta/.config.json.
    const RETENTION_FIELDS: {
        key: keyof Pick<BackupConfig, 'keepHourly' | 'keepDaily' | 'keepWeekly' | 'keepMonthly'>
        label: string
        description: string
        min: number
        max: number
    }[] = [
        { key: 'keepHourly',  label: 'Keep Hourly',  description: 'How many hourly backups to keep before thinning to daily',    min: config.keepHourly,  max: 200 },
        { key: 'keepDaily',   label: 'Keep Daily',    description: 'How many daily backups to keep before thinning to weekly',    min: config.keepDaily,   max: 90 },
        { key: 'keepWeekly',  label: 'Keep Weekly',   description: 'How many weekly backups to keep before thinning to monthly',  min: config.keepWeekly,  max: 52 },
        { key: 'keepMonthly', label: 'Keep Monthly',  description: 'How many monthly backups to keep before they age out',        min: config.keepMonthly, max: 60 },
    ]

    return (
        <div className='p-6 md:p-10 flex flex-col gap-6'>

            {/* Header */}
            <div
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <CornerBrackets />
                <div>
                    <Typography fontSize='0.52rem' fontWeight={700} letterSpacing={3}
                        style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 2, fontFamily: 'monospace' }}>
                        <span style={{ color: 'rgba(219,0,29,0.35)' }}>{'//'}</span> J4 — Administration
                    </Typography>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                            Backups
                        </Typography>
                        {resticHealthy !== null && (
                            <MuiTooltip title={resticHealthy ? 'Restic binary: OK' : 'Restic binary: not found or not runnable'}>
                                <div style={{ display: 'inline-flex', lineHeight: 0 }}>
                                    {resticHealthy
                                        ? <CheckCircleOutline sx={{ fontSize: 15, color: 'rgba(34,197,94,0.85)' }} />
                                        : <ErrorOutline sx={{ fontSize: 15, color: 'rgba(219,0,29,0.85)' }} />}
                                </div>
                            </MuiTooltip>
                        )}
                    </div>
                </div>
                <button
                    onClick={handleCreateNow}
                    disabled={busy}
                    style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        padding: '8px 20px',
                        background: busy ? 'none' : 'rgba(219,0,29,0.2)',
                        border: '1px solid rgba(219,0,29,0.4)',
                        color: busy ? 'rgba(237,237,237,0.3)' : '#ededed',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    {busy && <CircularProgress size={12} style={{ color: 'rgba(237,237,237,0.4)' }} />}
                    {busy ? 'IN PROGRESS…' : '+ CREATE BACKUP'}
                </button>
            </div>

            {/* Progress banner */}
            {(busy || status.error) && (() => {
                const opType  = status.state === 'backing-up' ? 'create' : 'revert'
                const estimate = getEstimate(opType, opSizeRef.current)
                const pct     = busy ? Math.min(96, (elapsed / estimate) * 100) : 0
                const remaining = Math.max(0, Math.ceil(estimate - elapsed))
                const almostDone = elapsed > estimate * 0.9
                const plan = status.plan ?? []
                // -1 (nothing matched) still reads correctly: no segment is
                // marked done and none is marked running.
                const stageIndex = plan.findIndex(s => s.id === status.stage)

                return status.error ? (
                    <div style={{
                        padding: '10px 16px',
                        background: 'rgba(219,0,29,0.1)',
                        border: '1px solid rgba(219,0,29,0.4)',
                        fontSize: '0.78rem',
                        color: 'rgba(219,0,29,0.9)',
                    }}>
                        Error: {status.error}
                    </div>
                ) : (
                    <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,200,0,0.15)',
                        overflow: 'hidden',
                    }}>
                        {/* Stage checkpoints. The operation declares its own
                            plan, so this shows what is done, what is running
                            and what is still to come — rather than one bar
                            that restarts at every stage. Falls back to the
                            single bar when a status predates the plan. */}
                        {plan.length > 0 ? (
                            <div style={{ display: 'flex', gap: 3, padding: '10px 14px 0' }}>
                                {plan.map((s, i) => {
                                    const done    = i < stageIndex
                                    const running = i === stageIndex
                                    return (
                                        <div key={s.id} style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                                {done && <div style={{ height: '100%', background: 'rgba(0,200,80,0.65)' }} />}
                                                {running && (
                                                    <LinearProgress
                                                        variant='indeterminate'
                                                        style={{ height: 3, background: 'transparent' }}
                                                        sx={{ '& .MuiLinearProgress-bar': { backgroundColor: 'rgba(219,160,0,0.9)' } }}
                                                    />
                                                )}
                                            </div>
                                            <div style={{
                                                marginTop: 5,
                                                fontSize: '0.55rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.08em',
                                                textTransform: 'uppercase',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                color: done
                                                    ? 'rgba(0,200,80,0.7)'
                                                    : running
                                                        ? 'rgba(219,160,0,0.95)'
                                                        : 'rgba(237,237,237,0.22)',
                                            }}>
                                                {done ? '✓ ' : ''}{s.label}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div style={{ position: 'relative', height: 3, background: 'rgba(255,255,255,0.06)' }}>
                                <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                    width: `${pct}%`,
                                    background: almostDone ? 'rgba(0,200,80,0.7)' : 'rgba(219,160,0,0.8)',
                                    transition: 'width 0.4s ease, background 0.6s ease',
                                }} />
                            </div>
                        )}

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            gap: 12,
                            flexWrap: 'wrap',
                        }}>
                            {/* Left: label + phase */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CircularProgress size={13} style={{ color: 'rgba(219,160,0,0.7)', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)' }}>
                                        {status.state === 'backing-up' ? 'Backing Up' : 'Reverting to Backup'}
                                    </div>
                                    {status.message && (
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', marginTop: 1, letterSpacing: '0.04em' }}>
                                            {status.message}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: times + percentage + cancel */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 1 }}>
                                        Elapsed
                                    </div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: 'rgba(237,237,237,0.6)' }}>
                                        {fmtTime(elapsed)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 1 }}>
                                        Est. Remaining
                                    </div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: almostDone ? 'rgba(0,200,80,0.75)' : 'rgba(219,160,0,0.85)' }}>
                                        {almostDone ? 'Almost done…' : `~${fmtTime(remaining)}`}
                                    </div>
                                </div>
                                <div style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    fontFamily: 'monospace',
                                    color: almostDone ? 'rgba(0,200,80,0.75)' : 'rgba(219,160,0,0.85)',
                                    minWidth: 44,
                                    textAlign: 'right',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {/* Stage counts are known; a percentage was
                                        only ever the time estimate wearing a
                                        disguise, and it read 96% while the
                                        operation was wedged. */}
                                    {plan.length > 0 && stageIndex >= 0
                                        ? `${stageIndex + 1}/${plan.length}`
                                        : `${Math.round(pct)}%`}
                                </div>
                                <button
                                    onClick={handleForceReset}
                                    disabled={cancelling}
                                    title='Force-reset stuck operation'
                                    style={{
                                        fontSize: '0.6rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                        padding: '4px 10px',
                                        background: 'none',
                                        border: '1px solid rgba(219,0,29,0.35)',
                                        color: cancelling ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.7)',
                                        cursor: cancelling ? 'not-allowed' : 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {cancelling ? '…' : 'Force Reset'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Error */}
            {error && (
                <Typography fontSize='0.75rem' style={{ color: '#ff4444' }}>{error}</Typography>
            )}

            {/* Backup timeline */}
            <div>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 10 }}>
                    Backup Timeline
                </Typography>

                {loading && (
                    <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} />
                    </div>
                )}

                {!loading && points.length === 0 && (
                    <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>
                        No backups yet.
                    </Typography>
                )}

                {points.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 22px 65px 22px', gap: 8,
                            padding: '5px 12px', fontSize: '0.58rem', fontWeight: 700, letterSpacing: 2,
                            textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)',
                        }}>
                            <span>Time</span>
                            <span>Database</span>
                            <span>Media</span>
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>

                        {points.map(p => (
                            <div
                                key={p.id}
                                onMouseEnter={() => setHoveredRow(p.id)}
                                onMouseLeave={() => setHoveredRow(prev => (prev === p.id ? null : prev))}
                                style={{
                                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 22px 65px 22px', gap: 8,
                                    alignItems: 'center', padding: '8px 12px',
                                    // Rows are otherwise indistinguishable at a
                                    // glance, and picking the wrong one here
                                    // means restoring the wrong backup.
                                    background: hoveredRow === p.id ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${hoveredRow === p.id ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.05)'}`,
                                    transition: 'background 0.12s ease, border-color 0.12s ease',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.85)' }}>
                                        {new Date(p.time).toLocaleString()}
                                    </span>
                                    {p.isSafety && (
                                        <span
                                            title='Taken automatically before a restore — exempt from retention'
                                            style={{
                                                fontSize: '0.6rem',
                                                letterSpacing: 1,
                                                padding: '2px 6px',
                                                border: '1px solid rgba(219,166,0,0.5)',
                                                color: 'rgba(219,166,0,0.85)',
                                                textTransform: 'uppercase',
                                                whiteSpace: 'nowrap',
                                                flexShrink: 0,
                                            }}
                                        >
                                            Pre-restore
                                        </span>
                                    )}
                                    {p.isManual && (
                                        <span
                                            title='Created on demand from this page — exempt from retention'
                                            style={{
                                                fontSize: '0.6rem',
                                                letterSpacing: 1,
                                                padding: '2px 6px',
                                                border: '1px solid rgba(0,195,100,0.5)',
                                                color: 'rgba(0,195,100,0.85)',
                                                textTransform: 'uppercase',
                                                whiteSpace: 'nowrap',
                                                flexShrink: 0,
                                            }}
                                        >
                                            Manual
                                        </span>
                                    )}
                                </div>
                                <span style={{ fontSize: '0.68rem', color: p.dbSnapshotId ? 'rgba(0,195,100,0.85)' : 'rgba(237,237,237,0.2)' }}>
                                    {p.dbSnapshotId ? (p.dbSizeBytes ? fmtBytes(p.dbSizeBytes) : 'Present') : 'Missing'}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: p.mediaSnapshotId ? 'rgba(0,195,100,0.85)' : 'rgba(237,237,237,0.2)' }}>
                                    {p.mediaSnapshotId ? (p.mediaSizeBytes ? fmtBytes(p.mediaSizeBytes) : 'Present') : 'Missing'}
                                </span>
                                <a
                                    href={busy ? undefined : `/api/backups/${encodeURIComponent(p.id)}/download?dl=${downloadNonces.get(p.id) ?? 'dl'}`}
                                    download={`backup-${p.id}.zip`}
                                    {...btnPointerProps(`${p.id}:download`)}
                                    onClick={e => {
                                        if (busy || startingDownload === p.id) { e.preventDefault(); return }
                                        watchForDownloadStart(p.id, downloadNonces.get(p.id) ?? 'dl')
                                    }}
                                    title={startingDownload === p.id
                                        ? 'Preparing the archive — the browser takes over once it starts arriving'
                                        : undefined}
                                    style={{
                                        ...rowBtnSx('green', `${p.id}:download`),
                                        textDecoration: 'none', textAlign: 'center', display: 'inline-flex',
                                        alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit',
                                    }}
                                >
                                    {startingDownload === p.id && (
                                        <CircularProgress size={9} thickness={6} style={{ color: 'rgba(0,195,100,0.85)' }} />
                                    )}
                                    {startingDownload === p.id ? 'Starting' : 'Download'}
                                </a>
                                <button
                                    aria-label='Choose what to download'
                                    title='Choose what to download'
                                    disabled={busy}
                                    onClick={e => openScopeMenu(p, 'download', e.currentTarget)}
                                    {...btnPointerProps(`${p.id}:download-scope`)}
                                    style={{ ...rowBtnSx('green', `${p.id}:download-scope`), width: 22, padding: '3px 0' }}
                                >
                                    ▾
                                </button>
                                {canRestore && (
                                    <>
                                        <button
                                            onClick={() => handleRevert(p)}
                                            disabled={busy || revertPending === p.id}
                                            {...btnPointerProps(`${p.id}:revert`)}
                                            style={{ ...rowBtnSx(undefined, `${p.id}:revert`), gap: 6 }}
                                        >
                                            {revertPending === p.id && (
                                                <CircularProgress size={9} thickness={6} style={{ color: 'rgba(237,237,237,0.6)' }} />
                                            )}
                                            {revertPending === p.id ? 'Starting' : 'Revert'}
                                        </button>
                                        <button
                                            aria-label='Choose what to restore'
                                            title='Choose what to restore'
                                            disabled={busy || revertPending === p.id}
                                            onClick={e => openScopeMenu(p, 'revert', e.currentTarget)}
                                            {...btnPointerProps(`${p.id}:revert-scope`)}
                                            style={{ ...rowBtnSx(undefined, `${p.id}:revert-scope`), width: 22, padding: '3px 0' }}
                                        >
                                            ▾
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Storage usage */}
            <div style={{ borderTop: '1px solid rgba(219,0,29,0.12)', paddingTop: 20 }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 16 }}>
                    Storage Usage
                </Typography>
                {storageUsage ? (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                        <StorageDonut title='Live Storage' data={[
                            { name: 'Database', value: storageUsage.live.database, color: STORAGE_PALETTE.database },
                            { name: 'Gallery',  value: storageUsage.live.gallery,  color: STORAGE_PALETTE.gallery },
                            { name: 'Uploads',  value: storageUsage.live.uploads,  color: STORAGE_PALETTE.uploads },
                        ]} />
                        <StorageDonut title='Backup Storage (on disk)' data={[
                            { name: 'Database', value: storageUsage.backups.db,           color: STORAGE_PALETTE.database },
                            { name: 'Gallery',  value: storageUsage.backups.mediaGallery, color: STORAGE_PALETTE.gallery },
                            { name: 'Uploads',  value: storageUsage.backups.mediaUploads, color: STORAGE_PALETTE.uploads },
                        ]} />
                    </div>
                ) : storageError ? (
                    <Typography fontSize='0.75rem' style={{ color: '#ff4444' }}>{storageError}</Typography>
                ) : (
                    <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress size={20} style={{ color: 'rgba(219,0,29,0.6)' }} />
                    </div>
                )}
            </div>

            {/* Upload & revert — backups.restore only */}
            {canRestore && (
                <div style={{ borderTop: '1px solid rgba(219,0,29,0.12)', paddingTop: 20 }}>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                        style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                        Upload & Revert
                    </Typography>
                    {/* Same three parts as the timeline's scope menu. Ticking
                        one off means the archive's copy of it is ignored, so a
                        zip holding everything can restore just the gallery. */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: '0.55rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                            color: 'rgba(237,237,237,0.3)',
                        }}>
                            Restore from it
                        </span>
                        {(['database', 'gallery', 'uploads'] as BackupPart[]).map(part => (
                            <label key={part} style={{
                                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                                fontSize: '0.68rem', color: 'rgba(237,237,237,0.75)', textTransform: 'capitalize',
                            }}>
                                <input
                                    type='checkbox'
                                    checked={uploadParts[part]}
                                    onChange={e => setUploadParts(s => ({ ...s, [part]: e.target.checked }))}
                                    style={{ accentColor: '#db001d', width: 13, height: 13, cursor: 'pointer' }}
                                />
                                {part}
                            </label>
                        ))}
                        {(uploadParts.gallery || uploadParts.uploads) && (
                            <label style={{
                                display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer',
                                fontSize: '0.68rem', color: 'rgba(237,237,237,0.75)',
                                borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 2,
                            }}>
                                <input
                                    type='checkbox'
                                    checked={uploadWipe}
                                    onChange={e => setUploadWipe(e.target.checked)}
                                    style={{ accentColor: '#db001d', width: 13, height: 13, cursor: 'pointer', marginTop: 2 }}
                                />
                                <span style={{ flex: 1 }}>
                                    Remove files not in the archive
                                    <span style={{ display: 'block', fontSize: '0.55rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                                        Media only. A safety backup is taken first.
                                    </span>
                                </span>
                            </label>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{
                            border: '1px solid rgba(219,0,29,0.25)',
                            padding: '6px 14px',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            letterSpacing: 1,
                            color: uploadFile ? '#ededed' : 'rgba(237,237,237,0.35)',
                            background: 'rgba(255,255,255,0.03)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                        }}>
                            {uploadFile ? uploadFile.name : 'Choose File (.zip)'}
                            <input
                                ref={fileInputRef}
                                type='file'
                                accept='.zip'
                                style={{ display: 'none' }}
                                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                            />
                        </label>

                        <button
                            onClick={handleUploadRevert}
                            disabled={!uploadFile || busy || uploading}
                            style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                padding: '6px 18px',
                                background: (!uploadFile || busy || uploading) ? 'none' : 'rgba(219,0,29,0.2)',
                                border: '1px solid rgba(219,0,29,0.4)',
                                color: (!uploadFile || busy || uploading) ? 'rgba(237,237,237,0.25)' : '#ededed',
                                cursor: (!uploadFile || busy || uploading) ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            {uploading && <CircularProgress size={12} style={{ color: 'rgba(237,237,237,0.4)' }} />}
                            {uploading ? 'Uploading…' : 'Upload & Revert'}
                        </button>
                    </div>
                    <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.25)', marginTop: 8 }}>
                        Upload a previously downloaded backup ZIP to restore the website to that state.
                    </Typography>
                </div>
            )}

            {/* Settings */}
            <div style={{ borderTop: '1px solid rgba(219,0,29,0.12)', paddingTop: 20 }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 16 }}>
                    Auto-Backup Settings
                </Typography>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Auto-enabled toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)', marginBottom: 2 }}>
                                Auto-Backups
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>
                                Automatically create backups on a schedule
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexShrink: 0 }}>
                            {(['ON', 'OFF'] as const).map(opt => {
                                const active = opt === 'ON' ? configDraft.autoEnabled : !configDraft.autoEnabled
                                return (
                                    <button
                                        key={opt}
                                        onClick={() => patchConfigDraft({ autoEnabled: opt === 'ON' })}
                                        style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.1em',
                                            padding: '5px 16px',
                                            cursor: 'pointer',
                                            background: active ? (opt === 'ON' ? 'rgba(0,195,100,0.15)' : 'rgba(219,0,29,0.15)') : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${active ? (opt === 'ON' ? 'rgba(0,195,100,0.4)' : 'rgba(219,0,29,0.4)') : 'rgba(255,255,255,0.08)'}`,
                                            color: active ? (opt === 'ON' ? 'rgba(0,195,100,0.9)' : 'rgba(219,0,29,0.9)') : 'rgba(237,237,237,0.25)',
                                        }}
                                    >
                                        {opt}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Retention tiers */}
                    {RETENTION_FIELDS.map(field => (
                        <div key={field.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)', marginBottom: 2 }}>
                                    {field.label}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>
                                    {field.description}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                <button
                                    onClick={() => patchConfigDraft({ [field.key]: Math.max(field.min, configDraft[field.key] - 1) })}
                                    style={{
                                        width: 28, height: 28, cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(237,237,237,0.6)',
                                        fontSize: '1rem', lineHeight: 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >−</button>
                                <span style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: 'rgba(237,237,237,0.85)',
                                    minWidth: 28,
                                    textAlign: 'center',
                                }}>
                                    {configDraft[field.key]}
                                </span>
                                <button
                                    onClick={() => patchConfigDraft({ [field.key]: Math.min(field.max, configDraft[field.key] + 1) })}
                                    style={{
                                        width: 28, height: 28, cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(237,237,237,0.6)',
                                        fontSize: '1rem', lineHeight: 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >+</button>
                            </div>
                        </div>
                    ))}

                    <Typography fontSize='0.6rem'
                        style={{ color: 'rgba(237,237,237,0.3)', marginTop: 8, letterSpacing: 1 }}>
                        Retention can be extended, but not reduced — lower it in the server config.
                    </Typography>

                    {/* Save row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                        {configError && (
                            <Typography fontSize='0.72rem' style={{ color: 'rgba(219,0,29,0.9)' }}>
                                {configError}
                            </Typography>
                        )}
                        <button
                            onClick={handleSaveConfig}
                            disabled={!configDirty || configSaving}
                            style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                padding: '6px 20px',
                                background: (!configDirty || configSaving) ? 'none' : 'rgba(219,0,29,0.2)',
                                border: '1px solid rgba(219,0,29,0.4)',
                                color: (!configDirty || configSaving) ? 'rgba(237,237,237,0.25)' : '#ededed',
                                cursor: (!configDirty || configSaving) ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            {configSaving && <CircularProgress size={12} style={{ color: 'rgba(237,237,237,0.4)' }} />}
                            {configSaving ? 'Saving…' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Confirm dialog */}
            <ConfirmDialog
                open={confirm.open}
                title={confirm.title}
                body={confirm.body}
                danger={confirm.danger}
                onConfirm={() => {
                    const action = confirm.action
                    closeConfirm()
                    action?.()
                }}
                onCancel={closeConfirm}
            />

            {/* Scope menu behind each row's caret. The plain buttons still act
                on everything; this is for the "only the gallery" case. */}
            <Menu
                open={scopeMenu !== null}
                anchorEl={scopeMenu?.anchor ?? null}
                onClose={() => setScopeMenu(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: {
                    style: {
                        background: '#0b0b0b',
                        border: '1px solid rgba(219,0,29,0.25)',
                        borderRadius: 0,
                        minWidth: 210,
                    },
                } }}
            >
                {scopeMenu && (() => {
                    const point = scopeMenu.point
                    const available = availableParts(point)
                    const chosen = selectedParts(point)
                    const isDownload = scopeMenu.action === 'download'
                    const labels: Record<BackupPart, string> = { database: 'Database', gallery: 'Gallery', uploads: 'Uploads' }

                    return (
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={{
                                fontSize: '0.55rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                                color: 'rgba(237,237,237,0.35)',
                            }}>
                                {isDownload ? 'Download parts' : 'Restore parts'}
                            </span>

                            {available.map(part => (
                                <label key={part} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                    fontSize: '0.68rem', color: 'rgba(237,237,237,0.8)',
                                }}>
                                    <input
                                        type='checkbox'
                                        checked={scopeSel[part]}
                                        onChange={e => setScopeSel(s => ({ ...s, [part]: e.target.checked }))}
                                        style={{ accentColor: '#db001d', width: 13, height: 13, cursor: 'pointer' }}
                                    />
                                    <span style={{ flex: 1 }}>{labels[part]}</span>
                                    {/* Only the database has a per-part size. The media snapshot
                                        records one figure covering gallery and uploads together,
                                        so showing a split here would be invented. */}
                                    {part === 'database' && point.dbSizeBytes !== undefined && (
                                        <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)' }}>
                                            {fmtBytes(point.dbSizeBytes)}
                                        </span>
                                    )}
                                </label>
                            ))}

                            {point.mediaSizeBytes !== undefined && (
                                <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)' }}>
                                    Gallery + uploads together: {fmtBytes(point.mediaSizeBytes)}
                                </span>
                            )}

                            {/* Only for a restore, and only when a media part is
                                actually selected — a download writes nothing over
                                live files, and a database-only restore has no
                                media tree to clear. */}
                            {!isDownload && (chosen.includes('gallery') || chosen.includes('uploads')) && (
                                <label style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                                    fontSize: '0.68rem', color: 'rgba(237,237,237,0.8)',
                                    borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 2,
                                }}>
                                    <input
                                        type='checkbox'
                                        checked={wipeMedia}
                                        onChange={e => setWipeMedia(e.target.checked)}
                                        style={{ accentColor: '#db001d', width: 13, height: 13, cursor: 'pointer', marginTop: 2 }}
                                    />
                                    <span style={{ flex: 1 }}>
                                        Remove files not in this backup
                                        <span style={{ display: 'block', fontSize: '0.55rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                                            Media only. Deleted files stay recoverable from the
                                            safety backup taken before restoring.
                                        </span>
                                    </span>
                                </label>
                            )}

                            <button
                                disabled={chosen.length === 0}
                                onClick={() => {
                                    setScopeMenu(null)
                                    if (isDownload) triggerDownload(point, chosen)
                                    // The tick only ever means anything for the
                                    // media parts, so it is dropped when neither
                                    // is being restored.
                                    else handleRevert(point, chosen, wipeMedia && (chosen.includes('gallery') || chosen.includes('uploads')))
                                }}
                                style={{
                                    ...rowBtnSx(isDownload ? 'green' : 'red', `${point.id}:scope-go`),
                                    marginTop: 2,
                                    opacity: chosen.length === 0 ? 0.35 : 1,
                                    cursor: chosen.length === 0 ? 'not-allowed' : 'pointer',
                                }}
                                {...btnPointerProps(`${point.id}:scope-go`)}
                            >
                                {isDownload ? 'Download' : 'Revert'} {chosen.length === available.length ? 'all' : `(${chosen.length})`}
                            </button>
                        </div>
                    )
                })()}
            </Menu>
        </div>
    )
}
