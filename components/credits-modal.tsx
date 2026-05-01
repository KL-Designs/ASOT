'use client'

import { useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    Typography,
    CircularProgress,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { CreditContributor } from '@/app/api/credits/route'


export default function CreditsModal() {
    const [open, setOpen]         = useState(false)
    const [loading, setLoading]   = useState(false)
    const [data, setData]         = useState<CreditContributor[] | null>(null)
    const fetched                 = useRef(false)

    const handleOpen = useCallback(async () => {
        setOpen(true)
        if (fetched.current) return
        setLoading(true)
        try {
            const res = await fetch('/api/credits')
            const json: CreditContributor[] = await res.json()
            setData(json)
            fetched.current = true
        } finally {
            setLoading(false)
        }
    }, [])

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={handleOpen}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(219,0,29,0.04)',
                    border: '1px solid rgba(219,0,29,0.2)',
                    color: 'rgba(237,237,237,0.35)',
                    padding: '6px 18px',
                    cursor: 'pointer',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    transition: 'border-color 0.2s, color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.borderColor = 'rgba(219,0,29,0.5)'
                    el.style.color = 'rgba(237,237,237,0.75)'
                    el.style.background = 'rgba(219,0,29,0.08)'
                }}
                onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.borderColor = 'rgba(219,0,29,0.2)'
                    el.style.color = 'rgba(237,237,237,0.35)'
                    el.style.background = 'rgba(219,0,29,0.04)'
                }}
            >
                <span style={{ color: 'var(--red)', opacity: 0.7, fontSize: '0.55rem' }}>◆</span>
                Site Credits
                <span style={{ color: 'var(--red)', opacity: 0.7, fontSize: '0.55rem' }}>◆</span>
            </button>

            {/* Modal */}
            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                maxWidth='lg'
                fullWidth
                slotProps={{
                    paper: {
                        style: {
                            background: '#0a0a0a',
                            border: '1px solid rgba(219,0,29,0.2)',
                            borderTop: '3px solid var(--red)',
                            borderRadius: 0,
                            maxHeight: '90vh',
                        },
                    },
                    backdrop: {
                        style: { backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.75)' },
                    },
                }}
            >
                {/* Header */}
                <DialogTitle
                    style={{
                        background: '#0d0d0d',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        padding: '16px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 3, height: 18, background: 'var(--red)', flexShrink: 0 }} />
                            <span style={{
                                fontFamily: 'Montserrat, sans-serif',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                letterSpacing: '0.22em',
                                textTransform: 'uppercase',
                                color: 'rgba(237,237,237,0.9)',
                            }}>
                                Credits
                            </span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.05em' }}>
                            The people who built this platform
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link href='/credits' onClick={() => setOpen(false)}>
                            <IconButton
                                size='small'
                                title='View full page'
                                style={{ color: 'rgba(237,237,237,0.3)', borderRadius: 0 }}
                            >
                                <OpenInNewIcon style={{ fontSize: '1rem' }} />
                            </IconButton>
                        </Link>
                        <IconButton
                            onClick={() => setOpen(false)}
                            size='small'
                            style={{ color: 'rgba(237,237,237,0.3)', borderRadius: 0 }}
                        >
                            <CloseIcon style={{ fontSize: '1rem' }} />
                        </IconButton>
                    </div>
                </DialogTitle>

                <DialogContent style={{ padding: '28px 24px', overflowX: 'hidden' }}>

                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
                            <CircularProgress size={28} style={{ color: 'var(--red)' }} />
                        </div>
                    )}

                    {!loading && data && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                            {/* Intro */}
                            <div style={{ textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
                                <Typography style={{
                                    fontSize: '0.78rem',
                                    lineHeight: 1.9,
                                    color: 'rgba(237,237,237,0.4)',
                                    letterSpacing: '0.04em',
                                }}>
                                    The ASOT platform was built by members of the community who volunteered
                                    their time, skills, and expertise.
                                </Typography>
                            </div>

                            {/* Cards */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                gap: 16,
                            }}>
                                {data.map((c, index) => (
                                    <ContributorCard key={c.id} contributor={c} index={index} />
                                ))}
                            </div>

                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}


function ContributorCard({ contributor: c, index }: { contributor: CreditContributor; index: number }) {
    const hasStats = c.awardsCount > 0 || c.promoCount > 0 || c.qualCount > 0

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid rgba(255,255,255,0.06)',
                borderTop: `3px solid ${c.accent}`,
                background: '#0c0c0c',
            }}
        >
            {/* Watermark number */}
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    top: '50%',
                    right: '-0.05em',
                    transform: 'translateY(-50%)',
                    fontSize: '11rem',
                    fontWeight: 900,
                    color: 'rgba(237,237,237,0.025)',
                    lineHeight: 1,
                    fontFamily: 'Montserrat, sans-serif',
                    letterSpacing: '-0.05em',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    zIndex: 0,
                }}
            >
                {String(index + 1).padStart(2, '0')}
            </div>

            {/* Avatar section */}
            <div
                style={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    padding: '24px 20px 20px',
                    background: `radial-gradient(ellipse at 50% 0%, ${c.accent}14 0%, transparent 65%)`,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
            >
                {/* Avatar */}
                <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                    <Image
                        src={c.avatarURL}
                        alt={c.name}
                        fill
                        className='rounded-full object-cover'
                        style={{
                            outline: `3px solid ${c.accent}66`,
                            outlineOffset: 4,
                            boxShadow: `0 0 24px ${c.accent}28`,
                        }}
                    />
                </div>

                {/* Name block */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
                    {c.rankAbbr && (
                        <div style={{
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.24em',
                            color: c.accent, textTransform: 'uppercase',
                        }}>
                            {c.rankAbbr}
                        </div>
                    )}
                    <h3 style={{
                        fontSize: '1.35rem', fontWeight: 800, letterSpacing: '0.06em',
                        margin: 0, textTransform: 'uppercase', lineHeight: 1.15,
                        color: 'rgba(237,237,237,0.95)',
                    }}>
                        {c.name}
                    </h3>
                    {c.fullRank && c.fullRank !== c.rankAbbr && (
                        <div style={{
                            fontSize: '0.62rem', letterSpacing: '0.14em',
                            color: 'rgba(237,237,237,0.28)', textTransform: 'uppercase',
                        }}>
                            {c.fullRank}
                        </div>
                    )}
                </div>

                {/* ORBAT */}
                {c.orbatRole && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
                        <div style={{ height: 1, width: 32, background: `${c.accent}50` }} />
                        <div style={{
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em',
                            color: `${c.accent}cc`, textTransform: 'uppercase',
                        }}>
                            {c.orbatRole}
                        </div>
                        {c.orbatSection && (
                            <div style={{
                                fontSize: '0.58rem', letterSpacing: '0.12em',
                                color: 'rgba(237,237,237,0.2)', textTransform: 'uppercase',
                            }}>
                                {c.orbatSection}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Contribution section */}
            <div style={{
                position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
                gap: 10, padding: '16px', flex: 1,
            }}>
                <div>
                    <div style={{
                        fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.24em',
                        color: 'rgba(219,0,29,0.6)', textTransform: 'uppercase', marginBottom: 4,
                    }}>
                        Contribution
                    </div>
                    <div style={{
                        fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.14em',
                        color: c.accent, textTransform: 'uppercase', marginBottom: 8,
                    }}>
                        {c.title}
                    </div>
                    <p style={{
                        fontSize: '0.74rem', lineHeight: 1.75,
                        color: 'rgba(237,237,237,0.42)', margin: 0,
                    }}>
                        {c.description}
                    </p>
                </div>

                {hasStats && (
                    <div style={{
                        display: 'flex', gap: 16, marginTop: 'auto', paddingTop: 12,
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        {c.promoCount > 0 && <Stat label='Promotions' value={c.promoCount} />}
                        {c.awardsCount > 0 && <Stat label='Awards' value={c.awardsCount} />}
                        {c.qualCount > 0 && <Stat label='Quals' value={c.qualCount} />}
                    </div>
                )}
            </div>
        </div>
    )
}


function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(237,237,237,0.6)', lineHeight: 1 }}>
                {value}
            </span>
            <span style={{
                fontSize: '0.55rem', letterSpacing: '0.14em',
                color: 'rgba(237,237,237,0.22)', textTransform: 'uppercase',
            }}>
                {label}
            </span>
        </div>
    )
}
