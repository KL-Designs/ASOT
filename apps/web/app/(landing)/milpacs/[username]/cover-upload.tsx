'use client'

import { useState } from 'react'
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
                title='Replace the cover photo'
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
