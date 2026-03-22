'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Typography, Switch, Divider, CircularProgress } from '@mui/material'
import { WarningAmber, CheckCircleOutline, Launch, RestartAlt, Tune, Engineering, Videocam, FlashOn, Psychology } from '@mui/icons-material'


// ─── Mod row ──────────────────────────────────────────────────────────────────

function Mod({ type, details }: { type: 'qol' | 'gfx' | 'zeus' | 'j2' | 'j5', details: { id: string, name: string } }) {
    const [enabled, setEnabled] = useState<boolean | null>(null)

    useEffect(() => {
        fetch(`/optionals/me?type=${type}&id=${details.id}&mode=check`)
            .then(res => res.json())
            .then(json => {
                if (json.error) return console.error(json.error)
                setEnabled(json.enabled ? true : false)
            })
    }, [])

    useEffect(() => {
        if (enabled === null) return
        const mode = enabled ? 'add' : 'remove'
        const url = enabled
            ? `/optionals/me?type=${type}&id=${details.id}&mode=${mode}&name=${encodeURIComponent(details.name)}`
            : `/optionals/me?type=${type}&id=${details.id}&mode=${mode}`
        fetch(url).then(res => res.json()).then(json => {
            if (json.error) console.error(json.error)
        })
    }, [enabled])

    return (
        <div
            className='flex flex-row justify-between items-center gap-3 px-3 py-[6px] rounded transition-colors'
            style={{
                background: enabled ? 'rgba(219,0,29,0.05)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
        >
            <Link
                href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${details.id}`}
                target='_blank'
                className='flex items-center gap-2 min-w-0'
            >
                <Typography
                    fontSize='0.82rem'
                    fontWeight={enabled ? 600 : 400}
                    letterSpacing='0.02em'
                    style={{
                        color: enabled ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
                        transition: 'color 0.15s',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {details.name}
                </Typography>
                <Launch style={{ fontSize: 11, color: 'rgba(237,237,237,0.2)', flexShrink: 0 }} />
            </Link>

            {enabled === null
                ? <CircularProgress size={16} style={{ color: 'rgba(219,0,29,0.5)', flexShrink: 0 }} />
                : <Switch
                    size='small'
                    checked={enabled}
                    onChange={e => setEnabled(e.currentTarget.checked)}
                    sx={{
                        flexShrink: 0,
                        '& .MuiSwitch-thumb': { background: enabled ? 'var(--red)' : 'rgba(237,237,237,0.3)' },
                        '& .MuiSwitch-track': { background: enabled ? 'rgba(219,0,29,0.35) !important' : 'rgba(255,255,255,0.1) !important', opacity: '1 !important' },
                    }}
                />
            }
        </div>
    )
}


// ─── Mod category card ────────────────────────────────────────────────────────

function ModCard({
    title, icon, warning, list, type,
}: {
    title: string
    icon: React.ReactNode
    warning?: string
    list: { id: string, name: string }[]
    type: 'qol' | 'gfx' | 'zeus' | 'j2' | 'j5'
}) {
    return (
        <div
            className='flex flex-col'
            style={{
                border: '1px solid rgba(219,0,29,0.15)',
                borderTop: '2px solid var(--red)',
                background: 'rgba(255,255,255,0.02)',
            }}
        >
            {/* Card header */}
            <div className='flex items-center gap-3 px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--red)', display: 'flex', opacity: 0.8 }}>{icon}</span>
                <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                    {title}
                </Typography>
                <span
                    style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'rgba(219,0,29,0.7)',
                        background: 'rgba(219,0,29,0.08)',
                        border: '1px solid rgba(219,0,29,0.2)',
                        padding: '2px 8px',
                    }}
                >
                    {list.length} MODS
                </span>
            </div>

            {/* Warning banner */}
            {warning && (
                <div className='flex items-center gap-2 px-4 py-2' style={{ background: 'rgba(255,160,0,0.06)', borderBottom: '1px solid rgba(255,160,0,0.12)' }}>
                    <WarningAmber style={{ fontSize: 13, color: 'rgba(255,160,0,0.7)' }} />
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(255,160,0,0.7)' }}>{warning}</Typography>
                </div>
            )}

            {/* Mod list */}
            <div className='flex flex-col px-1 py-2'>
                {list.length === 0
                    ? <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.25)', padding: '8px 12px' }}>No mods in this category</Typography>
                    : list.map(mod => <Mod key={mod.id} type={type} details={mod} />)
                }
            </div>
        </div>
    )
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {

    const [agreement, setAgreement] = useState(false)
    const [waitTime, setWaitTime] = useState(10)
    const [resetting, setResetting] = useState(false)

    const [qolList, setQolList] = useState<{ id: string, name: string }[]>([])
    const [gfxList, setGfxList] = useState<{ id: string, name: string }[]>([])
    const [zeusList, setZeusList] = useState<{ id: string, name: string }[]>([])
    const [j2List, setJ2List] = useState<{ id: string, name: string }[]>([])
    const [j5List, setJ5List] = useState<{ id: string, name: string }[]>([])

    useEffect(() => {
        const interval = setInterval(() => {
            setWaitTime(prev => {
                if (prev <= 0) { clearInterval(interval); return 0 }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        if (!agreement) return
        const load = (type: string, setter: (v: { id: string, name: string }[]) => void) => {
            fetch(`/optionals/fetch?type=${type}`)
                .then(r => r.json())
                .then(j => { if (!j.error) setter(j) })
        }
        load('qol', setQolList)
        load('gfx', setGfxList)
        load('zeus', setZeusList)
        load('j2', setJ2List)
        load('j5', setJ5List)
    }, [agreement])

    function handleReset() {
        setResetting(true)
        fetch('/optionals/reset')
            .then(r => r.json())
            .then(j => {
                if (j.error) { alert(j.error); setResetting(false) }
                if (j.success) location.reload()
            })
    }

    // ── Warning screen ────────────────────────────────────────────────────────

    if (!agreement) return (
        <div
            className='mx-auto w-full max-w-[520px] flex flex-col gap-5'
            style={{
                border: '1px solid rgba(219,0,29,0.2)',
                borderTop: '2px solid var(--red)',
                background: 'rgba(219,0,29,0.03)',
                padding: '2rem',
            }}
        >
            <div className='flex flex-col items-center gap-3'>
                <WarningAmber style={{ fontSize: 44, color: 'var(--red)', opacity: 0.85 }} />
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={4} style={{ textTransform: 'uppercase' }}>
                    Performance Warning
                </Typography>
                <div style={{ width: 40, height: 2, background: 'var(--red)' }} />
            </div>

            <Typography style={{ color: 'rgba(237,237,237,0.6)', fontSize: '0.875rem', lineHeight: 1.75, textAlign: 'center' }}>
                Optional mods are provided for customisation, but enabling too many can significantly degrade game performance and stability.
                <br /><br />
                The more mods you activate, the higher the risk of reduced FPS, long load times, and potential game crashes.
                <br /><br />
                Only enable mods you understand and actually intend to use.
            </Typography>

            <Divider style={{ borderColor: 'rgba(219,0,29,0.15)' }} />

            <button
                onClick={() => setAgreement(true)}
                disabled={waitTime > 0}
                style={{
                    background: waitTime > 0 ? 'rgba(255,255,255,0.04)' : 'var(--red)',
                    border: `1px solid ${waitTime > 0 ? 'rgba(255,255,255,0.1)' : 'var(--red)'}`,
                    color: waitTime > 0 ? 'rgba(237,237,237,0.3)' : 'white',
                    padding: '10px 24px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: waitTime > 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    width: '100%',
                }}
            >
                {waitTime > 0 ? `I Understand  —  ${waitTime}s` : 'I Understand, Continue'}
            </button>
        </div>
    )

    // ── Config screen ─────────────────────────────────────────────────────────

    return (
        <div className='w-full flex flex-col gap-8'>

            {/* Header */}
            <div className='flex flex-col sm:flex-row sm:items-start justify-between gap-4'>
                <div>
                    <Typography fontWeight={700} fontSize='1.4rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        Configure Optional Addons
                    </Typography>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.4)', marginTop: 4 }}>
                        Only enable addons you know and use regularly — some have significant performance impact.
                    </Typography>
                </div>

                <div className='flex items-center gap-3 shrink-0'>
                    {/* Auto-save indicator */}
                    <div className='flex items-center gap-2' style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.75rem', letterSpacing: '0.06em' }}>
                        <CheckCircleOutline style={{ fontSize: 14, color: 'rgba(80,200,80,0.6)' }} />
                        Auto-saved
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

                    {/* Reset button */}
                    <button
                        onClick={handleReset}
                        disabled={resetting}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'transparent',
                            border: '1px solid rgba(219,0,29,0.3)',
                            color: 'rgba(219,0,29,0.8)',
                            padding: '6px 14px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: resetting ? 'not-allowed' : 'pointer',
                            opacity: resetting ? 0.5 : 1,
                            transition: 'all 0.2s',
                        }}
                    >
                        <RestartAlt style={{ fontSize: 14 }} />
                        Disable All
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(to right, rgba(219,0,29,0.4), rgba(255,255,255,0.06), transparent)' }} />

            {/* General addons */}
            <div className='flex flex-col gap-3'>
                <div className='flex items-center gap-3'>
                    <Typography fontSize='0.7rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                        General Addons
                    </Typography>
                    <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <ModCard title='Quality of Life' icon={<Tune fontSize='small' />} list={qolList} type='qol' />
                    <ModCard
                        title='FPS-Intensive Mods'
                        icon={<FlashOn fontSize='small' />}
                        warning='Some of these addons may significantly affect your performance.'
                        list={gfxList}
                        type='gfx'
                    />
                </div>
            </div>

            {/* Department addons */}
            <div className='flex flex-col gap-3'>
                <div className='flex items-center gap-3'>
                    <Typography fontSize='0.7rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                        Department Addons
                    </Typography>
                    <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <ModCard title='J2 Mission Making' icon={<Engineering fontSize='small' />} list={j2List} type='j2' />
                    <ModCard title='J5 Media' icon={<Videocam fontSize='small' />} list={j5List} type='j5' />
                    <ModCard title='J6 Zeus' icon={<Psychology fontSize='small' />} list={zeusList} type='zeus' />
                </div>
            </div>

        </div>
    )
}
