'use client'

import { useEffect, useState } from 'react'
import { Tooltip } from '@mui/material'
import { Link as LinkIcon, OpenInNew, Lock } from '@mui/icons-material'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'

interface Props {
    department: string
    canManage: boolean
    onManage?: () => void
}

// Favicon tile rail, the first child of every panel's view === 'dept'
// fragment. onManage is a callback (setView('settings')), never a route, so
// this sidesteps typedRoutes entirely (D2). Members with no visible links
// render nothing; managers always see the ghost "+ ADD" tile plus, when
// empty, the NO QUICK LINKS message.
export default function DeptLinksRail({ department, canManage, onManage }: Props) {
    const [links, setLinks] = useState<DepartmentLinkListItem[]>([])
    const [serverCanManage, setServerCanManage] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetch(`/api/admin/dept-links?department=${department}`)
            .then(r => r.json())
            .then(data => {
                setLinks(data.links ?? [])
                setServerCanManage(!!data.canManage)
                setLoaded(true)
            })
            .catch(() => setLoaded(true))
    }, [department])

    if (!loaded) return null
    if (links.length === 0 && !canManage) return null

    // The ghost tile is gated on the server's own canManage, not just the
    // prop passed down from the panel.
    const showGhost = serverCanManage && !!onManage

    return (
        <div className='mx-6 mt-4' style={{ position: 'relative', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.04)', padding: '10px 14px' }}>
            <CornerBrackets />
            <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> QUICK LINKS
            </span>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {links.map(link => (
                    <a key={link._id} href={link.url} target='_blank' rel='noopener noreferrer' style={{ textDecoration: 'none' }}>
                        <div
                            style={{
                                position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 14px',
                                border: '1px solid var(--line-2)',
                                background: 'rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(219,0,29,0.08)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        >
                            {link.hasFavicon && !failedIcons.has(link._id) ? (
                                <img
                                    src={`/api/admin/dept-links/${link._id}/favicon?v=${link.faviconVersion}`}
                                    width={18} height={18}
                                    style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }}
                                    onError={() => setFailedIcons(prev => new Set(prev).add(link._id))}
                                />
                            ) : (
                                <LinkIcon sx={{ fontSize: 18, color: 'rgba(237,237,237,0.35)' }} />
                            )}
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)' }}>
                                {link.nameOverride ?? link.fetchedTitle}
                            </span>
                            <OpenInNew sx={{ fontSize: 12, color: 'rgba(237,237,237,0.25)' }} />
                            {link.visibleToRoleIds.length > 0 && (
                                <Tooltip title='Restricted to specific sub-roles'>
                                    <Lock sx={{ position: 'absolute', top: -6, right: -6, fontSize: 11, color: 'rgb(255,179,0)' }} />
                                </Tooltip>
                            )}
                        </div>
                    </a>
                ))}

                {showGhost && (
                    <button type='button' onClick={onManage} style={{ all: 'unset', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: '1px dashed rgba(219,0,29,0.25)', background: 'transparent' }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>+ ADD</span>
                        </div>
                    </button>
                )}

                {showGhost && links.length === 0 && (
                    <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(237,237,237,0.3)', display: 'flex', alignItems: 'center' }}>
                        NO QUICK LINKS — CONFIGURE IN SETTINGS
                    </span>
                )}
            </div>
        </div>
    )
}
