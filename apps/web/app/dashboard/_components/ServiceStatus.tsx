'use client'

import { useEffect, useState } from 'react'
import { Storage, Backup, Forum, Headset, MilitaryTech, Warning } from '@mui/icons-material'
import { Collapse, Tooltip } from '@mui/material'

/* ============================================================================
   Service status.

   Lives in the sidebar's identity card, where it replaced a "Koda · ONLINE"
   line that only ever said one thing. Whether *you* are online is not news to
   someone reading their own screen; whether the bot, TeamSpeak and the milpac
   renderer are is the thing staff actually chase.

   The website row is deliberately absent. It cannot report anything you did not
   already know by seeing this page render.
   ========================================================================== */

export type ServiceStatus = { online: boolean, devMode?: boolean }

export type StatusResponse = {
    website: ServiceStatus
    database: ServiceStatus
    backups: ServiceStatus
    discord: ServiceStatus
    teamspeak: ServiceStatus
    milpac: ServiceStatus
}

const ALL_OFFLINE: StatusResponse = {
    website: { online: false },
    database: { online: false },
    backups: { online: false },
    discord: { online: false },
    teamspeak: { online: false },
    milpac: { online: false },
}

/*
   On the status palette rather than four unrelated rgba() values: green is
   healthy, amber is dev-mode, red is down, blue-grey is dev-mode-but-connected
   — which is informational rather than a problem.
*/
export function statusColor(status: ServiceStatus): string {
    if (status.devMode) return status.online ? 'var(--info)' : 'var(--amber)'
    return status.online ? 'var(--live)' : 'var(--red-hi)'
}

export function statusWord(status: ServiceStatus): string {
    if (status.devMode) return status.online ? 'Dev' : 'Dev · off'
    return status.online ? 'Online' : 'Offline'
}

export function statusLabel(name: string, status: ServiceStatus): string {
    if (status.devMode) return status.online ? `${name}: Dev mode (connected)` : `${name}: Dev mode — OFFLINE`
    return `${name}: ${status.online ? 'Online' : 'Offline'}`
}

/** Polls every 30s. Null until the first response lands. */
export function useServiceStatus(): StatusResponse | null {
    const [status, setStatus] = useState<StatusResponse | null>(null)

    useEffect(() => {
        let cancelled = false
        async function poll() {
            try {
                const res = await fetch('/api/dashboard/status')
                if (!res.ok) throw new Error('bad response')
                const data: StatusResponse = await res.json()
                if (!cancelled) setStatus(data)
            } catch {
                if (!cancelled) setStatus(ALL_OFFLINE)
            }
        }
        poll()
        const id = setInterval(poll, 30_000)
        return () => { cancelled = true; clearInterval(id) }
    }, [])

    return status
}

const SERVICES: { key: keyof StatusResponse, name: string, Icon: typeof Storage }[] = [
    { key: 'database',  name: 'Database',  Icon: Storage },
    { key: 'backups',   name: 'Backups',   Icon: Backup },
    { key: 'discord',   name: 'Discord',   Icon: Forum },
    { key: 'teamspeak', name: 'TeamSpeak', Icon: Headset },
    { key: 'milpac',    name: 'MilPac',    Icon: MilitaryTech },
]

/**
 * The one line that has to survive being collapsed.
 *
 * A status block you can hide is only safe if hiding it still tells you when
 * something is wrong — otherwise the first thing anyone does is collapse it and
 * the block stops doing its job. Worst state wins: down over dev over healthy.
 */
function summarise(status: StatusResponse | null): { text: string, color: string } {
    if (!status) return { text: '····', color: 'var(--txt-4)' }
    const down = SERVICES.filter(s => !status[s.key].online).length
    const dev = SERVICES.filter(s => status[s.key].devMode).length
    if (down) return { text: `${down} down`, color: 'var(--red-hi)' }
    if (dev) return { text: `${dev} dev`, color: 'var(--amber)' }
    return { text: 'All ok', color: 'var(--live)' }
}

const STORE_KEY = 'asot.sidebar.services'

/**
 * One row per service, stacked, behind a [-]/[+] header.
 *
 * These were six icons in a row at the top-right of the dashboard home, where
 * the only thing distinguishing "Discord is in dev mode" from "Discord is down"
 * was the hue of a 15px glyph you had to hover to name. Stacked, each row says
 * what it is and what it is doing without the tooltip — which is still there
 * for the dev-mode distinction the word alone compresses.
 */
export function ServiceStatusList() {
    const status = useServiceStatus()

    // Starts open so the server and the first client render agree; a stored
    // preference is applied on mount. One frame of expanded is the price of not
    // hydrating a mismatch.
    const [open, setOpen] = useState(true)
    useEffect(() => {
        try {
            if (window.localStorage.getItem(STORE_KEY) === '0') setOpen(false)
        } catch { /* private mode — the default stands */ }
    }, [])

    function toggle() {
        setOpen(prev => {
            try { window.localStorage.setItem(STORE_KEY, prev ? '0' : '1') } catch { /* ignore */ }
            return !prev
        })
    }

    const summary = summarise(status)

    return (
        <div>
            {/* Matches the sidebar's own [-]/[+] section headers. */}
            <button
                onClick={toggle}
                aria-expanded={open}
                className='w-full flex items-center justify-between'
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: open ? 8 : 0 }}
            >
                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'var(--txt-4)', fontFamily: 'monospace' }}>{'//'}</span>
                    Services
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!open && (
                        <span style={{
                            fontFamily: 'monospace', fontSize: '0.52rem', fontWeight: 700,
                            letterSpacing: '0.14em', textTransform: 'uppercase', color: summary.color,
                        }}>
                            {summary.text}
                        </span>
                    )}
                    <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)', lineHeight: 1 }}>
                        {open ? '[−]' : '[+]'}
                    </span>
                </span>
            </button>

            <Collapse in={open}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {SERVICES.map(({ key, name, Icon }) => {
                        const svc = status?.[key]
                        // Held at a muted dash until the first poll lands, so
                        // the card does not change height a second after it
                        // renders.
                        const color = svc ? statusColor(svc) : 'var(--txt-4)'
                        const showWarning = !!svc?.devMode && !svc.online

                        return (
                            <Tooltip key={key} title={svc ? statusLabel(name, svc) : `${name}: checking…`} placement='right'>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1 }}>
                                    <span style={{ position: 'relative', display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}>
                                        <Icon sx={{ fontSize: 13, color }} />
                                        {showWarning && (
                                            <Warning sx={{ fontSize: 8, color: 'var(--amber)', position: 'absolute', bottom: -3, right: -4 }} />
                                        )}
                                    </span>
                                    <span style={{
                                        flex: 1, minWidth: 0,
                                        fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: '0.12em',
                                        textTransform: 'uppercase', color: 'var(--txt-3)',
                                    }}>
                                        {name}
                                    </span>
                                    <span style={{
                                        fontFamily: 'monospace', fontSize: '0.52rem', fontWeight: 700,
                                        letterSpacing: '0.14em', textTransform: 'uppercase', color,
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                    }}>
                                        {svc ? statusWord(svc) : '—'}
                                    </span>
                                </div>
                            </Tooltip>
                        )
                    })}
                </div>
            </Collapse>
        </div>
    )
}
