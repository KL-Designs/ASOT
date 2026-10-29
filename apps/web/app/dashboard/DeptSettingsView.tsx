'use client'

import type { ReactNode } from 'react'
import DeptMembersTab from '@/app/dashboard/DeptMembersTab'
import DeptLinksManagerCard from '@/app/dashboard/_components/dept-links/DeptLinksManagerCard'

/** One tool shown under a department's Admin view. */
export interface DeptAdminSection {
    key: string
    label: string
    /** Omitted means visible. Each tool keeps the gate it had as a main tab. */
    visible?: boolean
    render: () => ReactNode
}

const MEMBERS_KEY = 'members'

const pillSx = (active: boolean): React.CSSProperties => ({
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '5px 12px',
    background: active ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'rgba(219,0,29,0.45)' : 'var(--line-2)'}`,
    color: active ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
    cursor: 'pointer',
})

/**
 * A department's Admin view (row 84): its members and quick links, then the
 * administrative tools that used to crowd the main tab bar. The tools are
 * moved, not rebuilt: each section renders the same component its old tab did.
 */
export default function DeptSettingsView({
    department, displayName, userId, canManage, canManageLinks, isJ4 = false,
    sections = [], active, onSelect,
}: {
    department: string
    displayName: string
    userId: string
    canManage: boolean
    canManageLinks: boolean
    isJ4?: boolean
    sections?: DeptAdminSection[]
    active?: string | null
    onSelect?: (key: string) => void
}) {
    const shown = sections.filter(s => s.visible !== false)
    const current = shown.find(s => s.key === active)

    return (
        <div className='flex flex-col flex-1 min-h-0'>
            {shown.length > 0 && (
                <div className='mx-6 mt-4 flex flex-wrap gap-2' role='tablist' aria-label='Admin tools'>
                    <button type='button' role='tab' aria-selected={!current} style={pillSx(!current)} onClick={() => onSelect?.(MEMBERS_KEY)}>
                        Members &amp; Links
                    </button>
                    {shown.map(s => (
                        <button key={s.key} type='button' role='tab' aria-selected={current?.key === s.key} style={pillSx(current?.key === s.key)} onClick={() => onSelect?.(s.key)}>
                            {s.label}
                        </button>
                    ))}
                </div>
            )}
            {current ? <div className='flex-1 min-h-0'>{current.render()}</div> : (
                <>
                    <DeptLinksManagerCard department={department} canManage={canManageLinks} />
                    <DeptMembersTab department={department} displayName={displayName} userId={userId} canManage={canManage} isJ4={isJ4} />
                </>
            )}
        </div>
    )
}
