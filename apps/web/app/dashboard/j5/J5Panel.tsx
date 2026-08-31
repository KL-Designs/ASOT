'use client'

import { Typography, Tabs, Tab } from '@mui/material'
import { Settings, CalendarMonth, HistoryEdu } from '@mui/icons-material'
import DeptSettingsView from '@/app/dashboard/DeptSettingsView'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import GalleryOperationsTab from '@/app/dashboard/j5/tabs/GalleryOperationsTab'
import MediaTab from '@/app/dashboard/j5/tabs/media/MediaTab'
import FeaturedTab from '@/app/dashboard/j5/tabs/featured/FeaturedTab'
import SotmTab from '@/app/dashboard/j5/tabs/sotm/SotmTab'
import SubmissionsTab from '@/app/dashboard/j5/tabs/submissions/SubmissionsTab'
import GalleryTagsTab from '@/app/dashboard/j5/tabs/GalleryTagsTab'
import PinTabLabel from '@/app/dashboard/_components/PinTabLabel'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useTabState } from '@/app/dashboard/_components/useTabState'
import MeetingsTab from '@/app/dashboard/_components/meetings/MeetingsTab'
import ActivityLogTab from '@/app/dashboard/_components/ActivityLogTab'
import DeptTicketsTab from '@/app/dashboard/_components/tickets/DeptTicketsTab'
import DeptLinksRail from '@/app/dashboard/_components/dept-links/DeptLinksRail'

export default function J5Panel({
    displayName,
    userId,
    canManageMembers,
    canManageLinks,
    isJ4,
    canReviewGallery,
    canManageGalleryTags,
    canManageGallery,
}: {
    displayName: string
    userId: string
    canManageMembers: boolean
    canManageLinks: boolean
    isJ4: boolean
    canReviewGallery: boolean
    canManageGalleryTags: boolean
    canManageGallery: boolean
}) {
    const { tab, setTab, view, setView } = useTabState(0, 'dept')

    /* Keyed by name, not by position. Submissions and Tags are permission-gated,
       and MUI indexes tabs by their position among the ones actually rendered —
       so a member holding gallery.tags but not gallery.review would otherwise
       land on the wrong panel. Building one array in mockup order and deriving
       both the <Tab> list and the panel body from it means a hidden tab can
       never shift what another index means; the position is computed, never
       assumed. */
    const allTabs: { key: string, label: string, pinLabel: string, visible: boolean, render: () => React.ReactNode }[] = [
        { key: 'media', label: 'Media', pinLabel: 'J5 — Media', visible: true, render: () => (canManageGallery ? <MediaTab /> : <GalleryOperationsTab />) },
        { key: 'submissions', label: 'Submissions', pinLabel: 'J5 — Submissions', visible: canReviewGallery, render: () => <SubmissionsTab /> },
        { key: 'featured', label: 'Featured', pinLabel: 'J5 — Featured', visible: true, render: () => <FeaturedTab /> },
        { key: 'sotm', label: 'Screenshot of month', pinLabel: 'J5 — SOTM', visible: true, render: () => <SotmTab canManage={canManageMembers} /> },
        { key: 'tags', label: 'Tags', pinLabel: 'J5 — Tags', visible: canManageGalleryTags, render: () => <GalleryTagsTab /> },
        { key: 'meetings', label: 'Meetings', pinLabel: 'J5 — Meetings', visible: true, render: () => <MeetingsTab department='j5' userId={userId} isLead={canManageMembers || isJ4} /> },
        { key: 'tickets', label: 'Tickets', pinLabel: 'J5 — Tickets', visible: true, render: () => <DeptTicketsTab department='j5' canManage={canManageMembers || isJ4} isJ4={isJ4} /> },
    ]
    const visibleTabs = allTabs.filter(t => t.visible)

    // A pinned/bookmarked tab index from the old FIXED_TABS ordering (or one
    // that predates a permission grant/revoke shrinking this list) can point
    // past the end of today's array — clamp instead of rendering nothing.
    const activeTab = Math.min(Math.max(tab, 0), visibleTabs.length - 1)

    const tabSx = {
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        minHeight: 40,
        padding: '8px 16px',
        color: 'rgba(237,237,237,0.5)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    const btnSx = (active: boolean): React.CSSProperties => ({
        fontSize: '0.62rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '5px 14px',
        background: active ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(219,0,29,0.25)',
        color: active ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
        cursor: 'pointer',
        borderRadius: 999,
    })

    return (
        <div className='h-full w-full flex flex-col'>
            <div
                className='flex items-center justify-between px-5 py-3 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid var(--line-2)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> DEPARTMENTS
                        </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J5] Media
                    </Typography>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={{ ...btnSx(view === 'settings'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'settings' ? 'dept' : 'settings')}>
                            <Settings sx={{ fontSize: '0.85rem' }} />Management
                        </button>
                        <button style={{ ...btnSx(view === 'calendar'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'calendar' ? 'dept' : 'calendar')}>
                            <CalendarMonth sx={{ fontSize: '0.85rem' }} />Calendar
                        </button>
                        <button style={{ ...btnSx(view === 'activity'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'activity' ? 'dept' : 'activity')}>
                            <HistoryEdu sx={{ fontSize: '0.85rem' }} />Activity Logs
                        </button>
                    </div>
            </div>

            {view === 'settings' && (
                <DeptSettingsView department='j5' displayName={displayName} userId={userId} canManage={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4} />
            )}
            {view === 'calendar' && (
                <DeptCalendarTab department='j5' userId={userId} isJ4={isJ4} />
            )}
            {view === 'activity' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: '8px 0 0' }}>
                    <ActivityLogTab department='j5' />
                </div>
            )}
            {view === 'dept' && (
                <>
                    <DeptLinksRail department='j5' canManage={canManageLinks} onManage={() => setView('settings')} />

                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <Tabs
                            value={activeTab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            {visibleTabs.map((t, i) => (
                                <Tab
                                    key={t.key}
                                    label={<PinTabLabel label={t.label} pinLabel={t.pinLabel} href='/dashboard/j5' tabIndex={i} />}
                                    sx={tabSx}
                                />
                            ))}
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0'>
                        {visibleTabs[activeTab]?.render()}
                    </div>
                </>
            )}
        </div>
    )
}
