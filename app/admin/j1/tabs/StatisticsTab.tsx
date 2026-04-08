'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Alert } from '@mui/material'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'
import {
    ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
    PieChart, Pie, Legend,
} from 'recharts'

type Application = J1Application & { _id: string }

// Normalise raw primary role strings from old Google Form options → canonical labels.
// Returns null for non-answers that should be excluded from the chart.
function normalizeRole(raw: string): string | null {
    const s = raw.toLowerCase().trim()
    // Filter out non-answers
    if (s.length < 3) return null
    // Filter out non-answers / free-text rambling (longer than any valid role name)
    if (s.length > 40) return null
    if (s.includes('idk') || s.includes("don't know") || s.includes('not sure') || s.includes('unsure') || s.includes('wherever') || s.includes('reserve') || s.includes('can i just')) return null
    // Canonical mappings
    if (s.includes('infantry')) return 'Infantry'
    if (s.includes('section medic')) return 'Section Medic'
    if (s.includes('advanced medic')) return 'Advanced Medic'
    if (s.includes('medic')) return 'Section Medic'
    if (s.includes('rotary') || s.includes('helicopter') || s.includes('heli')) return 'Rotary Aviation'
    if (s.includes('fixed wing') || s.includes('fixed-wing') || s.includes('jet')) return 'Fixed Wing Aviation'
    if (s.includes('armored') || s.includes('armoured') || s.includes('tank') || s.includes('crewman')) return 'Armored Crew'
    if (s.includes('machine gun') || s.includes('mg') || s.includes('mg gunner')) return 'Machine Gunner'
    if (s.includes('anti-tank') || s.includes('anti tank') || s.includes('mat ')) return 'Medium Anti-Tank'
    if (s.includes('engineer') || s.includes('sapper')) return 'Engineer'
    if (s.includes('logistics') || s.includes('logi')) return 'Logistics'
    if (s.includes('indirect fire') || s.includes('mortar') || s.includes('artillery')) return 'Indirect Fire'
    if (s.includes('heavy weapon')) return 'Heavy Weapons'
    if (s.includes('reconnai') || s.includes('recon') || s.includes('drone') || s.includes('uav')) return 'Reconnaissance'
    if (s.includes('zeus') || s.includes('gamemaster') || s.includes('game master')) return 'Game Master (Zeus)'
    if (s.includes('terminal attack') || s.includes('jtac') || s.includes('tac')) return 'Terminal Attack Controller'
    if (s.includes('sniper') || s.includes('marksman')) return 'Marksman / Sniper'
    // Return trimmed original for anything unrecognised
    return raw.trim()
}

// Normalise region strings — mainly a safety net for pre-normalisation legacy records
function normalizeRegion(raw: string): string {
    const s = raw.toLowerCase()
    if (s.includes('oceania') || s.includes('australia') || s.startsWith('aus') || s.includes('brisbane') || s.includes('new zealand') || s.includes('pacific island')) return 'Oceania'
    if (s.includes('asia') || s.includes('korea') || s.includes('japan') || s.includes('india') || s.includes('sri lanka') || s.includes('pakistan')) return 'Asia'
    if (s.includes('north america') || s.includes('canada') || s.includes('united states') || s.includes('usa')) return 'North America'
    if (s.includes('south america') || s.includes('central america') || s.includes('latin') || s.includes('north/central/south') || s === 'americas') return 'South America'
    if (s.includes('europe')) return 'Europe'
    if (s.includes('middle east')) return 'Middle East'
    if (s.includes('russia') || s.includes('cis')) return 'Russia / CIS'
    if (s.includes('africa')) return 'Africa'
    return raw.trim()
}

const RED = '#db001d'
const GREEN = '#00c364'
const BLUE = '#00c3ff'
const AMBER = '#f59e0b'

const PALETTE = [
    '#db001d', '#00c3ff', '#00c364', '#f59e0b',
    '#a855f7', '#f97316', '#06b6d4', '#84cc16',
    '#ec4899', '#6366f1', '#14b8a6', '#eab308',
]

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div
            className='flex flex-col gap-1 px-5 py-4'
            style={{ border: '1px solid rgba(219,0,29,0.12)', background: 'rgba(255,255,255,0.01)' }}
        >
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                {label}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.1 }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>{sub}</div>}
        </div>
    )
}

const tooltipStyle = {
    contentStyle: {
        background: '#111',
        border: '1px solid rgba(219,0,29,0.32)',
        borderRadius: 0,
        fontSize: '0.78rem',
        color: '#ededed',
    },
    cursor: { fill: 'rgba(255,255,255,0.04)' },
}

const axisStyle = {
    tick: { fill: 'rgba(237,237,237,0.35)', fontSize: 11 },
    axisLine: { stroke: 'rgba(219,0,29,0.3)' },
    tickLine: false as const,
}

export default function StatisticsTab() {
    const [applications, setApplications] = useState<Application[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [recruiterPeriod, setRecruiterPeriod] = useState<'all' | '90' | '30'>('all')

    const fetchApps = useCallback(async () => {
        setLoading(true)
        setError(null)
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

    const stats = useMemo(() => {
        const total = applications.length
        const accepted = applications.filter(a => a.status === 'accepted').length
        const pending = applications.filter(a => a.status === 'pending').length
        const reviewing = applications.filter(a => a.status === 'reviewing').length
        const rejected = applications.filter(a => a.status === 'rejected').length
        const acceptRate = total > 0 ? Math.round((accepted / total) * 100) : 0

        // Recruits per month (all time, by submittedAt)
        const monthMap: Record<string, number> = {}
        for (const app of applications) {
            const d = new Date(app.submittedAt)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            monthMap[key] = (monthMap[key] ?? 0) + 1
        }
        const monthlyData = Object.entries(monthMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, count]) => ({
                month: month.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => {
                    const d = new Date(Number(y), Number(m) - 1)
                    return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
                }),
                count,
            }))

        // Accepted per month
        const acceptedMonthMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.status === 'accepted')) {
            const d = new Date(app.submittedAt)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            acceptedMonthMap[key] = (acceptedMonthMap[key] ?? 0) + 1
        }
        const acceptedMonthlyData = Object.entries(acceptedMonthMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, count]) => ({
                month: month.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => {
                    const d = new Date(Number(y), Number(m) - 1)
                    return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
                }),
                count,
            }))

        // Role distribution (accepted only) — normalise and filter junk answers
        const roleMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.status === 'accepted' && a.primaryRole)) {
            const key = normalizeRole(app.primaryRole!)
            if (key) roleMap[key] = (roleMap[key] ?? 0) + 1
        }
        const roleData = Object.entries(roleMap)
            .sort(([, a], [, b]) => b - a)
            .map(([name, value]) => ({ name, value }))

        // Region distribution (all applicants) — normalise raw strings first
        const regionMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.region)) {
            const key = normalizeRegion(app.region!)
            regionMap[key] = (regionMap[key] ?? 0) + 1
        }
        const regionData = Object.entries(regionMap)
            .sort(([, a], [, b]) => b - a)
            .map(([name, value]) => ({ name, value }))

        // Status distribution
        const statusData = [
            { name: 'Pending', value: pending, color: AMBER },
            { name: 'Reviewing', value: reviewing, color: BLUE },
            { name: 'Accepted', value: accepted, color: GREEN },
            { name: 'Rejected', value: rejected, color: RED },
        ].filter(d => d.value > 0)

        return { total, accepted, pending, reviewing, rejected, acceptRate, monthlyData, acceptedMonthlyData, roleData, regionData, statusData }
    }, [applications])

    const recruiterStats = useMemo(() => {
        const cutoff = recruiterPeriod === 'all'
            ? null
            : new Date(Date.now() - Number(recruiterPeriod) * 24 * 60 * 60 * 1000)

        const pool = applications.filter(a =>
            a.status === 'accepted' && a.recruiter &&
            (!cutoff || new Date(a.submittedAt) >= cutoff)
        )

        const map: Record<string, number> = {}
        for (const app of pool) map[app.recruiter!] = (map[app.recruiter!] ?? 0) + 1

        const data = Object.entries(map)
            .sort(([, a], [, b]) => b - a)
            .map(([name, count]) => ({ name, count }))

        // All-time top (always, regardless of period filter)
        const allMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.status === 'accepted' && a.recruiter))
            allMap[app.recruiter!] = (allMap[app.recruiter!] ?? 0) + 1
        const allSorted = Object.entries(allMap).sort(([, a], [, b]) => b - a)
        const topAllTime = allSorted[0] ? { name: allSorted[0][0], count: allSorted[0][1] } : null

        // This month's top
        const monthStart = new Date()
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
        const monthMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.status === 'accepted' && a.recruiter && new Date(a.submittedAt) >= monthStart))
            monthMap[app.recruiter!] = (monthMap[app.recruiter!] ?? 0) + 1
        const monthSorted = Object.entries(monthMap).sort(([, a], [, b]) => b - a)
        const topThisMonth = monthSorted[0] ? { name: monthSorted[0][0], count: monthSorted[0][1] } : null

        const totalRecruited = pool.length

        return { data, topAllTime, topThisMonth, totalRecruited }
    }, [applications, recruiterPeriod])

    const sectionLabel = (text: string) => (
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 14 }}>
            {text}
        </div>
    )

    if (loading) return <TacticalSkeleton rows={8} className='p-6' />

    if (error) return (
        <div className='p-6'><Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert></div>
    )

    if (applications.length === 0) return (
        <div className='flex items-center justify-center py-16' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem' }}>
            No application data yet.
        </div>
    )

    return (
        <div className='flex flex-col gap-8 p-5'>
            {/* Summary cards */}
            {sectionLabel('Overview')}
            <div className='grid grid-cols-2 md:grid-cols-5 gap-3'>
                <StatCard label='Total Applications' value={stats.total} />
                <StatCard label='Accepted' value={stats.accepted} sub={`${stats.acceptRate}% accept rate`} />
                <StatCard label='Pending' value={stats.pending} />
                <StatCard label='Reviewing' value={stats.reviewing} />
                <StatCard label='Rejected' value={stats.rejected} />
            </div>

            {/* Applications over time */}
            {stats.monthlyData.length > 1 && (
                <div>
                    {sectionLabel('Applications Per Month')}
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
                </div>
            )}

            {/* Accepted members over time */}
            {stats.acceptedMonthlyData.length > 1 && (
                <div>
                    {sectionLabel('Recruits Accepted Per Month')}
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
                </div>
            )}

            {/* Role + Region side by side */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                {/* Role distribution */}
                {stats.roleData.length > 0 && (
                    <div>
                        {sectionLabel('Primary Role (Accepted Members)')}
                        <div style={{ width: '100%', height: Math.max(200, stats.roleData.length * 36) }}>
                            <ResponsiveContainer>
                                <BarChart
                                    data={stats.roleData}
                                    layout='vertical'
                                    margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid horizontal={false} stroke='rgba(219,0,29,0.08)' />
                                    <XAxis type='number' {...axisStyle} allowDecimals={false} />
                                    <YAxis type='category' dataKey='name' width={130} tick={{ fill: 'rgba(237,237,237,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Members']} />
                                    <Bar dataKey='value' radius={[0, 2, 2, 0]} maxBarSize={18}>
                                        {stats.roleData.map((_, i) => (
                                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Region distribution */}
                {stats.regionData.length > 0 && (
                    <div>
                        {sectionLabel('Region (All Applicants)')}
                        <div style={{ width: '100%', height: Math.max(200, stats.regionData.length * 32) }}>
                            <ResponsiveContainer>
                                <BarChart
                                    data={stats.regionData}
                                    layout='vertical'
                                    margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid horizontal={false} stroke='rgba(219,0,29,0.08)' />
                                    <XAxis type='number' {...axisStyle} allowDecimals={false} />
                                    <YAxis type='category' dataKey='name' width={130} tick={{ fill: 'rgba(237,237,237,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Applicants']} />
                                    <Bar dataKey='value' radius={[0, 2, 2, 0]} maxBarSize={18}>
                                        {stats.regionData.map((_, i) => (
                                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>

            {/* Status distribution pie */}
            {stats.statusData.length > 1 && (
                <div>
                    {sectionLabel('Application Status Distribution')}
                    <div style={{ width: '100%', height: 240 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={stats.statusData}
                                    dataKey='value'
                                    nameKey='name'
                                    cx='50%'
                                    cy='50%'
                                    innerRadius={55}
                                    outerRadius={90}
                                    paddingAngle={3}
                                >
                                    {stats.statusData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Applications']} />
                                <Legend
                                    iconType='square'
                                    iconSize={10}
                                    formatter={(value) => <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)' }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Recruiter statistics */}
            {recruiterStats.topAllTime !== null ? (
                <div style={{ borderTop: '1px solid rgba(219,0,29,0.12)', paddingTop: 24 }}>
                    {sectionLabel('Recruiter Statistics')}

                    {/* Top recruiter cards */}
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-3' style={{ marginBottom: 20 }}>
                        <StatCard
                            label='Top Recruiter (All Time)'
                            value={recruiterStats.topAllTime?.name ?? '—'}
                            sub={recruiterStats.topAllTime ? `${recruiterStats.topAllTime.count} recruits` : undefined}
                        />
                        <StatCard
                            label='Top Recruiter (This Month)'
                            value={recruiterStats.topThisMonth?.name ?? '—'}
                            sub={recruiterStats.topThisMonth ? `${recruiterStats.topThisMonth.count} recruits` : undefined}
                        />
                        <StatCard
                            label={recruiterPeriod === 'all' ? 'Total Recruited (All Time)' : `Total Recruited (Last ${recruiterPeriod}d)`}
                            value={recruiterStats.totalRecruited}
                        />
                    </div>

                    {/* Period filter */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                        {(['all', '90', '30'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => setRecruiterPeriod(p)}
                                style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    letterSpacing: 2,
                                    textTransform: 'uppercase',
                                    padding: '4px 12px',
                                    background: recruiterPeriod === p ? 'rgba(219,0,29,0.2)' : 'none',
                                    border: `1px solid ${recruiterPeriod === p ? 'rgba(219,0,29,0.5)' : 'rgba(237,237,237,0.1)'}`,
                                    color: recruiterPeriod === p ? '#ededed' : 'rgba(237,237,237,0.35)',
                                    cursor: 'pointer',
                                }}
                            >
                                {p === 'all' ? 'All Time' : `Last ${p}d`}
                            </button>
                        ))}
                    </div>

                    {/* Leaderboard chart */}
                    {recruiterStats.data.length > 0 ? (
                        <div style={{ width: '100%', height: Math.max(160, recruiterStats.data.length * 36) }}>
                            <ResponsiveContainer>
                                <BarChart
                                    data={recruiterStats.data}
                                    layout='vertical'
                                    margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid horizontal={false} stroke='rgba(219,0,29,0.08)' />
                                    <XAxis type='number' {...axisStyle} allowDecimals={false} />
                                    <YAxis type='category' dataKey='name' width={130} tick={{ fill: 'rgba(237,237,237,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'Recruits']} />
                                    <Bar dataKey='count' radius={[0, 2, 2, 0]} maxBarSize={18}>
                                        {recruiterStats.data.map((_, i) => (
                                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>
                            No recruiter data for this period.
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
