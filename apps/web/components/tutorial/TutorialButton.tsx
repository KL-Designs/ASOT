'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, MenuItem } from '@mui/material'
import { School, CheckCircle } from '@mui/icons-material'
import { tutorialsForPath } from '@/lib/tutorial/registry'
import { useTutorials } from './TutorialProvider'

/**
 * The "Tutorial" pill for a page header. Lists the tutorials registered for
 * the current path (lib/tutorial/registry.ts) and renders nothing when there
 * are none, so it can sit in every department header ahead of any tutorial
 * being written for that department.
 */
export default function TutorialButton({ style }: { style?: React.CSSProperties }) {
    const pathname = usePathname()
    const { start, completed, loadProgress, run } = useTutorials()
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)
    const list = tutorialsForPath(pathname ?? '')

    useEffect(() => { if (list.length) loadProgress() }, [list.length, loadProgress])

    if (!list.length || run) return null

    const allDone = list.every(t => completed[t.id])

    return (
        <>
            <button
                type='button'
                title={allDone ? 'Run a tutorial again' : 'Learn how this page works, with practice data'}
                onClick={e => list.length === 1 ? start(list[0].id) : setAnchor(e.currentTarget)}
                style={{
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    padding: '5px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(219,0,29,0.25)',
                    color: 'rgba(237,237,237,0.55)', cursor: 'pointer', borderRadius: 999,
                    display: 'flex', alignItems: 'center', gap: 5, ...style,
                }}
            >
                <School sx={{ fontSize: '0.85rem' }} />Tutorial
            </button>
            <Menu
                anchorEl={anchor}
                open={!!anchor}
                onClose={() => setAnchor(null)}
                slotProps={{ paper: { style: { background: '#121212', border: '1px solid var(--line-2)', borderRadius: 0, maxWidth: 340 } } }}
            >
                {list.map(t => (
                    <MenuItem key={t.id} onClick={() => { setAnchor(null); start(t.id) }} style={{ display: 'block', whiteSpace: 'normal', padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                            {t.title}
                            {completed[t.id] && <CheckCircle titleAccess='Completed' sx={{ fontSize: '0.85rem', color: '#00c364' }} />}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)', marginTop: 2 }}>{t.summary}</div>
                    </MenuItem>
                ))}
            </Menu>
        </>
    )
}
