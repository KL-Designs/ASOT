'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import type { AssessmentStatus } from '@/lib/training/orders-assessment'
import { label, panel, StatusPill } from './shared'

interface Row { _id: string; trainingTypeName: string; trainerName: string; status: AssessmentStatus; session: { label: string } | null; createdAt: string }

/** Row 373: the trainee's list. */
export default function MyAssessments() {
    const [rows, setRows] = useState<Row[] | null>(null)
    useEffect(() => {
        fetch('/api/training/assessments?mine=1').then(r => r.json()).then(d => setRows(d.assessments ?? [])).catch(() => setRows([]))
    }, [])
    return (
        <div style={{ padding: '24px 20px', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={label}>Training</div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>My Assessments</h1>
            {rows === null && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>Loading…</div>}
            {rows?.length === 0 && <div style={{ ...panel, fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)' }}>You have no orders-writing assessments.</div>}
            {rows?.map(r => (
                <Link key={r._id} href={`/me/assessments/${r._id}` as Route} style={{ ...panel, textDecoration: 'none', color: '#ededed', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{r.trainingTypeName}</div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.45)' }}>{r.trainerName}{r.session ? ` · ${r.session.label}` : ''} · {new Date(r.createdAt).toLocaleDateString('en-AU')}</div>
                    </div>
                    <StatusPill status={r.status} />
                </Link>
            ))}
        </div>
    )
}
