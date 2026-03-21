'use client'

import { useState } from 'react'
import { UploadFile } from '@mui/icons-material'


export function CoverUpload({ memberId }: { memberId: string }) {
    const [uploading, setUploading] = useState(false)

    const upload = async (file: File) => {
        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/uploads/cover', { method: 'POST', body: formData })
        const json = await res.json()
        if (json.error) alert(json.error)
        else window.location.reload()
        setUploading(false)
    }

    return (
        <label
            title='Change cover photo'
            style={{
                position: 'absolute',
                bottom: 14,
                right: 14,
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.12)',
                padding: '6px 12px',
                cursor: uploading ? 'wait' : 'pointer',
                fontSize: '0.68rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(4px)',
                transition: 'color 0.15s, border-color 0.15s',
                pointerEvents: uploading ? 'none' : 'auto',
            }}
        >
            <UploadFile style={{ fontSize: 13 }} />
            {uploading ? 'Uploading…' : 'Change Cover'}
            <input
                type='file'
                hidden
                accept='image/*'
                onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) upload(f)
                }}
            />
        </label>
    )
}
