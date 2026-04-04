'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CircularProgress, Alert } from '@mui/material'
import {
    ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
    PieChart, Pie, Legend,
} from 'recharts'

type Application = J1Application & { _id: string }

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
        border: '1px solid rgba(219,0,29,0.2)',
        borderRadius: 0,
        fontSize: '0.78rem',
        color: '#ededed',
    },
    cursor: { fill: 'rgba(255,255,255,0.04)' },
}

const axisStyle = {
    tick: { fill: 'rgba(237,237,237,0.35)', fontSize: 11 },
    axisLine: { stroke: 'rgba(219,0,29,0.15)' },
    tickLine: false as const,
}

export default function StatisticsTab() {
    const [applications, setApplications] = useState<Application[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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

        // Role distribution (accepted only)
        const roleMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.status === 'accepted' && a.primaryRole)) {
            roleMap[app.primaryRole!] = (roleMap[app.primaryRole!] ?? 0) + 1
        }
        const roleData = Object.entries(roleMap)
            .sort(([, a], [, b]) => b - a)
            .map(([name, value]) => ({ name, value }))

        // Region distribution (all applicants)
        const regionMap: Record<string, number> = {}
        for (const app of applications.filter(a => a.region)) {
            regionMap[app.region!] = (regionMap[app.region!] ?? 0) + 1
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

    const sectionLabel = (text: string) => (
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 14 }}>
            {text}
        </div>
    )

    if (loading) return (
        <div className='flex justify-center py-16'><CircularProgress size={24} style={{ color: 'var(--red)' }} /></div>
    )

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
                                <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Applications']} />
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
                                <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Accepted']} />
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
                        <div style={{ width: '100%', height: 280 }}>
                            <ResponsiveContainer>
                                <BarChart
                                    data={stats.roleData}
                                    layout='vertical'
                                    margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid horizontal={false} stroke='rgba(219,0,29,0.08)' />
                                    <XAxis type='number' {...axisStyle} allowDecimals={false} />
                                    <YAxis type='category' dataKey='name' width={130} tick={{ fill: 'rgba(237,237,237,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Members']} />
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
                        <div style={{ width: '100%', height: 280 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={stats.regionData}
                                        dataKey='value'
                                        nameKey='name'
                                        cx='50%'
                                        cy='45%'
                                        outerRadius={90}
                                        paddingAngle={2}
                                        label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                                        labelLine={{ stroke: 'rgba(237,237,237,0.2)' }}
                                    >
                                        {stats.regionData.map((_, i) => (
                                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Applicants']} />
                                </PieChart>
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
                                <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Applications']} />
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
        </div>
    )
}
