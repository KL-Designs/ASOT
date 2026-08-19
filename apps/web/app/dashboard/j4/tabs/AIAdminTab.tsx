'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, Tabs, Tab, Dialog, DialogContent, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, Switch, FormControlLabel } from '@mui/material'
import { SmartToy, AttachMoney, BarChart, Settings, CheckCircle, Cancel } from '@mui/icons-material'

// ── Style helpers ──────────────────────────────────────────────────────────

const card = (accent = 'rgba(219,0,29,0.42)'): React.CSSProperties => ({
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${accent}`,
    borderTop: `2px solid ${accent.replace('0.42', '1').replace('rgba', 'rgba')}`,
    padding: '16px 20px',
})

const label: React.CSSProperties = {
    fontSize: '0.58rem',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'rgba(237,237,237,0.35)',
    marginBottom: 4,
}

const value: React.CSSProperties = {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#ededed',
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        '& fieldset': { borderColor: 'rgba(219,0,29,0.25)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        background: 'rgba(255,255,255,0.04)',
        color: '#ededed',
        borderRadius: 0,
    },
    '& .MuiInputLabel-root': { color: 'rgba(237,237,237,0.4)', fontSize: '0.85rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.4)' },
}

const tabSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    minHeight: 36,
    padding: '6px 14px',
    color: 'rgba(237,237,237,0.45)',
    '&.Mui-selected': { color: 'var(--foreground)' },
}

function Stat({ label: lbl, val, sub }: { label: string; val: string | number; sub?: string }) {
    return (
        <div style={{ flex: '1 1 160px' }}>
            <div style={label}>{lbl}</div>
            <div style={value}>{val}</div>
            {sub && <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>{sub}</div>}
        </div>
    )
}

function ProviderDot({ active }: { active: boolean }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {active
                ? <CheckCircle sx={{ fontSize: 14, color: 'rgb(0,195,100)' }} />
                : <Cancel       sx={{ fontSize: 14, color: 'rgba(219,0,29,0.8)' }} />}
            <span style={{ fontSize: '0.7rem', color: active ? 'rgb(0,195,100)' : 'rgba(219,0,29,0.8)' }}>
                {active ? 'Key set' : 'No key'}
            </span>
        </span>
    )
}

// ── Overview tab ───────────────────────────────────────────────────────────

interface UsageStats {
    totals: { costUsd: number; images: number; tokens: number; requests: number; errors: number }
    summary: Array<{ _id: string | null; costUsd: number; images: number; tokens: number; requests: number; errors: number }>
    recent: AiUsageRecord[]
}

function OverviewTab() {
    const [stats, setStats] = useState<UsageStats | null>(null)
    const [groupBy, setGroupBy] = useState<'feature' | 'provider' | 'department' | 'member' | 'model'>('feature')
    const [loading, setLoading] = useState(true)

    const load = useCallback(() => {
        setLoading(true)
        fetch(`/api/ai/usage?scope=month&groupBy=${groupBy}&limit=20`)
            .then(r => r.json())
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [groupBy])

    useEffect(() => { load() }, [load])

    const totals = stats?.totals

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Month totals */}
            <div>
                <div style={label}>This month</div>
                {loading ? (
                    <CircularProgress size={20} style={{ color: 'var(--red)', marginTop: 8 }} />
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
                        <div style={{ ...card(), flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <Stat label='Total cost' val={`$${(totals?.costUsd ?? 0).toFixed(4)}`} />
                        </div>
                        <div style={{ ...card(), flex: '1 1 130px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <Stat label='Requests' val={totals?.requests ?? 0} sub={`${totals?.errors ?? 0} errors`} />
                        </div>
                        <div style={{ ...card(), flex: '1 1 130px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <Stat label='Images generated' val={totals?.images ?? 0} />
                        </div>
                        <div style={{ ...card(), flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <Stat label='Text tokens' val={(totals?.tokens ?? 0).toLocaleString()} />
                        </div>
                    </div>
                )}
            </div>

            {/* Breakdown */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={label}>Breakdown by</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['feature', 'provider', 'department', 'member', 'model'] as const).map(g => (
                            <button
                                key={g}
                                onClick={() => setGroupBy(g)}
                                style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase',
                                    padding: '3px 10px',
                                    background: groupBy === g ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${groupBy === g ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                    color: groupBy === g ? '#ededed' : 'rgba(237,237,237,0.4)',
                                    cursor: 'pointer',
                                }}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? <CircularProgress size={16} style={{ color: 'var(--red)' }} /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {(stats?.summary ?? []).map(row => (
                            <div
                                key={row._id ?? 'null'}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    padding: '8px 14px',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                }}
                            >
                                <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }}>
                                    {row._id ?? '(unknown)'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', display: 'flex', gap: 16 }}>
                                    <span>${row.costUsd.toFixed(4)}</span>
                                    <span>{row.requests} req</span>
                                    {row.images > 0 && <span>{row.images} img</span>}
                                    {row.errors > 0 && <span style={{ color: 'rgba(219,0,29,0.8)' }}>{row.errors} err</span>}
                                </div>
                            </div>
                        ))}
                        {stats?.summary?.length === 0 && (
                            <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>
                                No AI usage this month.
                            </Typography>
                        )}
                    </div>
                )}
            </div>

            {/* Recent requests */}
            <div>
                <div style={label}>Recent requests</div>
                {loading ? <CircularProgress size={16} style={{ color: 'var(--red)', marginTop: 6 }} /> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 8 }}>
                        {(stats?.recent ?? []).map((r, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '7px 12px',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    fontSize: '0.73rem',
                                }}
                            >
                                <span style={{
                                    width: 56,
                                    padding: '1px 6px',
                                    background: r.status === 'success' ? 'rgba(0,195,100,0.1)' : 'rgba(219,0,29,0.1)',
                                    color: r.status === 'success' ? 'rgb(0,195,100)' : 'rgba(219,0,29,0.8)',
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                    letterSpacing: 1,
                                    textAlign: 'center',
                                }}>
                                    {r.status.toUpperCase()}
                                </span>
                                <span style={{ flex: 1, color: '#ededed' }}>{r.userName}</span>
                                <span style={{ color: 'rgba(237,237,237,0.4)' }}>{r.feature}</span>
                                <span style={{ color: 'rgba(237,237,237,0.4)' }}>{r.provider}/{r.model}</span>
                                <span style={{ color: 'rgba(237,237,237,0.55)', minWidth: 64, textAlign: 'right' }}>
                                    ${(r.actualCostUsd ?? r.estimatedCostUsd ?? 0).toFixed(4)}
                                </span>
                                <span style={{ color: 'rgba(237,237,237,0.25)', minWidth: 100, textAlign: 'right' }}>
                                    {new Date(r.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                            </div>
                        ))}
                        {stats?.recent?.length === 0 && (
                            <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.3)', padding: '8px 0' }}>
                                No requests yet.
                            </Typography>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Budgets tab ────────────────────────────────────────────────────────────

interface BudgetFormState {
    _id?: string
    scopeType: AiBudgetScopeType
    scopeKey: string
    scopeLabel: string
    monthlyLimitUsd: string
    textTokenMonthlyLimit: string
    imageMonthlyLimit: string
    warningThresholds: string
    hardStop: boolean
    enabled: boolean
}

const emptyBudgetForm = (): BudgetFormState => ({
    scopeType: 'site',
    scopeKey: 'site',
    scopeLabel: 'Site-wide',
    monthlyLimitUsd: '',
    textTokenMonthlyLimit: '',
    imageMonthlyLimit: '',
    warningThresholds: '75, 90, 100',
    hardStop: true,
    enabled: true,
})

function BudgetDialog({ open, initial, onClose, onSaved }: {
    open: boolean
    initial?: AiBudgetConfig
    onClose: () => void
    onSaved: () => void
}) {
    const [form, setForm] = useState<BudgetFormState>(emptyBudgetForm())
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            if (initial) {
                setForm({
                    _id: initial._id?.toString(),
                    scopeType: initial.scopeType,
                    scopeKey: initial.scopeKey,
                    scopeLabel: initial.scopeLabel,
                    monthlyLimitUsd: initial.monthlyLimitUsd?.toString() ?? '',
                    textTokenMonthlyLimit: initial.textTokenMonthlyLimit?.toString() ?? '',
                    imageMonthlyLimit: initial.imageMonthlyLimit?.toString() ?? '',
                    warningThresholds: initial.warningThresholds.map(t => Math.round(t * 100)).join(', '),
                    hardStop: initial.hardStop,
                    enabled: initial.enabled,
                })
            } else {
                setForm(emptyBudgetForm())
            }
            setError(null)
        }
    }, [open, initial])

    function set<K extends keyof BudgetFormState>(key: K, val: BudgetFormState[K]) {
        setForm(f => ({ ...f, [key]: val }))
    }

    async function save() {
        setSaving(true)
        setError(null)
        try {
            const thresholds = form.warningThresholds
                .split(',')
                .map(s => parseFloat(s.trim()) / 100)
                .filter(n => !isNaN(n))

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body: any = {
                _id: form._id,
                scopeType: form.scopeType,
                scopeKey: form.scopeKey,
                scopeLabel: form.scopeLabel,
                monthlyLimitUsd: form.monthlyLimitUsd ? parseFloat(form.monthlyLimitUsd) : undefined,
                textTokenMonthlyLimit: form.textTokenMonthlyLimit ? parseInt(form.textTokenMonthlyLimit, 10) : undefined,
                imageMonthlyLimit: form.imageMonthlyLimit ? parseInt(form.imageMonthlyLimit, 10) : undefined,
                warningThresholds: thresholds.length ? thresholds : [0.75, 0.90, 1.0],
                hardStop: form.hardStop,
                enabled: form.enabled,
            }

            const res = await fetch('/api/ai/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Save failed')
            } else {
                onSaved()
                onClose()
            }
        } catch {
            setError('Network error')
        } finally {
            setSaving(false)
        }
    }

    const SCOPE_TYPES: AiBudgetScopeType[] = ['site', 'department', 'role', 'member', 'feature']

    function onScopeTypeChange(t: AiBudgetScopeType) {
        const defaults: Record<AiBudgetScopeType, { key: string; label: string }> = {
            site:       { key: 'site',         label: 'Site-wide' },
            department: { key: '',             label: '' },
            role:       { key: '',             label: '' },
            member:     { key: '',             label: '' },
            feature:    { key: 'intel.image_generate', label: 'Intel Image Generate' },
        }
        const d = defaults[t]
        setForm(f => ({ ...f, scopeType: t, scopeKey: d.key, scopeLabel: d.label }))
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 500,
                    maxWidth: 580,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '24px 28px 20px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    AI Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 20 }}>
                    {form._id ? 'Edit Budget' : 'Add Budget'}
                </Typography>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Scope type */}
                    <FormControl fullWidth sx={inputSx}>
                        <InputLabel>Scope Type</InputLabel>
                        <Select
                            value={form.scopeType}
                            label='Scope Type'
                            onChange={e => onScopeTypeChange(e.target.value as AiBudgetScopeType)}
                            MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed' } } }}
                        >
                            {SCOPE_TYPES.map(t => <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>)}
                        </Select>
                    </FormControl>

                    {form.scopeType !== 'site' && (
                        <div style={{ display: 'flex', gap: 10 }}>
                            <TextField label='Scope Key *' value={form.scopeKey} onChange={e => set('scopeKey', e.target.value)} sx={inputSx} style={{ flex: 1 }}
                                helperText={form.scopeType === 'member' ? 'Discord user ID' : form.scopeType === 'feature' ? 'e.g. intel.image_generate' : 'Role or department name'}
                                FormHelperTextProps={{ style: { color: 'rgba(237,237,237,0.3)', fontSize: '0.65rem' } }}
                            />
                            <TextField label='Display Label *' value={form.scopeLabel} onChange={e => set('scopeLabel', e.target.value)} sx={inputSx} style={{ flex: 1 }} />
                        </div>
                    )}

                    {/* Limits */}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <TextField label='Monthly USD Cap' type='number' value={form.monthlyLimitUsd} onChange={e => set('monthlyLimitUsd', e.target.value)} sx={inputSx} style={{ flex: 1 }}
                            helperText='Leave blank for no limit'
                            FormHelperTextProps={{ style: { color: 'rgba(237,237,237,0.3)', fontSize: '0.65rem' } }}
                        />
                        <TextField label='Monthly Image Limit' type='number' value={form.imageMonthlyLimit} onChange={e => set('imageMonthlyLimit', e.target.value)} sx={inputSx} style={{ flex: 1 }} />
                    </div>

                    <TextField label='Monthly Token Limit' type='number' value={form.textTokenMonthlyLimit} onChange={e => set('textTokenMonthlyLimit', e.target.value)} sx={inputSx} fullWidth />

                    <TextField
                        label='Warning Thresholds (% of limit)'
                        value={form.warningThresholds}
                        onChange={e => set('warningThresholds', e.target.value)}
                        sx={inputSx}
                        fullWidth
                        helperText='Comma-separated percentages, e.g. 75, 90, 100'
                        FormHelperTextProps={{ style: { color: 'rgba(237,237,237,0.3)', fontSize: '0.65rem' } }}
                    />

                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={form.hardStop}
                                    onChange={e => set('hardStop', e.target.checked)}
                                    sx={{ '& .MuiSwitch-thumb': { background: 'var(--red)' }, '& .Mui-checked + .MuiSwitch-track': { background: 'rgba(219,0,29,0.5)' } }}
                                />
                            }
                            label={<span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)' }}>Hard stop at limit</span>}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={form.enabled}
                                    onChange={e => set('enabled', e.target.checked)}
                                    sx={{ '& .MuiSwitch-thumb': { background: 'var(--red)' }, '& .Mui-checked + .MuiSwitch-track': { background: 'rgba(219,0,29,0.5)' } }}
                                />
                            }
                            label={<span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)' }}>Enabled</span>}
                        />
                    </div>
                </div>

                {error && <Typography fontSize='0.75rem' style={{ color: '#ff4444', marginTop: 10 }}>{error}</Typography>}

                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}>
                        CANCEL
                    </button>
                    <button onClick={save} disabled={saving} style={{ background: 'rgba(219,0,29,0.3)', border: '1px solid rgba(219,0,29,0.27)', color: saving ? 'rgba(237,237,237,0.4)' : '#ededed', padding: '7px 18px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}>
                        {saving ? 'SAVING…' : 'SAVE'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function BudgetsTab() {
    const [budgets, setBudgets] = useState<AiBudgetConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<AiBudgetConfig | undefined>()
    const [deleting, setDeleting] = useState<string | null>(null)

    const load = useCallback(() => {
        setLoading(true)
        fetch('/api/ai/budgets')
            .then(r => r.json())
            .then(d => setBudgets(d.budgets ?? []))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { load() }, [load])

    async function deleteBudget(id: string) {
        setDeleting(id)
        await fetch(`/api/ai/budgets?id=${id}`, { method: 'DELETE' })
        setBudgets(prev => prev.filter(b => b._id?.toString() !== id))
        setDeleting(null)
    }

    const SCOPE_COLORS: Record<AiBudgetScopeType, string> = {
        site:       'rgba(219,0,29,0.8)',
        department: 'rgba(0,120,255,0.8)',
        role:       'rgba(140,0,200,0.8)',
        member:     'rgba(0,195,100,0.8)',
        feature:    'rgba(255,160,0,0.8)',
    }

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    Budget Configurations
                </Typography>
                <button
                    onClick={() => { setEditTarget(undefined); setDialogOpen(true) }}
                    style={{ background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.4)', color: '#ededed', padding: '5px 14px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, letterSpacing: 1 }}
                >
                    + ADD BUDGET
                </button>
            </div>

            {loading && <CircularProgress size={20} style={{ color: 'var(--red)' }} />}

            {!loading && budgets.length === 0 && (
                <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.3)' }}>
                    No budgets configured. Add a site-wide cap to get started.
                </Typography>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {budgets.map(b => (
                    <div
                        key={b._id?.toString()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            background: b.enabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            opacity: b.enabled ? 1 : 0.5,
                        }}
                    >
                        <span style={{
                            fontSize: '0.58rem', fontWeight: 700, letterSpacing: 1,
                            padding: '1px 7px',
                            background: `${SCOPE_COLORS[b.scopeType]}20`,
                            color: SCOPE_COLORS[b.scopeType],
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                        }}>
                            {b.scopeType}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{b.scopeLabel}</div>
                            <div style={{ fontSize: '0.67rem', color: 'rgba(237,237,237,0.35)', marginTop: 2, display: 'flex', gap: 10 }}>
                                {b.monthlyLimitUsd !== undefined && <span>${b.monthlyLimitUsd}/mo</span>}
                                {b.imageMonthlyLimit !== undefined && <span>{b.imageMonthlyLimit} imgs</span>}
                                {b.textTokenMonthlyLimit !== undefined && <span>{b.textTokenMonthlyLimit.toLocaleString()} tokens</span>}
                                {b.monthlyLimitUsd === undefined && b.imageMonthlyLimit === undefined && b.textTokenMonthlyLimit === undefined && (
                                    <span style={{ color: 'rgba(237,237,237,0.2)' }}>No limits set</span>
                                )}
                                <span>{b.hardStop ? '· Hard stop' : '· Soft warning'}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button
                                onClick={() => { setEditTarget(b); setDialogOpen(true) }}
                                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '4px 12px', cursor: 'pointer', fontSize: '0.65rem', letterSpacing: 1 }}
                            >
                                EDIT
                            </button>
                            <button
                                onClick={() => deleteBudget(b._id!.toString())}
                                disabled={deleting === b._id?.toString()}
                                style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.6)', padding: '4px 12px', cursor: 'pointer', fontSize: '0.65rem', letterSpacing: 1 }}
                            >
                                {deleting === b._id?.toString() ? '…' : 'DELETE'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <BudgetDialog
                open={dialogOpen}
                initial={editTarget}
                onClose={() => setDialogOpen(false)}
                onSaved={load}
            />
        </div>
    )
}

// ── Settings tab ───────────────────────────────────────────────────────────

interface SiteConfigData {
    config: AiSiteConfig
    providerStatus: { anthropic: boolean; openai: boolean }
}

function SettingsTab() {
    const [data, setData] = useState<SiteConfigData | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        fetch('/api/ai/config')
            .then(r => r.json())
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [])

    async function save() {
        if (!data) return
        setSaving(true)
        setError(null)
        setSaved(false)
        try {
            const res = await fetch('/api/ai/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.config),
            })
            const resp = await res.json()
            if (!res.ok) {
                setError(resp.error ?? 'Save failed')
            } else {
                setSaved(true)
                setTimeout(() => setSaved(false), 3000)
            }
        } catch {
            setError('Network error')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div style={{ padding: 24 }}><CircularProgress size={20} style={{ color: 'var(--red)' }} /></div>
    if (!data) return null

    const { config, providerStatus } = data

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>
            {/* Global toggle */}
            <div style={card()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={label}>AI Features</div>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)', marginTop: 2 }}>
                            Globally enable or disable all AI features site-wide.
                        </div>
                    </div>
                    <Switch
                        checked={config.globalEnabled}
                        onChange={e => setData(d => d && ({ ...d, config: { ...d.config, globalEnabled: e.target.checked } }))}
                        sx={{ '& .MuiSwitch-thumb': { background: 'var(--red)' }, '& .Mui-checked + .MuiSwitch-track': { background: 'rgba(219,0,29,0.5)' } }}
                    />
                </div>
            </div>

            {/* Provider status */}
            <div style={card()}>
                <div style={label}>Provider Status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                    {/* Anthropic */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <SmartToy sx={{ fontSize: 18, color: 'rgba(237,237,237,0.4)' }} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Anthropic Claude</span>
                            <ProviderDot active={providerStatus.anthropic} />
                        </div>
                        <Switch
                            checked={config.providers.anthropic.enabled}
                            onChange={e => setData(d => d && ({
                                ...d,
                                config: { ...d.config, providers: { ...d.config.providers, anthropic: { ...d.config.providers.anthropic, enabled: e.target.checked } } }
                            }))}
                            sx={{ '& .MuiSwitch-thumb': { background: 'var(--red)' }, '& .Mui-checked + .MuiSwitch-track': { background: 'rgba(219,0,29,0.5)' } }}
                        />
                    </div>
                    <TextField
                        label='Default Claude model'
                        value={config.providers.anthropic.defaultModel}
                        onChange={e => setData(d => d && ({
                            ...d,
                            config: { ...d.config, providers: { ...d.config.providers, anthropic: { ...d.config.providers.anthropic, defaultModel: e.target.value } } }
                        }))}
                        sx={inputSx}
                        size='small'
                        fullWidth
                    />

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <SmartToy sx={{ fontSize: 18, color: 'rgba(237,237,237,0.4)' }} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>OpenAI</span>
                            <ProviderDot active={providerStatus.openai} />
                        </div>
                        <Switch
                            checked={config.providers.openai.enabled}
                            onChange={e => setData(d => d && ({
                                ...d,
                                config: { ...d.config, providers: { ...d.config.providers, openai: { ...d.config.providers.openai, enabled: e.target.checked } } }
                            }))}
                            sx={{ '& .MuiSwitch-thumb': { background: 'var(--red)' }, '& .Mui-checked + .MuiSwitch-track': { background: 'rgba(219,0,29,0.5)' } }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <TextField
                            label='Default OpenAI text model'
                            value={config.providers.openai.defaultModel}
                            onChange={e => setData(d => d && ({
                                ...d,
                                config: { ...d.config, providers: { ...d.config.providers, openai: { ...d.config.providers.openai, defaultModel: e.target.value } } }
                            }))}
                            sx={inputSx}
                            size='small'
                            style={{ flex: 1 }}
                        />
                        <TextField
                            label='Default image model'
                            value={config.providers.openai.defaultImageModel}
                            onChange={e => setData(d => d && ({
                                ...d,
                                config: { ...d.config, providers: { ...d.config.providers, openai: { ...d.config.providers.openai, defaultImageModel: e.target.value } } }
                            }))}
                            sx={inputSx}
                            size='small'
                            style={{ flex: 1 }}
                        />
                    </div>
                </div>
            </div>

            {error && <Typography fontSize='0.75rem' style={{ color: '#ff4444' }}>{error}</Typography>}
            {saved && <Typography fontSize='0.75rem' style={{ color: 'rgb(0,195,100)' }}>Settings saved.</Typography>}

            <button
                onClick={save}
                disabled={saving}
                style={{
                    alignSelf: 'flex-start',
                    background: 'rgba(219,0,29,0.3)',
                    border: '1px solid rgba(219,0,29,0.5)',
                    color: saving ? 'rgba(237,237,237,0.4)' : '#ededed',
                    padding: '8px 24px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    letterSpacing: 2,
                }}
            >
                {saving ? 'SAVING…' : 'SAVE SETTINGS'}
            </button>
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AIAdminTab() {
    const [tab, setTab] = useState(0)

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Sub-tabs */}
            <div style={{ borderBottom: '1px solid var(--line-2)', padding: '0 24px' }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 36 }}
                >
                    <Tab icon={<BarChart sx={{ fontSize: 14 }} />} iconPosition='start' label='Overview'  sx={tabSx} />
                    <Tab icon={<AttachMoney sx={{ fontSize: 14 }} />} iconPosition='start' label='Budgets' sx={tabSx} />
                    <Tab icon={<Settings sx={{ fontSize: 14 }} />} iconPosition='start' label='Settings'  sx={tabSx} />
                </Tabs>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {tab === 0 && <OverviewTab />}
                {tab === 1 && <BudgetsTab />}
                {tab === 2 && <SettingsTab />}
            </div>
        </div>
    )
}
