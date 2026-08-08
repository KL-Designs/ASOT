'use client'

import { useState } from 'react'
import { Typography } from '@mui/material'

export default function ResetTokenButton() {
    const [confirming, setConfirming] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')

    const btnBase: React.CSSProperties = {
        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', border: 'none', cursor: 'pointer', padding: '6px 14px',
    }
    const ghostBtn: React.CSSProperties = {
        ...btnBase, color: 'rgba(237,237,237,0.35)', background: 'none',
        border: '1px solid rgba(255,255,255,0.08)',
    }
    const dangerBtn: React.CSSProperties = {
        ...btnBase, color: 'rgba(219,0,29,0.75)', background: 'rgba(219,0,29,0.08)',
        border: '1px solid rgba(219,0,29,0.25)',
    }

    async function confirmReset() {
        setResetting(true)
        setError('')
        try {
            const res = await fetch('/api/me/reset-token', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to reset login token')
            setDone(true)
            setConfirming(false)
            setTimeout(() => setDone(false), 4000)
        } catch (e: any) {
            setError(e.message || 'Failed to reset login token')
        } finally {
            setResetting(false)
        }
    }

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)' }}>
            <div className='flex items-center px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                    Security
                </Typography>
                {done && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(0,200,100,0.8)', background: 'rgba(0,200,100,0.08)', border: '1px solid rgba(0,200,100,0.2)', padding: '2px 8px' }}>
                        Reset
                    </span>
                )}
            </div>

            <div className='flex items-center gap-3 px-4 py-3'>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Log Out of All Devices</div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                        Resets your login token — every other signed-in device or browser will be logged out immediately. This device stays logged in.
                    </div>
                </div>

                {!confirming ? (
                    <button onClick={() => setConfirming(true)} style={dangerBtn}>Reset Token</button>
                ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <button onClick={() => setConfirming(false)} disabled={resetting} style={ghostBtn}>Cancel</button>
                        <button
                            onClick={confirmReset}
                            disabled={resetting}
                            style={{ ...dangerBtn, cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.6 : 1 }}
                        >
                            {resetting ? 'Resetting…' : 'Confirm'}
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div style={{ margin: '0 16px 14px', fontSize: '0.78rem', color: 'rgba(219,80,80,0.9)', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.2)', padding: '8px 12px' }}>
                    {error}
                </div>
            )}
        </div>
    )
}
