'use client'

import { useEffect, useState } from 'react'
import { Link as LinkIcon, OpenInNew } from '@mui/icons-material'
import { SectionLabel } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

interface Group {
    department: string
    links: DepartmentLinkListItem[]
}

/**
 * Grouped-by-department quick links for the dashboard home.
 *
 * These are bookmarks. They used to wear the same red top rule the operations
 * panel and the discharge tool wear, which put "open the J3 training sheet" and
 * "end someone's service" at the same volume. They are neutral tiles now, and
 * the department heading does the sorting work the colour was pretending to.
 *
 * Tile styling mirrors DeptLinksRail.tsx's tiles; kept as its own small
 * duplicate rather than a shared component, matching this codebase's existing
 * per-surface duplication convention (see the JNPanel.tsx files).
 */
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
        <div className='flex flex-col gap-4'>
            <SectionLabel>Quick links</SectionLabel>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {groups.map(group => (
                    <div key={group.department}>
                        <div className={s.hint} style={{ marginBottom: 7 }}>
                            {group.department.toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {group.links.map(link => (
                                <a
                                    key={link._id}
                                    href={link.url}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className={s.qlink}
                                >
                                    {link.hasFavicon && !failedIcons.has(link._id) ? (
                                        <img
                                            src={`/api/admin/dept-links/${link._id}/favicon?v=${link.faviconVersion}`}
                                            width={16} height={16}
                                            alt=''
                                            style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }}
                                            onError={() => setFailedIcons(prev => new Set(prev).add(link._id))}
                                        />
                                    ) : (
                                        <LinkIcon sx={{ fontSize: 16 }} />
                                    )}
                                    <span>{link.nameOverride ?? link.fetchedTitle}</span>
                                    <OpenInNew sx={{ fontSize: 11, opacity: 0.5 }} />
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
