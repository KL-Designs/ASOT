'use client'

import { useEffect, useState } from 'react'
import { Link as LinkIcon, OpenInNew } from '@mui/icons-material'

interface Group {
    department: string
    links: DepartmentLinkListItem[]
}

// Grouped-by-department quick links section for /dashboard home. Tile
// styling mirrors DeptLinksRail.tsx's tiles; kept as its own small
// duplicate rather than a shared component, matching this codebase's
// existing per-surface duplication convention (see the JNPanel.tsx files).
export default function DashboardQuickLinks() {
    const [groups, setGroups] = useState<Group[]>([])
    const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetch('/api/dashboard/quick-links')
            .then(r => r.json())
            .then(data => setGroups(data.groups ?? []))
            .catch(() => setGroups([]))
    }, [])

    if (groups.length === 0) return null

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.55rem', color: 'rgba(219,0,29,0.4)', lineHeight: 1 }}>{'//'}</span>
                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>
                    Quick Links
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {groups.map(group => (
                    <div key={group.department}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6 }}>
                            {group.department.toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {group.links.map(link => (
                                <a key={link._id} href={link.url} target='_blank' rel='noopener noreferrer' style={{ textDecoration: 'none' }}>
                                    <div
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '8px 14px',
                                            border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)',
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
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
