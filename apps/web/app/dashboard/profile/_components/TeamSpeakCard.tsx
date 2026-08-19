'use client'

import { useState } from 'react'
import { Badge, Button, Input, Panel, PanelBody, PanelHeader, Select } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

interface Props {
    linked: { cldbid: number, linkedAt: number } | null
    expectedNickname: string
    onLinked?: () => void
}

type Step = 'searching' | 'confirm' | 'manual' | 'awaiting-code' | 'success' | 'error'

interface OnlineClient { clid: string, nickname: string }

/**
 * Links the member's TeamSpeak identity to their account.
 *
 * The linking flow is unchanged — auto-match, fall back to picking yourself off
 * the online list, verify by a poked code. What changed is that it no longer
 * carries its own blue: the card is a kit panel and the modal is the kit's
 * dialog surface, so "linked" is the same green as every other healthy state
 * on the site rather than a colour used nowhere else.
 */
export function TeamSpeakCard({ linked, expectedNickname, onLinked }: Props) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('searching')
    const [errorMsg, setErrorMsg] = useState('')
    const [tsNickname, setTsNickname] = useState('')
    const [onlineClients, setOnlineClients] = useState<OnlineClient[]>([])
    const [selectedClid, setSelectedClid] = useState('')
    const [code, setCode] = useState('')
    const [isLinked, setIsLinked] = useState(!!linked)
    const [notifyState, setNotifyState] = useState<'idle' | 'sending' | 'sent' | 'offline'>('idle')
    const [unlinking, setUnlinking] = useState(false)

    async function startLink() {
        setOpen(true)
        setStep('searching')
        setErrorMsg('')
        setCode('')
        setSelectedClid('')

        const res = await fetch('/api/me/teamspeak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'init' }),
        })
        const data = await res.json()

        if (!res.ok) { setErrorMsg(data.error); setStep('error'); return }

        if (data.matched) {
            setTsNickname(data.tsNickname)
            setSelectedClid(data.tsClid)
            setStep('confirm')
        } else {
            setOnlineClients(data.onlineClients ?? [])
            setStep('manual')
        }
    }

    async function fetchManual() {
        setStep('searching')
        setErrorMsg('')

        const res = await fetch('/api/me/teamspeak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list' }),
        })
        const data = await res.json()

        if (!res.ok) { setErrorMsg(data.error); setStep('error'); return }

        setOnlineClients(data.onlineClients ?? [])
        setSelectedClid('')
        setStep('manual')
    }

    async function sendPoke() {
        if (!selectedClid) return
        setErrorMsg('')
        const res = await fetch('/api/me/teamspeak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'poke', clid: selectedClid }),
        })
        const data = await res.json()
        if (!res.ok) { setErrorMsg(data.error); return }
        const found = onlineClients.find(c => c.clid === selectedClid)
        if (found) setTsNickname(found.nickname)
        setStep('awaiting-code')
    }

    async function verify() {
        setErrorMsg('')
        const res = await fetch('/api/me/teamspeak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify', code }),
        })
        const data = await res.json()
        if (!res.ok) { setErrorMsg(data.error); return }
        setIsLinked(true)
        setStep('success')
        onLinked?.()
    }

    async function unlink() {
        setUnlinking(true)
        const res = await fetch('/api/me/teamspeak', { method: 'DELETE' })
        if (res.ok) setIsLinked(false)
        setUnlinking(false)
    }

    async function notify() {
        setNotifyState('sending')
        const res = await fetch('/api/me/teamspeak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'notify' }),
        })
        const data = await res.json()
        setNotifyState(res.ok ? 'sent' : (data.error?.includes('online') ? 'offline' : 'idle'))
        if (res.ok) setTimeout(() => setNotifyState('idle'), 4000)
    }

    function close() {
        setOpen(false)
        setStep('searching')
        setErrorMsg('')
        setCode('')
    }

    return (
        /*
           `display: contents` rather than a real box: this card is also used on
           the public recruit-session page, which sits outside the dashboard
           shell and so outside `.dash`. Custom properties inherit down the
           element tree whether or not an element generates a box, so this
           carries the tokens in without adding a wrapper that would paint a
           background or disturb the layout it is dropped into.
        */
        <div className={s.dash} style={{ display: 'contents' }}>
            <Panel>
                <PanelHeader
                    title='TeamSpeak'
                    sub={isLinked ? 'Your expected nickname on the server' : undefined}
                    right={isLinked ? <Badge tone='live' dot>Linked</Badge> : <Badge tone='muted' dot>Not linked</Badge>}
                />
                <PanelBody className='flex flex-col gap-3'>
                    {isLinked ? (
                        <>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--txt-1)' }}>
                                {expectedNickname}
                            </div>
                            <div className='flex gap-2 flex-wrap'>
                                <Button
                                    variant={notifyState === 'offline' ? 'danger' : 'subtle'}
                                    size='sm'
                                    disabled={notifyState === 'sending'}
                                    onClick={notify}
                                >
                                    {notifyState === 'sending' ? 'Sending…'
                                        : notifyState === 'sent' ? 'Poke sent'
                                            : notifyState === 'offline' ? 'You are offline'
                                                : 'Poke me the name'}
                                </Button>
                                <Button variant='subtle' size='sm' onClick={startLink}>Change</Button>
                                <Button variant='danger' size='sm' disabled={unlinking} onClick={unlink}>
                                    {unlinking ? 'Removing…' : 'Unlink'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <span className={s.hint}>No TeamSpeak account linked</span>
                            <div>
                                <Button variant='primary' size='sm' onClick={startLink}>Link account</Button>
                            </div>
                        </>
                    )}
                </PanelBody>
            </Panel>

            {open && (
                <div className={s.scrim} onClick={e => { if (e.target === e.currentTarget) close() }}>
                    <div className={s.dialog} role='dialog' aria-modal='true'>
                        <div className={s.dialogH}>
                            <span><span className={s.t}>Link TeamSpeak account</span></span>
                        </div>

                        <div className={s.dialogB}>
                            {step === 'searching' && (
                                <p className={s.hint}>Searching for your account on TeamSpeak…</p>
                            )}

                            {step === 'confirm' && (
                                <p style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.6 }}>
                                    We found <b style={{ color: 'var(--txt-1)' }}>{tsNickname}</b> on TeamSpeak. Is that you?
                                </p>
                            )}

                            {step === 'manual' && (
                                <div className='flex flex-col gap-3'>
                                    <p style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.6 }}>
                                        We couldn&apos;t find you automatically. Pick yourself out of the online
                                        list and we&apos;ll poke you a code.
                                    </p>
                                    {onlineClients.length === 0 ? (
                                        <Badge tone='warn' dot>Nobody is on TeamSpeak right now</Badge>
                                    ) : (
                                        <Select
                                            value={selectedClid}
                                            onChange={e => setSelectedClid(e.target.value)}
                                            aria-label='Your TeamSpeak account'
                                        >
                                            <option value=''>— Select your account —</option>
                                            {[...onlineClients].sort((a, b) => a.nickname.localeCompare(b.nickname)).map(c => (
                                                <option key={c.clid} value={c.clid}>{c.nickname}</option>
                                            ))}
                                        </Select>
                                    )}
                                    {errorMsg && <div className={s.warn}>{errorMsg}</div>}
                                </div>
                            )}

                            {step === 'awaiting-code' && (
                                <div className='flex flex-col gap-3'>
                                    <p style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.6 }}>
                                        A code has been poked to <b style={{ color: 'var(--txt-1)' }}>{tsNickname}</b>. Enter it below.
                                    </p>
                                    <Input
                                        autoFocus
                                        placeholder='e.g. AB12CD'
                                        value={code}
                                        onChange={e => setCode(e.target.value.toUpperCase())}
                                        onKeyDown={e => { if (e.key === 'Enter' && code) verify() }}
                                        aria-label='Verification code'
                                        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.18em', textTransform: 'uppercase' }}
                                    />
                                    {errorMsg && <div className={s.warn}>{errorMsg}</div>}
                                </div>
                            )}

                            {step === 'success' && (
                                <div className='flex flex-col gap-3'>
                                    <Badge tone='live' dot>Account linked</Badge>
                                    <p style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.6 }}>
                                        Your expected nickname is <b style={{ color: 'var(--txt-1)' }}>{expectedNickname}</b>.
                                        Use <b>Poke me the name</b> on the card to get it sent to you in-server.
                                    </p>
                                </div>
                            )}

                            {step === 'error' && <div className={s.warn}>{errorMsg}</div>}
                        </div>

                        <div className={s.dialogF}>
                            {step === 'confirm' && (
                                <>
                                    <Button variant='subtle' onClick={fetchManual}>No, that&apos;s not me</Button>
                                    <Button variant='primary' onClick={sendPoke}>Yes, poke me a code</Button>
                                </>
                            )}
                            {step === 'manual' && (
                                <>
                                    <Button variant='subtle' onClick={close}>Cancel</Button>
                                    <Button variant='primary' disabled={!selectedClid} onClick={sendPoke}>Send code</Button>
                                </>
                            )}
                            {step === 'awaiting-code' && (
                                <>
                                    <Button variant='subtle' onClick={close}>Cancel</Button>
                                    <Button variant='primary' disabled={!code} onClick={verify}>Confirm</Button>
                                </>
                            )}
                            {(step === 'searching' || step === 'success' || step === 'error') && (
                                <Button variant='subtle' onClick={close}>
                                    {step === 'success' ? 'Done' : 'Close'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default TeamSpeakCard
