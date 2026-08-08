'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowBack } from '@mui/icons-material'

const OperationEditor = dynamic(() => import('@/components/editor/CollabEditor'), { ssr: false })

const STATUS_COLORS: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.9)',
    'Upcoming':       'rgba(219,160,0,0.9)',
    'Completed':      'rgba(100,150,237,0.8)',
    'In Development': 'rgba(219,0,29,0.75)',
}

interface Props {
    opId: string
    title: string
    date?: string
    department?: string
    status?: string
    themeColor: string
    coverImage?: string
}

export default function StaffView({ opId, title, date, department, status, themeColor, coverImage }: Props) {
    const statusColor = status ? (STATUS_COLORS[status] ?? 'rgba(237,237,237,0.5)') : undefined

    return (
        <div style={{ minHeight: '100vh', background: '#0b0b0e', color: 'var(--foreground)' }}>
            {/* Cover image strip */}
            {coverImage && (
                <div style={{ height: 120, overflow: 'hidden', position: 'relative' }}>
                    <img src={coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.45 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, #0b0b0e)' }} />
                </div>
            )}

            {/* Header bar */}
            <div style={{
                padding: '14px 24px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                background: '#0f0f12',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
            }}>
                <Link
                    href={`/operations/${opId}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(237,237,237,0.35)', textDecoration: 'none', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', flexShrink: 0 }}
                >
                    <ArrowBack style={{ fontSize: 13 }} />
                    Back
                </Link>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                    {department && (
                        <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 2 }}>
                            {department}
                        </div>
                    )}
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {title}
                    </div>
                </div>

                {date && (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.38)', flexShrink: 0 }}>
                        {new Date(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                )}

                {status && statusColor && (
                    <span style={{
                        fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
                        color: statusColor, border: `1px solid ${statusColor}55`, padding: '3px 10px',
                        background: 'rgba(0,0,0,0.4)', flexShrink: 0,
                    }}>
                        {status}
                    </span>
                )}

                <div style={{
                    fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'rgba(237,237,237,0.2)', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)', padding: '3px 8px', flexShrink: 0,
                }}>
                    Staff View
                </div>
            </div>

            {/* Collab editor */}
            <div style={{ padding: '28px 24px', maxWidth: 1400, margin: '0 auto' }}>
                <OperationEditor
                    documentId={opId}
                    uploadUrl='/api/operations/upload'
                    defaultSectionTitle='Situation'
                    themeColor={themeColor}
                    allowedTypes={['orders', 'staff_orders', 'separator']}
                />
            </div>
        </div>
    )
}
