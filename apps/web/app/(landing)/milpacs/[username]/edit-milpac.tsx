'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import s from './profile.module.css'

/**
 * Opens the milpac editor over the profile instead of navigating to
 * /members/{username}, so an edit does not lose the reader's place.
 *
 * The editor is loaded on first open rather than with the page: it is a large
 * client component, and this button is only shown to staff — bundling it into a
 * public page would ship it to every anonymous visitor who can never use it.
 */
const MilpacEditor = dynamic(() => import('@/app/members/[username]/MilpacEditor'), { ssr: false })

type ConfirmedOp = { operationId: string; name: string; date?: string | null; confirmedAt: string | null }

export function EditMilpacButton({ username, canEditRestricted, canEditStandard }: {
    username: string
    canEditRestricted: boolean
    canEditStandard: boolean
}) {
    const [open, setOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [member, setMember] = useState<User | null>(null)
    const [ops, setOps] = useState<ConfirmedOp[]>([])
    const [error, setError] = useState<string | null>(null)
    const [dirty, setDirty] = useState(false)

    useEffect(() => setMounted(true), [])

    // Fetched on open, not on mount — the same two endpoints the staff personnel
    // panel uses, so there is one source of truth for what the editor is given.
    useEffect(() => {
        if (!open || member) return
        let cancelled = false
        ;(async () => {
            try {
                const [mRes, oRes] = await Promise.all([
                    fetch(`/api/members/${username}`),
                    fetch(`/api/members/${username}/confirmed-ops`),
                ])
                if (!mRes.ok) throw new Error('Could not load this member.')
                const m = await mRes.json()
                const o = oRes.ok ? await oRes.json() : []
                if (cancelled) return
                setMember(m.member ?? m)
                setOps(Array.isArray(o) ? o : o.confirmedOps ?? [])
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this member.')
            }
        })()
        return () => { cancelled = true }
    }, [open, member, username])

    const close = () => {
        // Unsaved work is easy to lose behind a click on the backdrop.
        if (dirty && !confirm('Close the editor? Unsaved changes will be lost.')) return
        setOpen(false)
    }

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        window.addEventListener('keydown', onKey)
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = previous
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, dirty])

    // Portalled to document.body for the same reason the image lightbox is: the
    // profile's panels animate with a transform, which makes them the containing
    // block for fixed descendants and would trap this inside one.
    const overlay = (
        <div
            role='dialog'
            aria-modal='true'
            aria-label={`Edit ${username}'s milpac`}
            onClick={close}
            style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                background: 'rgba(4,5,6,0.78)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: '3vh 2vw',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 'min(1100px, 100%)',
                    maxHeight: '94vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0b0d10',
                    border: '1px solid rgba(219,0,29,0.25)',
                    boxShadow: '0 30px 90px rgba(0,0,0,0.7)',
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
                }}>
                    <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
                        textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)',
                    }}>
                        Edit milpac — {username}
                    </span>
                    <button onClick={close} className={s.btn} style={{ marginLeft: 'auto' }}>Close</button>
                </div>

                <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
                    {error
                        ? <p style={{ padding: 24, color: 'rgba(219,0,29,0.9)', fontSize: '0.85rem' }}>{error}</p>
                        : member
                            ? (
                                <MilpacEditor
                                    member={member}
                                    confirmedOps={ops}
                                    canEditRestricted={canEditRestricted}
                                    canEditStandard={canEditStandard}
                                    onDirtyChange={setDirty}
                                />
                            )
                            : <p style={{ padding: 24, color: 'rgba(237,237,237,0.4)', fontSize: '0.85rem' }}>Loading…</p>}
                </div>
            </div>
        </div>
    )

    return (
        <>
            <button onClick={() => setOpen(true)} className={s.btn}>Edit</button>
            {open && mounted && createPortal(overlay, document.body)}
        </>
    )
}
