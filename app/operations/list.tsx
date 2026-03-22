'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Edit, ContentCopy, Delete, ArrowForward, Add } from '@mui/icons-material'


export function CreateButton() {
    const [active, setActive] = useState(false)

    function createMission() {
        setActive(true)
        fetch('/api/operations/new')
            .then(res => res.json())
            .then(json => {
                if (json.error) return alert(json.error)
                alert('New Mission Created!')
                setActive(false)
            })
            .catch(err => { alert(err); setActive(false) })
    }

    return (
        <button
            onClick={createMission}
            disabled={active}
            style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px',
                background: 'rgba(219,0,29,0.06)',
                border: '1px solid rgba(219,0,29,0.3)',
                color: active ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.75)',
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: active ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s, color 0.2s',
                flexShrink: 0,
            }}
        >
            <Add style={{ fontSize: 15 }} />
            New Mission
        </button>
    )
}


export function MissionList() {
    const [missions, setMissions] = useState<Operation[]>([])
    const [hasAccess, setHasAccess] = useState(false)

    useEffect(() => {
        fetch(encodeURI(`/api/me/roles?has=HQ Staff`))
            .then(res => res.json())
            .then(json => { if (!json.error) setHasAccess(json.access) })

        const interval = setInterval(() => {
            fetch('/api/operations')
                .then(res => res.json())
                .then(json => { if (json.missions) setMissions(json.missions) })
        }, 1000)

        return () => clearInterval(interval)
    }, [])

    if (missions.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(237,237,237,0.15)', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontStyle: 'italic' }}>
                No operations on record
            </div>
        )
    }

    return (
        <div className='flex flex-col'>
            {missions.map(mission => (
                <MissionRow key={mission._id.toString()} mission={mission} hasAccess={hasAccess} />
            ))}
        </div>
    )
}


function MissionRow({ mission, hasAccess }: { mission: Operation, hasAccess: boolean }) {
    const [hovered, setHovered] = useState(false)

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className='flex items-center gap-3 px-4 py-3'
            style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                borderLeft: `2px solid ${hovered ? 'var(--red)' : 'rgba(219,0,29,0.15)'}`,
                background: hovered ? 'rgba(255,255,255,0.015)' : 'transparent',
                transition: 'border-color 0.2s, background 0.2s',
            }}
        >
            {/* Info */}
            <div className='flex flex-col gap-[3px] flex-1 min-w-0'>
                <span style={{
                    fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'rgba(237,237,237,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {mission.title}
                </span>
                <div className='flex items-center gap-3 flex-wrap'>
                    {mission.department && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>
                            {mission.department}
                        </span>
                    )}
                    <span style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: 'rgba(237,237,237,0.28)', textTransform: 'uppercase' }}>
                        {new Date(mission.date).toDateString()}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className='flex items-center gap-1 shrink-0'>
                {hasAccess && (
                    <>
                        <Link href={`/operations/edit?op=${mission._id.toString()}`} title='Edit'>
                            <IconBtn><Edit style={{ fontSize: 15 }} /></IconBtn>
                        </Link>
                        <button
                            title='Duplicate'
                            onClick={() => fetch(`/api/operations/duplicate?id=${mission._id}`).then(r => r.json()).then(j => { if (j.error) alert(j.error) })}
                            style={{ all: 'unset', cursor: 'pointer' }}
                        >
                            <IconBtn><ContentCopy style={{ fontSize: 15 }} /></IconBtn>
                        </button>
                        <button
                            title='Delete'
                            onClick={() => {
                                if (confirm(`Delete "${mission.title}"?`))
                                    fetch(`/api/operations/delete?id=${mission._id}`).then(r => r.json()).then(j => { if (j.error) alert(j.error) })
                            }}
                            style={{ all: 'unset', cursor: 'pointer' }}
                        >
                            <IconBtn danger><Delete style={{ fontSize: 15 }} /></IconBtn>
                        </button>
                        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
                    </>
                )}

                <Link href={`/operations/${mission._id.toString()}`} title='View Mission'>
                    <div
                        className='flex items-center gap-1'
                        style={{
                            padding: '5px 10px',
                            border: '1px solid rgba(219,0,29,0.25)',
                            color: 'rgba(219,0,29,0.65)',
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => {
                            const el = e.currentTarget as HTMLElement
                            el.style.background = 'rgba(219,0,29,0.08)'
                            el.style.color = 'rgba(219,0,29,1)'
                            el.style.borderColor = 'rgba(219,0,29,0.5)'
                        }}
                        onMouseLeave={e => {
                            const el = e.currentTarget as HTMLElement
                            el.style.background = 'transparent'
                            el.style.color = 'rgba(219,0,29,0.65)'
                            el.style.borderColor = 'rgba(219,0,29,0.25)'
                        }}
                    >
                        View <ArrowForward style={{ fontSize: 11 }} />
                    </div>
                </Link>
            </div>
        </div>
    )
}


function IconBtn({ children, danger }: { children: React.ReactNode, danger?: boolean }) {
    const base = danger ? 'rgba(219,0,29,0.35)' : 'rgba(237,237,237,0.3)'
    const hover = danger ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.75)'

    return (
        <div
            style={{ padding: 6, color: base, display: 'flex', transition: 'color 0.15s', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = hover)}
            onMouseLeave={e => (e.currentTarget.style.color = base)}
        >
            {children}
        </div>
    )
}
