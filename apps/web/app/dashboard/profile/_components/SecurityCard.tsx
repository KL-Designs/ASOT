'use client'

import { useState } from 'react'
import { Badge, Button, ConfirmDialog, Panel, PanelBody, PanelHeader } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

/**
 * Log out everywhere else.
 *
 * No typed confirmation: this is recoverable by signing back in, and demanding
 * a word here would spend the friction the kit reserves for the things that
 * are not. The dialog is still a dialog, because the consequence lands on
 * devices that are not in front of you.
 */
export function SecurityCard() {
    const [confirming, setConfirming] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')

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
            setConfirming(false)
        } finally {
            setResetting(false)
        }
    }

    return (
        <>
            <Panel>
                <PanelHeader
                    title='Security'
                    right={done ? <Badge tone='live' dot>Token reset</Badge> : null}
                />
                <PanelBody className='flex flex-col gap-3'>
                    <span className={s.hint} style={{ textTransform: 'none', letterSpacing: '.02em', fontSize: 12.5 }}>
                        Resets your login token. Every other signed-in device or browser is logged
                        out immediately — this one stays.
                    </span>
                    {error && <Badge tone='alert' dot>{error}</Badge>}
                    <div>
                        <Button variant='danger' size='sm' onClick={() => setConfirming(true)}>
                            Log out of all devices
                        </Button>
                    </div>
                </PanelBody>
            </Panel>

            <ConfirmDialog
                open={confirming}
                title='Log out of all devices'
                confirmLabel={resetting ? 'Resetting…' : 'Log them out'}
                warning='Anything signed in elsewhere — phone, another browser, a machine you have left somewhere — is signed out the moment you confirm.'
                onConfirm={confirmReset}
                onCancel={() => setConfirming(false)}
            >
                <p style={{ fontSize: 13, color: 'var(--txt-2)' }}>
                    This device keeps its session. You will not have to sign in again here.
                </p>
            </ConfirmDialog>
        </>
    )
}

export default SecurityCard
