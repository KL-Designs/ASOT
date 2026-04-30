'use client'

import { useState, useRef, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import { Delete, YouTube, InsertDriveFile, OpenInNew, CloudUpload, Add, Link as LinkIcon, VideoFile } from '@mui/icons-material'

interface Props {
    meetingId: string
    attachments: MeetingAttachment[]
    locked: boolean
    meeting: Meeting
    onUpdate: (m: Meeting) => void
}

type LinkMode = 'none' | 'youtube' | 'link'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf']

function getYoutubeId(url: string): string | null {
    const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : null
}

export default function MeetingAttachments({ meetingId, attachments, locked, onUpdate }: Props) {
    const [uploading, setUploading] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [linkMode, setLinkMode] = useState<LinkMode>('none')
    const [linkVal, setLinkVal] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)

    async function refresh() {
        const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
        if (fresh.meeting) onUpdate(fresh.meeting)
    }

    async function uploadFile(file: File) {
        if (file.size > MAX_FILE_SIZE) return
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            await fetch(`/api/admin/meetings/${meetingId}/attachments`, { method: 'POST', body: fd })
            await refresh()
        } finally { setUploading(false) }
    }

    async function addLink(url: string, type: 'youtube' | 'link') {
        if (!url.trim()) return
        setUploading(true)
        try {
            const body = type === 'youtube' ? { youtubeUrl: url.trim() } : { linkUrl: url.trim() }
            await fetch(`/api/admin/meetings/${meetingId}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            await refresh()
            setLinkVal('')
            setLinkMode('none')
        } finally { setUploading(false) }
    }

    async function deleteAttachment(id: string) {
        setDeleting(id)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/attachments/${id}`, { method: 'DELETE' })
            await refresh()
        } finally { setDeleting(null) }
    }

    const handleFiles = useCallback((files: File[]) => {
        const valid = files.filter(f => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE)
        if (valid.length > 0) uploadFile(valid[0]) // upload first valid file
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setDragOver(false)
        if (locked) return
        handleFiles(Array.from(e.dataTransfer.files))
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Attachment list */}
            {attachments.map(att => {
                const ytId = att.type === 'youtube' ? getYoutubeId(att.url) : null
                const isImg = att.type === 'file' && att.ext && ['jpg','jpeg','png','webp','gif'].includes(att.ext)
                return (
                    <div key={att.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        {att.type === 'youtube'
                            ? <YouTube sx={{ fontSize: 14, color: 'rgba(219,0,0,0.6)', flexShrink: 0 }} />
                            : att.type === 'link'
                            ? <LinkIcon sx={{ fontSize: 14, color: 'rgba(0,195,255,0.5)', flexShrink: 0 }} />
                            : <InsertDriveFile sx={{ fontSize: 14, color: 'rgba(237,237,237,0.3)', flexShrink: 0 }} />
                        }
                        {ytId && (
                            <img
                                src={`https://img.youtube.com/vi/${ytId}/default.jpg`}
                                alt=''
                                style={{ width: 40, height: 28, objectFit: 'cover', flexShrink: 0 }}
                            />
                        )}
                        {isImg && (
                            <img
                                src={att.url}
                                alt={att.filename ?? ''}
                                style={{ width: 40, height: 28, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)' }}
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

            {attachments.length === 0 && locked && (
                <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No attachments</span>
            )}

            {/* Upload UI (when not locked) */}
            {!locked && (
                <>
                    {/* Drop zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onClick={() => !uploading && fileRef.current?.click()}
                        style={{
                            border: `2px dashed ${dragOver ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.1)'}`,
                            background: dragOver ? 'rgba(219,0,29,0.05)' : 'rgba(255,255,255,0.01)',
                            padding: '14px 12px',
                            cursor: uploading ? 'wait' : 'pointer',
                            transition: 'border-color 0.15s, background 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            marginTop: attachments.length > 0 ? 4 : 0,
                        }}
                    >
                        {uploading
                            ? <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.6)' }} />
                            : <CloudUpload sx={{ fontSize: 18, color: dragOver ? 'rgba(219,0,29,0.7)' : 'rgba(255,255,255,0.2)' }} />
                        }
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: dragOver ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.3)' }}>
                            {uploading ? 'UPLOADING…' : 'DRAG & DROP OR CLICK TO UPLOAD'}
                        </div>
                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)' }}>Images · Videos · PDFs · max 50 MB</div>
                    </div>

                    {/* Link inputs row */}
                    {linkMode === 'none' && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                            <button
                                onClick={() => setLinkMode('youtube')}
                                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', color: 'rgba(219,0,0,0.5)', letterSpacing: '0.06em' }}
                            >
                                <YouTube sx={{ fontSize: 13 }} /> YouTube link
                            </button>
                            <button
                                onClick={() => setLinkMode('link')}
                                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', color: 'rgba(0,195,255,0.5)', letterSpacing: '0.06em' }}
                            >
                                <LinkIcon sx={{ fontSize: 13 }} /> External link
                            </button>
                        </div>
                    )}

                    {linkMode !== 'none' && (
                        <div style={{ display: 'flex', gap: 0, marginTop: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRight: 'none', padding: '0 10px', color: 'rgba(237,237,237,0.4)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', flexShrink: 0 }}>
                                {linkMode === 'youtube' ? <YouTube sx={{ fontSize: 13, color: 'rgba(219,0,0,0.6)' }} /> : <LinkIcon sx={{ fontSize: 13, color: 'rgba(0,195,255,0.5)' }} />}
                                {linkMode === 'youtube' ? 'YOUTUBE' : 'LINK'}
                            </div>
                            <input
                                autoFocus
                                value={linkVal}
                                onChange={e => setLinkVal(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); addLink(linkVal, linkMode) }
                                    if (e.key === 'Escape') { setLinkMode('none'); setLinkVal('') }
                                }}
                                placeholder={linkMode === 'youtube' ? 'https://youtube.com/watch?v=…' : 'https://…'}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.8)', fontSize: '0.75rem', padding: '6px 10px', outline: 'none', fontFamily: 'inherit', minWidth: 0 }}
                            />
                            <button
                                type='button'
                                onClick={() => addLink(linkVal, linkMode)}
                                disabled={uploading || !linkVal.trim()}
                                style={{ background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.35)', borderLeft: 'none', color: 'rgba(219,0,29,0.8)', cursor: 'pointer', padding: '0 12px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            >
                                {uploading ? <CircularProgress size={10} color='inherit' /> : <Add sx={{ fontSize: 14 }} />}
                            </button>
                            <button
                                type='button'
                                onClick={() => { setLinkMode('none'); setLinkVal('') }}
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderLeft: 'none', color: 'rgba(237,237,237,0.3)', cursor: 'pointer', padding: '0 10px', fontSize: '0.62rem', flexShrink: 0 }}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </>
            )}

            <input ref={fileRef} type='file' multiple accept='image/*,video/mp4,video/webm,video/quicktime,application/pdf' style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) handleFiles(files); e.target.value = '' }} />
        </div>
    )
}
