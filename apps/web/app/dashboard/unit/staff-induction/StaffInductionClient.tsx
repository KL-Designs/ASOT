'use client'

import { useState, useEffect } from 'react'
import { Typography, Button, Chip, Alert, CircularProgress } from '@mui/material'
import { CheckCircle } from '@mui/icons-material'
import { useRouter } from 'next/navigation'
import TutorialButton from '@/components/tutorial/TutorialButton'

type InductionRecord = StaffInductionRecord & { _id: string }

function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function InductionCard({
    record,
    content,
    onUpdated,
}: {
    record: InductionRecord
    content: StaffInductionContent | null
    onUpdated: (r: InductionRecord) => void
}) {
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function act(action: string) {
        setSubmitting(true); setError(null)
        try {
            const res = await fetch(`/api/staff-induction/${record._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Failed'); return }
            onUpdated(data.record)
        } finally { setSubmitting(false) }
    }

    const isComplete = !!record.completedAt
    const hasPartA = !!record.partACompletedAt
    const hasTutorial = !!(content?.tutorialBody?.trim())

    return (
        <div data-tour='staff-induction-card' style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.025)', padding: '20px 24px' }}>
            <div className='flex items-start justify-between gap-4 mb-4'>
                <div>
                    <Typography style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                        {record.context}
                    </Typography>
                    {record.triggerLabel && (
                        <Typography style={{ fontSize: '0.9rem', fontWeight: 700 }}>{record.triggerLabel}</Typography>
                    )}
                    <Typography style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', marginTop: 2 }}>
                        Triggered by {record.triggeredByName} · {formatDate(record.triggeredAt)}
                    </Typography>
                </div>
                {isComplete && (
                    <Chip label='Completed' color='success' size='small' sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px' }} />
                )}
            </div>

            {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem', mb: 2 }}>{error}</Alert>}

            {!isComplete && (
                <div className='flex flex-col gap-5'>
                    {/* Part A — Rules */}
                    <div data-tour='staff-induction-part-a' style={{ background: hasPartA ? 'rgba(46,125,50,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${hasPartA ? 'rgba(46,125,50,0.3)' : 'rgba(255,255,255,0.08)'}`, padding: '16px 20px' }}>
                        <div className='flex items-center gap-2 mb-3'>
                            <Typography style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: hasPartA ? 'rgba(100,220,100,0.8)' : 'rgba(237,237,237,0.7)' }}>
                                Part A — Rules &amp; Standards
                            </Typography>
                            {hasPartA && <CheckCircle style={{ fontSize: 15, color: 'rgba(100,220,100,0.8)' }} />}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.65)', whiteSpace: 'pre-wrap', marginBottom: 12, lineHeight: 1.6 }}>
                            {content?.rulesBody || 'Staff rules and standards will be displayed here. Please acknowledge that you have read and understood the ASOT staff standards.'}
                        </div>
                        {!hasPartA && (
                            <Button data-tour='staff-induction-complete-a' variant='outlined' size='small' disabled={submitting}
                                startIcon={submitting ? <CircularProgress size={14} /> : <CheckCircle sx={{ fontSize: 14 }} />}
                                onClick={() => act('complete-part-a')}
                                sx={{ borderRadius: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', borderColor: 'rgba(219,0,29,0.27)', color: 'var(--red)', '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' }, '&:disabled': { opacity: 0.4 } }}>
                                I have read and accept these rules
                            </Button>
                        )}
                    </div>

                    {/* Part B — Tutorial */}
                    {hasPartA && hasTutorial && (
                        <div data-tour='staff-induction-part-b' style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px' }}>
                            <Typography style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)', marginBottom: 12 }}>
                                Part B — Orientation Tutorial
                            </Typography>
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.65)', whiteSpace: 'pre-wrap', marginBottom: 12, lineHeight: 1.6 }}>
                                {content?.tutorialBody}
                            </div>
                            <div className='flex gap-3'>
                                <Button variant='outlined' size='small' disabled={submitting}
                                    startIcon={submitting ? <CircularProgress size={14} /> : <CheckCircle sx={{ fontSize: 14 }} />}
                                    onClick={() => act('complete-part-b')}
                                    sx={{ borderRadius: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', borderColor: 'rgba(219,0,29,0.27)', color: 'var(--red)', '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.06)' }, '&:disabled': { opacity: 0.4 } }}>
                                    Complete Tutorial
                                </Button>
                                <Button variant='text' size='small' disabled={submitting}
                                    onClick={() => act('skip-part-b')}
                                    sx={{ borderRadius: 0, fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', '&:hover': { color: 'rgba(237,237,237,0.6)' } }}>
                                    Skip
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isComplete && (
                <div style={{ fontSize: '0.78rem', color: 'rgba(100,220,100,0.6)' }}>
                    ✓ Induction completed {formatDate(record.completedAt!)}
                </div>
            )}
        </div>
    )
}

export default function StaffInductionClient({
    records: initialRecords,
    content: initialContent,
    deptContents: initialDeptContents = {},
}: {
    records: InductionRecord[]
    content: StaffInductionContent | null
    deptContents?: Record<string, StaffInductionContent>
}) {
    const [records, setRecords] = useState(initialRecords)
    const [content, setContent] = useState(initialContent)
    const [deptContents, setDeptContents] = useState(initialDeptContents)
    const router = useRouter()

    useEffect(() => {
        fetch('/api/me/staff-induction-page')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return
                setRecords(data.records ?? [])
                setContent(data.content ?? null)
                setDeptContents(data.deptContents ?? {})
            })
            .catch(() => {})
    }, [])

    function handleUpdated(updated: InductionRecord) {
        setRecords(prev => prev.map(r => r._id === updated._id ? updated : r))
        if (updated.completedAt) router.refresh()
    }

    return (
        <div className='p-6 max-w-3xl flex flex-col gap-5'>
            <div className='flex items-start justify-between gap-4'>
                <div>
                    <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>
                        Staff Induction
                    </Typography>
                    <Typography style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.45)' }}>
                        Complete any pending inductions below. Part A is mandatory. Part B is an optional orientation tutorial.
                    </Typography>
                </div>
                <TutorialButton />
            </div>

            {records.length === 0 ? (
                <div style={{ padding: '32px 0', fontSize: '0.82rem', color: 'rgba(237,237,237,0.3)' }}>
                    No pending inductions. You are up to date.
                </div>
            ) : (
                records.map(r => {
                    const resolvedContent = (r.dept && deptContents[r.dept]) ? deptContents[r.dept] : content
                    return (
                        <InductionCard key={r._id} record={r} content={resolvedContent} onUpdated={handleUpdated} />
                    )
                })
            )}
        </div>
    )
}
