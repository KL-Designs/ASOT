'use client'

import { useState, useEffect } from 'react'
import { Button, Typography, TextField, Chip } from '@mui/material'
import { Download } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

type FileRow = MissionFileSubmission & { _id: string }

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '6px 12px', fontSize: '0.6rem',
    fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)',
}

const tdStyle: React.CSSProperties = { padding: '8px 12px', color: 'rgba(237,237,237,0.75)' }

export default function DutyAdminFilesTab() {
    const [files, setFiles] = useState<FileRow[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        fetch('/api/j7/mission-files')
            .then(r => r.json())
            .then(d => setFiles(d.files ?? []))
            .finally(() => setLoading(false))
    }, [])

    const filtered = search.trim()
        ? files.filter(f =>
            f.originalName.toLowerCase().includes(search.toLowerCase()) ||
            f.operationTitle.toLowerCase().includes(search.toLowerCase()) ||
            f.uploadedByName.toLowerCase().includes(search.toLowerCase())
        )
        : files

    return (
        <div className='p-6 flex flex-col gap-5'>
            <div style={{ border: '1px solid rgba(219,0,29,0.12)', background: 'rgba(255,255,255,0.015)', padding: '20px 24px' }}>
                <Typography style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 12 }}>
                    Mission File Submissions — All Operations
                </Typography>
                <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)', marginBottom: 16 }}>
                    Read-only view of all PBO / mission files uploaded by J2 mission makers. Download files to load them on the game server.
                </Typography>

                <TextField
                    placeholder='Search by file name, operation or uploader…'
                    size='small'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    sx={{
                        maxWidth: 420,
                        marginBottom: 2,
                        '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.82rem', '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' }, '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' }, '&.Mui-focused fieldset': { borderColor: 'var(--red)' } },
                    }}
                />

                {loading ? (
                    <TacticalSkeleton rows={6} className='px-4' />
                ) : filtered.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '16px 0' }}>
                        {search ? 'No files match your search.' : 'No mission files have been uploaded yet.'}
                    </Typography>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                                    {['Operation', 'File', 'Ver', 'Size', 'Note', 'Uploaded By', 'Date', ''].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(f => (
                                    <tr key={f._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.55)', maxWidth: 160 }}>
                                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.operationTitle}</span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{f.originalName}</span>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <Chip label={`v${f.version}`} size='small' sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, height: 20, borderRadius: '2px', background: 'rgba(219,0,29,0.18)', color: 'var(--red)' }} />
                                        </td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{formatBytes(f.size)}</td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)', maxWidth: 180 }}>
                                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.note || '—'}</span>
                                        </td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.55)' }}>{f.uploadedByName}</td>
                                        <td style={{ ...tdStyle, color: 'rgba(237,237,237,0.45)' }}>{formatDate(f.uploadedAt)}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <a href={`/api/operations/${f.operationId}/mission-files/${f._id}`} download={f.originalName}>
                                                <Button size='small' variant='outlined' startIcon={<Download sx={{ fontSize: 12 }} />} sx={{ borderRadius: 0, fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, minWidth: 0, padding: '2px 8px', borderColor: 'rgba(219,0,29,0.27)', color: 'rgba(237,237,237,0.6)', '&:hover': { borderColor: 'rgba(219,0,29,0.5)' } }}>
                                                    DL
                                                </Button>
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
