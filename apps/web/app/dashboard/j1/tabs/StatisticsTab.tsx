'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Alert } from '@mui/material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import {
    ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
    PieChart, Pie, Legend,
} from 'recharts'

type Application = J1Application & { _id: string }

// ── Role normalisation ─────────────────────────────────────────────────────────
// Maps legacy and current form strings → canonical labels.
// Old roles are merged into new ones per the mapping agreed with J4:
//   Infantry              → Infantry
//   CFA / Section Medic   → Combat First Aider (Section Medic)
//   Advanced Medic        → Medical Emergency Response Team
//   Rotary / Fixed Wing   → Aviation
//   Armoured Crew         → Cavalry
//   Engineer              → Combat Engineers
//   Indirect Fire +
//   Heavy Weapons         → Indirect Fire & Heavy Weapons
//   Logistics, Recon, GMZ, TAC, Marksman — remain as-is
function normalizeRole(raw: string): string | null {
    const s = raw.toLowerCase().trim()
    if (s.length < 3) return null
    if (s.length > 50) return null
    if (['idk', "don't know", 'not sure', 'unsure', 'wherever', 'reserve', 'can i just'].some(x => s.includes(x))) return null

    if (s.includes('infantry')) return 'Infantry'

    // Combat First Aider (Section Medic) — merges CFA, Section Medic, medic (non-advanced)
    if (s.includes('combat first aider') || s.includes('section medic')) return 'Combat First Aider (Section Medic)'
    if (s.startsWith('cfa') || s.includes(' cfa') || s.includes('(cfa)')) return 'Combat First Aider (Section Medic)'
    if (s.includes('advanced medic') || s.includes('medical emergency') || s.includes('mert')) return 'Medical Emergency Response Team'
    if (s.includes('medic')) return 'Combat First Aider (Section Medic)'

    // Aviation — merges Rotary Aviation + Fixed Wing Aviation
    if (s.includes('aviation') || s.includes('rotary') || s.includes('helicopter') || s.includes('heli') ||
        s.includes('fixed wing') || s.includes('fixed-wing') || s.includes('fixed_wing') || s.includes('jet'))
        return 'Aviation'

    // Cavalry — merges Armoured Crew
    if (s.includes('cavalry') || s.includes('armored') || s.includes('armoured') || s.includes('crewman'))
        return 'Cavalry'

    // Combat Engineers — merges Engineer/Sapper
    if (s.includes('combat engineer') || s.includes('sapper')) return 'Combat Engineers'
    if (s.includes('engineer') && !s.includes('indirect')) return 'Combat Engineers'

    // Indirect Fire & Heavy Weapons — merges both legacy entries
    if (s.includes('indirect fire') || s.includes('mortar') || s.includes('artillery') || s.includes('heavy weapon'))
        return 'Indirect Fire & Heavy Weapons'

    // Kept separate
    if (s.includes('machine gun') || (s.includes(' mg') && s.includes('gunner'))) return 'Machine Gunner'
    if (s.includes('anti-tank') || s.includes('anti tank') || s.includes('mat ')) return 'Medium Anti-Tank'
    if (s.includes('logistics') || s.includes('logi')) return 'Logistics'
    if (s.includes('reconnai') || s.includes('recon') || s.includes('drone') || s.includes('uav')) return 'Reconnaissance'
    if (s.includes('zeus') || s.includes('gamemaster') || s.includes('game master')) return 'Game Master (Zeus)'
    if (s.includes('terminal attack') || s.includes('jtac')) return 'Terminal Attack Controller'
    if (s.includes('sniper') || s.includes('marksman')) return 'Marksman / Sniper'

    return raw.trim()
}

// ── Region normalisation ───────────────────────────────────────────────────────
function normalizeRegion(raw: string): string {
    const s = raw.toLowerCase()
    if (s.includes('oceania') || s.includes('australia') || s.startsWith('aus') ||
        s.includes('new zealand') || s.includes('pacific')) return 'Oceania'
    if (s.includes('asia') || s.includes('korea') || s.includes('japan') ||
        s.includes('india') || s.includes('sri lanka') || s.includes('pakistan')) return 'Asia'
    if (s.includes('north america') || s.includes('canada') || s.includes('united states') || s.includes('usa')) return 'North America'
    if (s.includes('south america') || s.includes('central america') || s.includes('latin') ||
        s.includes('north/central/south') || s === 'americas') return 'South America'
    if (s.includes('europe')) return 'Europe'
    if (s.includes('middle east')) return 'Middle East'
    if (s.includes('russia') || s.includes('cis')) return 'Russia / CIS'
    if (s.includes('africa')) return 'Africa'
    return raw.trim()
}

// ── ARMA hours buckets (in lots of 1,000) ─────────────────────────────────────
const HOURS_ORDER = ['< 1,000', '1,000 – 1,999', '2,000 – 2,999', '3,000 – 3,999', '4,000 – 4,999', '5,000+']
function normalizeArmaHours(raw: string | undefined): string | null {
    if (!raw) return null
    const n = parseInt(raw, 10)
    if (isNaN(n) || n < 0) return null
    if (n < 1000) return '< 1,000'
    if (n < 2000) return '1,000 – 1,999'
    if (n < 3000) return '2,000 – 2,999'
    if (n < 4000) return '3,000 – 3,999'
    if (n < 5000) return '4,000 – 4,999'
    return '5,000+'
}

// ── Age buckets ────────────────────────────────────────────────────────────────
const AGE_ORDER = ['Under 18', '18 – 29', '30 – 39', '40 – 49', '50 – 59', '60+']
function normalizeAge(raw: number | string | undefined): string | null {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
    if (isNaN(n) || n < 1 || n > 120) return null
    if (n < 18) return 'Under 18'
    if (n < 30) return '18 – 29'
    if (n < 40) return '30 – 39'
    if (n < 50) return '40 – 49'
    if (n < 60) return '50 – 59'
    return '60+'
}

// ── Constants ─────────────────────────────────────────────────────────────────
const RED   = '#db001d'
const GREEN = '#00c364'
const BLUE  = '#00c3ff'
const AMBER = 'var(--amber)'

const PALETTE = [
    '#db001d', '#00c3ff', '#00c364', 'var(--amber)',
    '#a855f7', 'var(--amber)', '#06b6d4', '#84cc16',
    '#ec4899', '#6366f1', '#14b8a6', 'var(--amber)',
]

const NIGHTS_ORDER = ['Saturday', 'Sunday', 'Both', 'Flexible']
const OPS_ORDER    = ['1+', '2+', '3+', '4+']

// ── Shared chart config ────────────────────────────────────────────────────────
const tooltipStyle = {
    contentStyle: { background: '#111', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0, fontSize: '0.78rem', color: '#ededed' },
    cursor: { fill: 'rgba(255,255,255,0.04)' },
}
const axisStyle = {
    tick: { fill: 'rgba(237,237,237,0.35)', fontSize: 11 },
    axisLine: { stroke: 'rgba(219,0,29,0.3)' },
    tickLine: false as const,
}

// ── Helper: build ordered count array ─────────────────────────────────────────
function countOrdered(vals: (string | null)[], order: string[]): { name: string; value: number }[] {
    const m: Record<string, number> = {}
    for (const v of vals) if (v) m[v] = (m[v] ?? 0) + 1
    return order.filter(k => k in m).map(k => ({ name: k, value: m[k] }))
}
function countSorted(vals: (string | null)[]): { name: string; value: number }[] {
    const m: Record<string, number> = {}
    for (const v of vals) if (v) m[v] = (m[v] ?? 0) + 1
    return Object.entries(m).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }))
}

// ── Reusable components ────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className='flex flex-col gap-1 px-5 py-4' style={{ border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.1 }}>{value}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>{sub}</div>}
        </div>
    )
}

function SubLabel({ text }: { text: string }) {
    return (
        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 10, marginTop: 22 }}>
            {text}
        </div>
    )
}

function ChartLabel({ text }: { text: string }) {
    return <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.28)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.16em' }}>{text}</div>
}

function HorizBar({ data, label }: { data: { name: string; value: number }[]; label: string }) {
    if (!data.length) return null
    return (
        <div style={{ width: '100%', height: Math.max(120, data.length * 34) }}>
            <ResponsiveContainer>
                <BarChart data={data} layout='vertical' margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke='rgba(219,0,29,0.08)' />
                    <XAxis type='number' {...axisStyle} allowDecimals={false} />
                    <YAxis type='category' dataKey='name' width={170} tick={{ fill: 'rgba(237,237,237,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, label]} />
                    <Bar dataKey='value' radius={[0, 2, 2, 0]} maxBarSize={18}>
                        {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}

function SmallPie({ data }: { data: { name: string; value: number; color: string }[] }) {
    if (!data.length) return null
    return (
        <div style={{ width: '100%', height: 190 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie data={data} dataKey='value' nameKey='name' cx='50%' cy='50%' innerRadius={42} outerRadius={72} paddingAngle={3}>
                        {data.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Applicants']} />
                    <Legend iconType='square' iconSize={10} formatter={(v) => <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)' }}>{v}</span>} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    )
}

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div style={{ border: '1px solid var(--line-2)', marginBottom: 6 }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    all: 'unset', cursor: 'pointer', width: '100%', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    padding: '13px 18px',
                    background: open ? 'rgba(219,0,29,0.07)' : 'rgba(255,255,255,0.02)',
                    borderBottom: open ? '1px solid rgba(219,0,29,0.12)' : 'none',
                }}
            >
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)' }}>
                    {title}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {open && <div style={{ padding: '18px 18px 24px' }}>{children}</div>}
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StatisticsTab() {
    const [applications, setApplications] = useState<Application[]>([])
    const [loading,      setLoading]      = useState(true)
    const [error,        setError]        = useState<string | null>(null)
    const [recruiterPeriod, setRecruiterPeriod] = useState<'all' | '90' | '30'>('all')

    const fetchApps = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const res = await fetch('/api/admin/j1/applications')
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            setApplications(data.applications)
        } catch {
            setError('Failed to load data.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchApps() }, [fetchApps])

    // ── Applicant stats ────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total     = applications.length
        const accepted  = applications.filter(a => a.status === 'accepted').length
        const pending   = applications.filter(a => a.status === 'pending').length
        const reviewing = applications.filter(a => a.status === 'reviewing').length
        const rejected  = applications.filter(a => a.status === 'rejected').length
        const acceptRate = total > 0 ? Math.round((accepted / total) * 100) : 0

        const fmtMonth = (key: string) => {
            const [y, m] = key.split('-')
            return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
        }
        const buildMonthSeries = (apps: Application[]) => {
            const m: Record<string, number> = {}
            for (const a of apps) {
                const d = new Date(a.submittedAt)
                const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                m[k] = (m[k] ?? 0) + 1
            }
            return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, count]) => ({ month: fmtMonth(k), count }))
        }

        const monthlyData         = buildMonthSeries(applications)
        const acceptedMonthlyData = buildMonthSeries(applications.filter(a => a.status === 'accepted'))

        const statusData = [
            { name: 'Pending',   value: pending,   color: AMBER },
            { name: 'Reviewing', value: reviewing, color: BLUE  },
            { name: 'Accepted',  value: accepted,  color: GREEN },
            { name: 'Rejected',  value: rejected,  color: RED   },
        ].filter(d => d.value > 0)

        // Background
        const regionData  = countSorted(applications.filter(a => a.region).map(a => normalizeRegion(a.region!)))
        const hoursData   = countOrdered(applications.map(a => normalizeArmaHours(a.armaHours)), HOURS_ORDER)
        const ageData     = countOrdered(applications.map(a => normalizeAge(a.age)), AGE_ORDER)
        const heardData   = countSorted(applications.filter(a => a.heardAbout).map(a =>
            a.heardAbout === 'Other' && a.heardAboutOther
                ? `Other: ${a.heardAboutOther.slice(0, 28)}`
                : (a.heardAbout ?? null)
        ))
        const priorMilsimData = [
            { name: 'Has prior milsim experience',   value: applications.filter(a => a.priorMilsim === true).length,  color: BLUE },
            { name: 'No prior milsim experience',    value: applications.filter(a => a.priorMilsim === false).length, color: 'rgba(237,237,237,0.18)' },
        ].filter(d => d.value > 0)
        const dualClanData = [
            { name: 'In another unit',               value: applications.filter(a => a.dualClan === true).length,  color: AMBER },
            { name: 'Not in another unit',           value: applications.filter(a => a.dualClan === false).length, color: 'rgba(237,237,237,0.18)' },
        ].filter(d => d.value > 0)

        // Availability
        const nightsData = countOrdered(applications.map(a => a.availableNights ?? null), NIGHTS_ORDER)
        const opsData    = countOrdered(applications.map(a => a.opsPerMonth ?? null), OPS_ORDER)

        // Roles
        const primaryRoleData   = countSorted(applications.filter(a => a.status === 'accepted' && a.primaryRole).map(a => normalizeRole(a.primaryRole!)))
        const secondaryRoleData = countSorted(applications.filter(a => a.secondaryRole).map(a => normalizeRole(a.secondaryRole!)))
        const addlMap: Record<string, number> = {}
        for (const app of applications) {
            for (const r of (app.additionalRoles ?? [])) {
                const key = normalizeRole(r)
                if (key) addlMap[key] = (addlMap[key] ?? 0) + 1
            }
        }
        const additionalRoleData = Object.entries(addlMap).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }))

        return {
            total, accepted, pending, reviewing, rejected, acceptRate,
            monthlyData, acceptedMonthlyData, statusData,
            regionData, hoursData, ageData, heardData, priorMilsimData, dualClanData,
            nightsData, opsData,
            primaryRoleData, secondaryRoleData, additionalRoleData,
        }
    }, [applications])

    // ── Recruiter stats ────────────────────────────────────────────────────────
    const recruiterStats = useMemo(() => {
        const cutoff = recruiterPeriod === 'all' ? null : new Date(Date.now() - Number(recruiterPeriod) * 86400000)
        const pool   = applications.filter(a => a.status === 'accepted' && a.recruiter && (!cutoff || new Date(a.submittedAt) >= cutoff))
        const map: Record<string, number> = {}
        for (const app of pool) map[app.recruiter!] = (map[app.recruiter!] ?? 0) + 1
        const data = Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, count]) => ({ name, count }))

        const allMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.status === 'accepted' && a.recruiter))
            allMap[app.recruiter!] = (allMap[app.recruiter!] ?? 0) + 1
        const allSorted   = Object.entries(allMap).sort(([, a], [, b]) => b - a)
        const topAllTime  = allSorted[0] ? { name: allSorted[0][0], count: allSorted[0][1] } : null

        const mStart = new Date(); mStart.setDate(1); mStart.setHours(0, 0, 0, 0)
        const mMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.status === 'accepted' && a.recruiter && new Date(a.submittedAt) >= mStart))
            mMap[app.recruiter!] = (mMap[app.recruiter!] ?? 0) + 1
        const mSorted     = Object.entries(mMap).sort(([, a], [, b]) => b - a)
        const topThisMonth = mSorted[0] ? { name: mSorted[0][0], count: mSorted[0][1] } : null

        return { data, topAllTime, topThisMonth, totalRecruited: pool.length }
    }, [applications, recruiterPeriod])

    // ── Render ─────────────────────────────────────────────────────────────────
    if (loading) return <TacticalSkeleton rows={8} className='p-6' />
    if (error)   return <div className='p-6'><Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert></div>
    if (!applications.length) return (
        <div className='flex items-center justify-center py-16' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem' }}>No application data yet.</div>
    )

    return (
        <div className='flex flex-col gap-2 p-5'>

            {/* ── Applicant Statistics ── */}
            <CollapsibleSection title='Applicant Statistics' defaultOpen>

                {/* Overview */}
                <SubLabel text='Overview' />
                <div className='grid grid-cols-2 md:grid-cols-5 gap-3'>
                    <StatCard label='Total Applications' value={stats.total} />
                    <StatCard label='Accepted'           value={stats.accepted}  sub={`${stats.acceptRate}% accept rate`} />
                    <StatCard label='Pending'            value={stats.pending} />
                    <StatCard label='Reviewing'          value={stats.reviewing} />
                    <StatCard label='Rejected'           value={stats.rejected} />
                </div>

                {stats.monthlyData.length > 1 && <>
                    <SubLabel text='Applications Per Month' />
                    <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                            <BarChart data={stats.monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke='rgba(219,0,29,0.08)' />
                                <XAxis dataKey='month' {...axisStyle} />
                                <YAxis {...axisStyle} allowDecimals={false} />
                                <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Applications']} />
                                <Bar dataKey='count' fill={RED} radius={[2, 2, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>}

                {stats.acceptedMonthlyData.length > 1 && <>
                    <SubLabel text='Recruits Accepted Per Month' />
                    <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                            <BarChart data={stats.acceptedMonthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke='rgba(0,195,100,0.08)' />
                                <XAxis dataKey='month' {...axisStyle} />
                                <YAxis {...axisStyle} allowDecimals={false} />
                                <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Accepted']} />
                                <Bar dataKey='count' fill={GREEN} radius={[2, 2, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>}

                {stats.statusData.length > 1 && <>
                    <SubLabel text='Application Status Distribution' />
                    <div style={{ width: '100%', height: 240 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={stats.statusData} dataKey='value' nameKey='name' cx='50%' cy='50%' innerRadius={55} outerRadius={90} paddingAngle={3}>
                                    {stats.statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                </Pie>
                                <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Applications']} />
                                <Legend iconType='square' iconSize={10} formatter={(v) => <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)' }}>{v}</span>} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </>}

                {/* Background */}
                <SubLabel text='Background' />
                <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                    {stats.regionData.length > 0 && <div><ChartLabel text='Region (All Applicants)' /><HorizBar data={stats.regionData} label='Applicants' /></div>}
                    {stats.hoursData.length  > 0 && <div><ChartLabel text='ARMA 3 Hours'            /><HorizBar data={stats.hoursData}  label='Applicants' /></div>}
                    {stats.ageData.length    > 0 && <div><ChartLabel text='Age'                     /><HorizBar data={stats.ageData}    label='Applicants' /></div>}
                </div>
                {(stats.priorMilsimData.length > 0 || stats.dualClanData.length > 0) && (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-8' style={{ marginTop: 12 }}>
                        {stats.priorMilsimData.length > 0 && <div><ChartLabel text='Prior Milsim Experience' /><SmallPie data={stats.priorMilsimData} /></div>}
                        {stats.dualClanData.length    > 0 && <div><ChartLabel text='Currently in Another ARMA Unit' /><SmallPie data={stats.dualClanData} /></div>}
                    </div>
                )}
                {stats.heardData.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        <ChartLabel text='How They Heard About Us' />
                        <HorizBar data={stats.heardData} label='Applicants' />
                    </div>
                )}

                {/* Availability */}
                {(stats.nightsData.length > 0 || stats.opsData.length > 0) && <>
                    <SubLabel text='Availability' />
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                        {stats.nightsData.length > 0 && <div><ChartLabel text='Operation Nights'     /><HorizBar data={stats.nightsData} label='Applicants' /></div>}
                        {stats.opsData.length    > 0 && <div><ChartLabel text='Operations Per Month' /><HorizBar data={stats.opsData}    label='Applicants' /></div>}
                    </div>
                </>}

                {/* Roles */}
                {(stats.primaryRoleData.length > 0 || stats.secondaryRoleData.length > 0 || stats.additionalRoleData.length > 0) && <>
                    <SubLabel text='Roles' />
                    {stats.primaryRoleData.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <ChartLabel text='Primary Role (Accepted Members)' />
                            <HorizBar data={stats.primaryRoleData} label='Members' />
                        </div>
                    )}
                    {stats.secondaryRoleData.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <ChartLabel text='Secondary Role Preference (All Applicants)' />
                            <HorizBar data={stats.secondaryRoleData} label='Applicants' />
                        </div>
                    )}
                    {stats.additionalRoleData.length > 0 && (
                        <div>
                            <ChartLabel text='Additional Role Interests (All Applicants)' />
                            <HorizBar data={stats.additionalRoleData} label='Selections' />
                        </div>
                    )}
                </>}

            </CollapsibleSection>

            {/* ── Recruiter Statistics ── */}
            {recruiterStats.topAllTime && (
                <CollapsibleSection title='Recruiter Statistics' defaultOpen={false}>

                    <div className='grid grid-cols-2 md:grid-cols-3 gap-3' style={{ marginBottom: 20 }}>
                        <StatCard label='Top Recruiter (All Time)'   value={recruiterStats.topAllTime.name}         sub={`${recruiterStats.topAllTime.count} recruits`} />
                        <StatCard label='Top Recruiter (This Month)' value={recruiterStats.topThisMonth?.name ?? '—'} sub={recruiterStats.topThisMonth ? `${recruiterStats.topThisMonth.count} recruits` : undefined} />
                        <StatCard label={recruiterPeriod === 'all' ? 'Total Recruited (All Time)' : `Total Recruited (Last ${recruiterPeriod}d)`} value={recruiterStats.totalRecruited} />
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                        {(['all', '90', '30'] as const).map(p => (
                            <button key={p} onClick={() => setRecruiterPeriod(p)} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', padding: '4px 12px', background: recruiterPeriod === p ? 'rgba(219,0,29,0.2)' : 'none', border: `1px solid ${recruiterPeriod === p ? 'rgba(219,0,29,0.5)' : 'rgba(237,237,237,0.1)'}`, color: recruiterPeriod === p ? '#ededed' : 'rgba(237,237,237,0.35)', cursor: 'pointer' }}>
                                {p === 'all' ? 'All Time' : `Last ${p}d`}
                            </button>
                        ))}
                    </div>

                    {recruiterStats.data.length > 0 ? (
                        <div style={{ width: '100%', height: Math.max(160, recruiterStats.data.length * 36) }}>
                            <ResponsiveContainer>
                                <BarChart data={recruiterStats.data} layout='vertical' margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                                    <CartesianGrid horizontal={false} stroke='rgba(219,0,29,0.08)' />
                                    <XAxis type='number' {...axisStyle} allowDecimals={false} />
                                    <YAxis type='category' dataKey='name' width={130} tick={{ fill: 'rgba(237,237,237,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Recruits']} />
                                    <Bar dataKey='count' radius={[0, 2, 2, 0]} maxBarSize={18}>
                                        {recruiterStats.data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>No recruiter data for this period.</div>
                    )}

                </CollapsibleSection>
            )}

        </div>
    )
}
