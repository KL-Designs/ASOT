'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { UploadFile } from '@mui/icons-material'
import { Badge, Button, Panel, PanelBody, PanelHeader, Textarea } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'
import { BIO_LEVEL_LABEL, type BioApprovalLevel } from '@/lib/military/bio-approval'

const MAX = 2000

function useBioData() {
    const [id, setId] = useState<string | null>(null)
    const [bio, setBio] = useState<string | null>(null)
    // What is live on the milpac, as opposed to what is in the box.
    const [live, setLive] = useState('')
    // Whether a change is waiting on approval, and on whom.
    const [waitingOn, setWaitingOn] = useState<BioApprovalLevel | null>(null)
    const [rejected, setRejected] = useState<{ reason: string; byName: string } | null>(null)

    useEffect(() => {
        fetch('/api/me')
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                const user = json as User
                setId(user.id)
                setLive(user.bio?.content || '')
                // The box opens on the waiting change when there is one, so a
                // member can keep working on what they submitted.
                setBio(user.bioPending?.content ?? user.bio?.content ?? '')
                setWaitingOn(user.bioPending?.level ?? null)
                setRejected(user.bioRejected ? { reason: user.bioRejected.reason, byName: user.bioRejected.byName } : null)
            })
    }, [])

    const save = async (content: string): Promise<boolean> => {
        const res = await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        }).catch(() => null)
        const data = await res?.json().catch(() => null)
        if (!res?.ok) return false
        setWaitingOn(data?.pending ? data.level : null)
        setRejected(null)
        return true
    }

    return { id, bio, setBio, save, live, waitingOn, rejected }
}

/**
 * The member's own bio, and the image that sits beside it on their milpac.
 *
 * Submitted with a button, not saved on blur. It used to save whenever the box
 * lost focus, which was fine while a save published straight away; now that a
 * change goes to the member's chain of command for approval, every stray
 * click out of the box would have been a request sent to their PHQ.
 */
export function BioCard({ canUploadImage }: { canUploadImage?: boolean }) {
    const { id, bio, setBio, save, live, waitingOn, rejected } = useBioData()
    const [cacheKey, setCacheKey] = useState('')
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)
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

    async function commit() {
        if (bio === null || saving) return
        setSaving(true)
        const ok = await save(bio)
        setSaving(false)
        if (!ok) return
        setSaved(true)
        setTimeout(() => setSaved(false), 2200)
    }

    // Nothing to submit when the box matches what is live and nothing is
    // waiting; submitting the live text while something waits withdraws it.
    const unchanged = (bio ?? '').trim() === live.trim() && !waitingOn

    const length = (bio || '').length

    return (
        <Panel>
            <PanelHeader
                title='Bio'
                sub='Shown on your milpac once your chain of command has approved it.'
                right={saved
                    ? <Badge tone='live' dot>Submitted</Badge>
                    : waitingOn ? <Badge tone='warn' dot>Awaiting {BIO_LEVEL_LABEL[waitingOn]}</Badge> : null}
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
                        />
                        {rejected && !waitingOn && (
                            <span className={s.hint} style={{ color: 'var(--red-hi)', lineHeight: 1.5 }}>
                                Your last change was sent back by {rejected.byName}: {rejected.reason}
                            </span>
                        )}
                        <div className='flex items-center gap-3'>
                            <Button variant='primary' size='sm' disabled={saving || unchanged} onClick={commit}>
                                {saving ? 'Submitting…' : 'Submit for approval'}
                            </Button>
                            {waitingOn && (
                                <span className={s.hint}>A change is waiting. Your milpac shows the previous version until it is approved.</span>
                            )}
                        </div>
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
