'use client'

import { useState, useEffect, useCallback } from 'react'
import { Typography, CircularProgress, Alert, TextField } from '@mui/material'
import { CheckCircle, Warning } from '@mui/icons-material'

interface DocOption { id: string; name: string; latestAckVersion: number | null }
interface AckRow { _id: string; userId: string; userName: string; version: number; acknowledgedAt: string }
interface UserRow { id: string; displayName: string; hasAcked: boolean; ackedVersion?: number; ackedAt?: string }

export default function TrainingDocAckTab() {
    const [docs, setDocs]           = useState<DocOption[]>([])
    const [docsLoading, setDocsLoading] = useState(true)
    const [selectedDoc, setSelectedDoc] = useState<DocOption | null>(null)
    const [acks, setAcks]           = useState<AckRow[]>([])
    const [users, setUsers]         = useState<UserRow[]>([])
    const [loading, setLoading]     = useState(false)
    const [search, setSearch]       = useState('')
    const [filter, setFilter]       = useState<'all' | 'acked' | 'pending'>('all')

    // Load all training docs that have requiresAck entries
    useEffect(() => {
        fetch('/api/training-docs')
            .then(r => r.json())
            .then(d => {
                const items: DocOption[] = (d.items ?? [])
                    .filter((i: any) => i.type === 'document' && (i.changeLog ?? []).some((e: any) => e.requiresAck))
                    .map((i: any) => {
                        const ackEntries = (i.changeLog ?? []).filter((e: any) => e.requiresAck)
                        const latestAckVersion = ackEntries.length > 0 ? Math.max(...ackEntries.map((e: any) => e.version)) : null
                        return { id: i._id, name: i.name, latestAckVersion }
                    })
                setDocs(items)
            })
            .catch(() => {})
            .finally(() => setDocsLoading(false))
    }, [])

    const loadAcks = useCallback(async (doc: DocOption) => {
        setLoading(true)
        try {
            const [acksRes, usersRes] = await Promise.all([
                fetch(`/api/training-docs/${doc.id}/acks/admin`).then(r => r.json()),
                fetch('/api/admin/members?limit=500&discharged=false').then(r => r.json()),
            ])

            const acksData: AckRow[] = (acksRes.acks ?? []).filter((a: AckRow) => a.version === doc.latestAckVersion)
            setAcks(acksData)

            const ackedById = new Map(acksData.map(a => [a.userId, a]))

            const memberRows: UserRow[] = (usersRes.members ?? []).map((m: any) => {
                const ack = ackedById.get(m.id)
                return {
                    id: m.id,
                    displayName: m.displayName || m.name || m.username || m.id,
                    hasAcked: !!ack,
                    ackedVersion: ack?.version,
                    ackedAt: ack?.acknowledgedAt,
                }
            })
            setUsers(memberRows)
        } finally {
            setLoading(false)
        }
    }, [])

    function handleSelectDoc(doc: DocOption) {
        setSelectedDoc(doc)
        loadAcks(doc)
    }

    const filtered = users.filter(u => {
        if (filter === 'acked' && !u.hasAcked) return false
        if (filter === 'pending' && u.hasAcked) return false
        if (search.trim() && !u.displayName.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    const ackedCount = users.filter(u => u.hasAcked).length
    const pendingCount = users.length - ackedCount

    const chipSx = (active: boolean): React.CSSProperties => ({
        all: 'unset', cursor: 'pointer', padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        background: active ? 'rgba(219,0,29,0.12)' : 'transparent',
        border: `1px solid ${active ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.4)',
    })

    return (
        <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3}
                style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                Training Doc Acknowledgement Status
            </Typography>

            {docsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <CircularProgress size={20} style={{ color: 'var(--red)' }} />
                </div>
            ) : docs.length === 0 ? (
                <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.3)' }}>
                    No training documents currently require acknowledgement.
                </Typography>
            ) : (
                <>
                    {/* Doc selector */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {docs.map(d => (
                            <button key={d.id} onClick={() => handleSelectDoc(d)}
                                style={{
                                    all: 'unset', cursor: 'pointer', padding: '6px 14px',
                                    fontSize: '0.72rem', fontWeight: 700,
                                    background: selectedDoc?.id === d.id ? 'rgba(219,0,29,0.1)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${selectedDoc?.id === d.id ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                    color: selectedDoc?.id === d.id ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.6)',
                                }}>
                                {d.name}
                            </button>
                        ))}
                    </div>

                    {selectedDoc && (
                        <>
                            {loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                                    <CircularProgress size={20} style={{ color: 'var(--red)' }} />
                                </div>
                            ) : (
                                <>
                                    {/* Summary */}
                                    <div className='flex gap-4'>
                                        <div style={{ padding: '12px 20px', background: 'rgba(46,125,50,0.08)', border: '1px solid rgba(46,125,50,0.2)' }}>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'rgba(100,220,100,0.8)' }}>{ackedCount}</div>
                                            <div style={{ fontSize: '0.62rem', color: 'rgba(100,220,100,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Acknowledged</div>
                                        </div>
                                        <div style={{ padding: '12px 20px', background: 'rgba(237,108,2,0.08)', border: '1px solid rgba(237,108,2,0.2)' }}>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'rgba(255,167,38,0.8)' }}>{pendingCount}</div>
                                            <div style={{ fontSize: '0.62rem', color: 'rgba(255,167,38,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pending</div>
                                        </div>
                                    </div>

                                    {/* Filters */}
                                    <div className='flex items-center gap-3'>
                                        <div className='flex gap-2'>
                                            {(['all', 'acked', 'pending'] as const).map(f => (
                                                <button key={f} style={chipSx(filter === f)} onClick={() => setFilter(f)}>
                                                    {f === 'all' ? 'All' : f === 'acked' ? 'Acknowledged' : 'Pending'}
                                                </button>
                                            ))}
                                        </div>
                                        <TextField
                                            size='small' placeholder='Search members…' value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    borderRadius: 0, fontSize: '0.78rem',
                                                    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                                                    '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
                                                },
                                                '& .MuiInputBase-input': { color: 'rgba(237,237,237,0.85)', padding: '6px 10px' },
                                            }}
                                        />
                                    </div>

                                    {/* Table */}
                                    <div style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                    {['Member', 'Status', 'Date Acknowledged'].map(h => (
                                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filtered.map(u => (
                                                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.8)' }}>{u.displayName}</td>
                                                        <td style={{ padding: '8px 12px' }}>
                                                            {u.hasAcked ? (
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: 'rgba(100,220,100,0.8)' }}>
                                                                    <CheckCircle sx={{ fontSize: 12 }} /> Acknowledged
                                                                </span>
                                                            ) : (
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: 'rgba(255,167,38,0.7)' }}>
                                                                    <Warning sx={{ fontSize: 12 }} /> Pending
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                                                            {u.ackedAt ? new Date(u.ackedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {filtered.length === 0 && (
                                                    <tr>
                                                        <td colSpan={3} style={{ padding: '16px 12px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.3)', textAlign: 'center' }}>
                                                            No members match.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}
