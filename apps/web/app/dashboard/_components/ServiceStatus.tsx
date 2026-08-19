'use client'

import { useEffect, useState } from 'react'
import { Storage, Backup, Forum, Headset, MilitaryTech, Warning } from '@mui/icons-material'
import { Tooltip } from '@mui/material'

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
 * One row per service, stacked.
 *
 * These were six icons in a row at the top-right of the dashboard home, where
 * the only thing distinguishing "Discord is in dev mode" from "Discord is down"
 * was the hue of a 15px glyph you had to hover to name. Stacked, each row says
 * what it is and what it is doing without the tooltip — which is still there
 * for the dev-mode distinction the word alone compresses.
 */
export function ServiceStatusList() {
    const status = useServiceStatus()

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {SERVICES.map(({ key, name, Icon }) => {
                const svc = status?.[key]
                // Held at a muted dash until the first poll lands, so the card
                // does not change height a second after it renders.
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
    )
}
