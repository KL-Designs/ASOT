'use client'

import { useState, useRef } from 'react'
import { CircularProgress } from '@mui/material'
import { Add, Delete, YouTube, InsertDriveFile, OpenInNew } from '@mui/icons-material'

interface Props {
    meetingId: string
    attachments: MeetingAttachment[]
    locked: boolean
    meeting: Meeting
    onUpdate: (m: Meeting) => void
}

function getYoutubeId(url: string): string | null {
    const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : null
}

export default function MeetingAttachments({ meetingId, attachments, locked, meeting, onUpdate }: Props) {
    const [mode, setMode] = useState<'none' | 'file' | 'youtube'>('none')
    const [youtubeUrl, setYoutubeUrl] = useState('')
    const [uploading, setUploading] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    async function uploadFile(file: File) {
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            await fetch(`/api/admin/meetings/${meetingId}/attachments`, { method: 'POST', body: fd })
            const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally { setUploading(false); setMode('none') }
    }

    async function addYoutube() {
        if (!youtubeUrl.trim()) return
        setUploading(true)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ youtubeUrl: youtubeUrl.trim() }),
            })
            const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
            if (fresh.meeting) { onUpdate(fresh.meeting); setYoutubeUrl(''); setMode('none') }
        } finally { setUploading(false) }
    }

    async function deleteAttachment(id: string) {
        setDeleting(id)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/attachments/${id}`, { method: 'DELETE' })
            const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally { setDeleting(null) }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {attachments.length === 0 && mode === 'none' && (
                <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No attachments</span>
            )}

            {attachments.map(att => {
                const ytId = att.type === 'youtube' ? getYoutubeId(att.url) : null
                return (
                    <div key={att.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        {att.type === 'youtube'
                            ? <YouTube sx={{ fontSize: 14, color: 'rgba(219,0,0,0.6)', flexShrink: 0 }} />
                            : <InsertDriveFile sx={{ fontSize: 14, color: 'rgba(237,237,237,0.3)', flexShrink: 0 }} />
                        }
                        {ytId && (
                            <img
                                src={`https://img.youtube.com/vi/${ytId}/default.jpg`}
                                alt=''
                                style={{ width: 40, height: 28, objectFit: 'cover', flexShrink: 0 }}
                            />
                        )}
                        <span style={{
                            flex: 1, minWidth: 0, fontSize: '0.7rem', color: 'rgba(237,237,237,0.65)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {att.filename ?? att.url}
                        </span>
                        <a href={att.url} target='_blank' rel='noreferrer' style={{ color: 'rgba(237,237,237,0.3)', flexShrink: 0, display: 'flex' }}>
                            <OpenInNew sx={{ fontSize: 12 }} />
                        </a>
                        {!locked && (
                            <button
                                onClick={() => deleteAttachment(att.id)}
                                disabled={deleting === att.id}
                                style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.35)', flexShrink: 0 }}
                            >
                                {deleting === att.id ? <CircularProgress size={11} color='inherit' /> : <Delete sx={{ fontSize: 12 }} />}
                            </button>
                        )}
                    </div>
                )
            })}

            {!locked && mode === 'youtube' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input
                        autoFocus
                        value={youtubeUrl}
                        onChange={e => setYoutubeUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addYoutube(); if (e.key === 'Escape') setMode('none') }}
                        placeholder='YouTube URL…'
                        style={{
                            all: 'unset', flex: 1, fontSize: '0.72rem', color: 'var(--foreground)',
                            background: 'rgba(255,255,255,0.04)', padding: '5px 8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}
                    />
                    <button
                        onClick={addYoutube}
                        disabled={uploading}
                        style={{
                            all: 'unset', cursor: 'pointer', padding: '4px 10px',
                            fontSize: '0.62rem', fontWeight: 700,
                            background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.35)',
                            color: 'rgba(219,0,29,0.8)',
                        }}
                    >
                        {uploading ? <CircularProgress size={10} color='inherit' /> : 'Add'}
                    </button>
                    <button onClick={() => setMode('none')} style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Cancel
                    </button>
                </div>
            )}

            {!locked && mode === 'none' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        style={{
                            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: '0.62rem', color: 'rgba(219,0,29,0.55)', letterSpacing: '0.06em',
                        }}
                    >
                        {uploading ? <CircularProgress size={11} color='inherit' /> : <Add sx={{ fontSize: 12 }} />}
                        Upload file
                    </button>
                    <button
                        onClick={() => setMode('youtube')}
                        style={{
                            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: '0.62rem', color: 'rgba(219,0,29,0.55)', letterSpacing: '0.06em',
                        }}
                    >
                        <YouTube sx={{ fontSize: 12 }} /> YouTube link
                    </button>
                </div>
            )}

            <input ref={fileRef} type='file' style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
        </div>
    )
}
