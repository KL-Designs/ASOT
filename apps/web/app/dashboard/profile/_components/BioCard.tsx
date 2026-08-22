'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { UploadFile } from '@mui/icons-material'
import { Badge, Button, Panel, PanelBody, PanelHeader, Textarea } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

const MAX = 2000

function useBioData() {
    const [id, setId] = useState<string | null>(null)
    const [bio, setBio] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/me')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                const user = json as User
                setId(user.id)
                setBio(user.bio?.content || '')
            })
    }, [])

    const save = (patch: object) => {
        fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        })
    }

    return { id, bio, setBio, save }
}

/**
 * The member's own bio, and the image that sits beside it on their milpac.
 *
 * Saves on blur, as it always did — but the card now says so. The old version
 * gave no acknowledgement at all, so the only way to know your bio had been
 * kept was to reload the page.
 */
export function BioCard({ canUploadImage }: { canUploadImage?: boolean }) {
    const { id, bio, setBio, save } = useBioData()
    const [cacheKey, setCacheKey] = useState('')
    const [saved, setSaved] = useState(false)
    const [uploading, setUploading] = useState(false)

    useEffect(() => { setCacheKey(String(Date.now())) }, [])

    async function upload(file: File) {
        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        try {
            const res = await fetch('/api/uploads/bio', { method: 'POST', body: formData })
            const json = await res.json()
            if (json.error) { alert(json.error); return }
            window.location.reload()
        } finally {
            setUploading(false)
        }
    }

    function commit() {
        if (bio === null) return
        save({ content: bio })
        setSaved(true)
        setTimeout(() => setSaved(false), 2200)
    }

    const length = (bio || '').length

    return (
        <Panel>
            <PanelHeader
                title='Bio'
                sub='Shown on your milpac. Saves when you click away.'
                right={saved ? <Badge tone='live' dot>Saved</Badge> : null}
            />
            <PanelBody>
                <div className='flex flex-wrap gap-4 items-start'>
                    <div className='flex flex-col gap-2 flex-1' style={{ minWidth: 260 }}>
                        <Textarea
                            rows={7}
                            placeholder='Type your bio here…'
                            value={bio ?? ''}
                            maxLength={MAX}
                            onChange={e => setBio(e.currentTarget.value.slice(0, MAX))}
                            onBlur={commit}
                        />
                        {/* Turns amber before it stops accepting characters, so
                            hitting the ceiling is not the first you hear of it. */}
                        <span
                            className={s.hint}
                            style={{ textAlign: 'right', color: length >= MAX ? 'var(--red-hi)' : length > MAX * 0.9 ? 'var(--amber)' : undefined }}
                        >
                            {length} / {MAX}
                        </span>
                    </div>

                    {canUploadImage && (
                        <div className='hidden sm:flex flex-col gap-3' style={{ width: 168 }}>
                            <div
                                className='relative'
                                style={{ height: 118, border: '1px solid var(--line-1)', borderRadius: 'var(--r)', background: 'var(--ink-1)', overflow: 'hidden' }}
                            >
                                <Image
                                    src={`/api/uploads/bio?id=${id}${cacheKey ? `&time=${cacheKey}` : ''}`}
                                    alt='Your bio image'
                                    fill
                                    className='object-contain'
                                />
                            </div>
                            <label style={{ display: 'block' }}>
                                {/* The label *is* the button — a real <button>
                                    here would need a click handler to forward to
                                    the hidden input for no gain. */}
                                <span className={`${s.btn} ${s.btnSubtle} ${s.btnSm}`} style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}>
                                    <UploadFile style={{ fontSize: 14 }} />
                                    {uploading ? 'Uploading…' : 'Upload JPG'}
                                </span>
                                <input
                                    type='file'
                                    accept='image/jpeg,image/jpg'
                                    hidden
                                    onChange={e => {
                                        const file = e.target.files?.[0]
                                        if (file) upload(file)
                                    }}
                                />
                            </label>
                        </div>
                    )}
                </div>
            </PanelBody>
        </Panel>
    )
}

export default BioCard
