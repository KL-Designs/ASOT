'use client'

import { useState } from 'react'

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/uploads/image-limits'
import s from './profile.module.css'


/**
 * Cover photo controls, rendered into the banner's badge row beside the status
 * pill — so they position themselves via that flex row rather than absolutely,
 * and cannot drift over the identity block.
 *
 * Styled as the same mono chips as the rest of the file's chrome. They were
 * previously glossy rounded pills with a shimmer sweep on hover, which read as
 * app furniture bolted onto a personnel record.
 */
export function CoverUpload({ hasCover: initialHasCover }: { hasCover: boolean }) {
    const [uploading, setUploading] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [hasCover, setHasCover] = useState(initialHasCover)

    const upload = async (file: File) => {
        /*
           Checked here as well as on the server, and not because the server
           check is optional — it is the one that counts. This is so a member on
           a slow connection is told immediately instead of watching a 14MB file
           upload and then be refused. That exact upload (16000x8000, 14MB) is
           what made the roster unusable for everyone.
        */
        if (file.size > MAX_UPLOAD_BYTES) {
            alert(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Cover photos are limited to ${MAX_UPLOAD_MB}MB — try exporting it smaller, or at a lower quality.`)
            return
        }

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/uploads/cover', { method: 'POST', body: formData })
        const json = await res.json()
        if (json.error) alert(json.error)
        else window.location.reload()
        setUploading(false)
    }

    const deleteCover = async () => {
        if (!confirm('Remove your cover photo?')) return
        setDeleting(true)
        const res = await fetch('/api/uploads/cover', { method: 'DELETE' })
        const json = await res.json()
        if (json.error) alert(json.error)
        else {
            setHasCover(false)
            window.location.reload()
        }
        setDeleting(false)
    }

    return (
        <>
            <label
                title={`Replace the cover photo — images up to ${MAX_UPLOAD_MB}MB, resized automatically`}
                className={`${s.btn} ${s.btnOnImage} ${uploading ? s.btnBusy : ''}`}
            >
                <svg width={12} height={12} viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                    <path d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' />
                </svg>
                {uploading ? 'Uploading' : hasCover ? 'Replace photo' : 'Add photo'}
                <input
                    type='file'
                    hidden
                    accept='image/*'
                    onChange={e => {
                        const f = e.target.files?.[0]
                        // Cleared so that picking the same file again still
                        // fires a change event — otherwise a member who fixes
                        // and re-exports a rejected image cannot retry it.
                        e.target.value = ''
                        if (f) upload(f)
                    }}
                />
            </label>

            {hasCover && (
                <button
                    title='Remove the cover photo'
                    onClick={deleteCover}
                    disabled={deleting}
                    className={`${s.btn} ${s.btnOnImage} ${s.btnDanger} ${deleting ? s.btnBusy : ''}`}
                >
                    {deleting ? 'Removing' : 'Remove'}
                </button>
            )}
        </>
    )
}
