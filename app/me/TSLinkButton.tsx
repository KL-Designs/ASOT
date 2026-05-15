'use client'

import { useState } from 'react'
import { Typography } from '@mui/material'

interface Props {
    linked: { cldbid: number; linkedAt: number } | null
    expectedNickname: string
    onLinked?: () => void
}

type Step = 'searching' | 'confirm' | 'manual' | 'awaiting-code' | 'success' | 'error'

interface OnlineClient { clid: string; nickname: string }

export default function TSLinkButton({ linked, expectedNickname, onLinked }: Props) {
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

    const btnBase: React.CSSProperties = {
        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', border: 'none', cursor: 'pointer', padding: '6px 14px',
    }
    const blueBtn: React.CSSProperties = {
        ...btnBase, color: 'rgba(0,130,220,0.9)', background: 'rgba(0,130,220,0.08)',
        border: '1px solid rgba(0,130,220,0.25)',
    }
    const ghostBtn: React.CSSProperties = {
        ...btnBase, color: 'rgba(237,237,237,0.35)', background: 'none',
        border: '1px solid rgba(255,255,255,0.08)',
    }

    return (
        <>
            {/* Card */}
            <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)' }}>
                <div className='flex items-center px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                        TeamSpeak
                    </Typography>
                    {isLinked && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(0,200,100,0.8)', background: 'rgba(0,200,100,0.08)', border: '1px solid rgba(0,200,100,0.2)', padding: '2px 8px' }}>
                            Linked
                        </span>
                    )}
                </div>

                <div className='flex items-center gap-3 px-4 py-3'>
                    {isLinked ? (
                        <>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{expectedNickname}</div>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                    Expected TS nickname
                                </div>
                            </div>

                            {/* Notify button */}
                            <button
                                onClick={notify}
                                disabled={notifyState === 'sending'}
                                style={{
                                    ...btnBase,
                                    color: notifyState === 'sent' ? 'rgba(0,200,100,0.8)' : notifyState === 'offline' ? 'rgba(219,80,80,0.8)' : 'rgba(0,130,220,0.7)',
                                    background: 'rgba(0,130,220,0.06)',
                                    border: '1px solid rgba(0,130,220,0.2)',
                                    cursor: notifyState === 'sending' ? 'default' : 'pointer',
                                }}
                            >
                                {notifyState === 'sending' ? 'Sending…' : notifyState === 'sent' ? 'Sent ✓' : notifyState === 'offline' ? 'Offline' : 'Remind Me'}
                            </button>

                            <button onClick={startLink} style={{ ...blueBtn }}>Change</button>
                            <button
                                onClick={unlink}
                                disabled={unlinking}
                                style={{ ...btnBase, color: 'rgba(219,0,29,0.6)', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.15)', cursor: unlinking ? 'default' : 'pointer' }}
                            >
                                {unlinking ? 'Removing…' : 'Unlink'}
                            </button>
                        </>
                    ) : (
                        <>
                            <div style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>
                                No TeamSpeak account linked
                            </div>
                            <button onClick={startLink} style={blueBtn}>Link Account</button>
                        </>
                    )}
                </div>
            </div>

            {/* Modal */}
            {open && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) close() }}
                >
                    <div style={{ width: '100%', maxWidth: 480, background: 'rgb(18,18,20)', border: '1px solid rgba(255,255,255,0.07)', borderTop: '2px solid rgba(0,130,220,0.6)' }}>
                        {/* Header */}
                        <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,130,220,0.7)' }}>
                                Link TeamSpeak Account
                            </span>
                            <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.3)', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
                        </div>

                        <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* Searching */}
                            {step === 'searching' && (
                                <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.4)' }}>
                                    Searching for your account on TeamSpeak…
                                </div>
                            )}

                            {/* Confirm auto-found identity */}
                            {step === 'confirm' && (
                                <>
                                    <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)', lineHeight: 1.6 }}>
                                        We found <strong style={{ color: 'rgba(237,237,237,0.95)' }}>{tsNickname}</strong> on TeamSpeak. Is this you?
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                        <button onClick={fetchManual} style={ghostBtn}>No</button>
                                        <button onClick={sendPoke} style={blueBtn}>Yes</button>
                                    </div>
                                </>
                            )}

                            {/* Manual selection */}
                            {step === 'manual' && (
                                <>
                                    <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                                        We couldn't find your account automatically. Select yourself from the list of online users and we'll send you a code via poke.
                                    </div>
                                    {onlineClients.length === 0 ? (
                                        <div style={{ fontSize: '0.78rem', color: 'rgba(219,80,80,0.8)', fontStyle: 'italic' }}>
                                            No users currently online on TeamSpeak.
                                        </div>
                                    ) : (
                                        <select
                                            value={selectedClid}
                                            onChange={e => setSelectedClid(e.target.value)}
                                            style={{
                                                width: '100%', background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.9)',
                                                padding: '7px 10px', fontSize: '0.82rem', outline: 'none',
                                            }}
                                        >
                                            <option value=''>— Select your account —</option>
                                            {onlineClients.sort((a, b) => a.nickname.localeCompare(b.nickname)).map(c => (
                                                <option key={c.clid} value={c.clid}>{c.nickname}</option>
                                            ))}
                                        </select>
                                    )}
                                    {errorMsg && <ErrorBox msg={errorMsg} />}
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                        <button onClick={close} style={ghostBtn}>Cancel</button>
                                        <button
                                            onClick={sendPoke}
                                            disabled={!selectedClid}
                                            style={{ ...blueBtn, opacity: selectedClid ? 1 : 0.4, cursor: selectedClid ? 'pointer' : 'default' }}
                                        >
                                            Send Code
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Awaiting code after manual poke */}
                            {step === 'awaiting-code' && (
                                <>
                                    <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)', lineHeight: 1.6 }}>
                                        A code has been sent to <strong style={{ color: 'rgba(237,237,237,0.95)' }}>{tsNickname}</strong> via poke. Enter it below.
                                    </div>
                                    <CodeEntry code={code} setCode={setCode} error={errorMsg} onVerify={verify} onCancel={close} />
                                </>
                            )}

                            {/* Success */}
                            {step === 'success' && (
                                <>
                                    <div style={{ fontSize: '0.85rem', color: 'rgba(0,200,100,0.9)', fontWeight: 600 }}>
                                        Account linked successfully.
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.6 }}>
                                        Your expected nickname is <strong style={{ color: 'rgba(237,237,237,0.8)' }}>{expectedNickname}</strong>. Use the <em>Remind Me</em> button to receive a poke on TeamSpeak.
                                    </div>
                                    <button onClick={close} style={{ ...blueBtn, alignSelf: 'flex-end' }}>Done</button>
                                </>
                            )}

                            {/* Error */}
                            {step === 'error' && (
                                <>
                                    <ErrorBox msg={errorMsg} />
                                    <button onClick={close} style={{ ...ghostBtn, alignSelf: 'flex-end' }}>Close</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function CodeEntry({ code, setCode, error, onVerify, onCancel }: {
    code: string
    setCode: (v: string) => void
    error: string
    onVerify: () => void
    onCancel: () => void
}) {
    const btnBase: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', padding: '6px 14px' }
    return (
        <>
            <input
                autoFocus
                placeholder='Enter code (e.g. AB12CD)'
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && code && onVerify()}
                style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.9)',
                    padding: '9px 12px', fontSize: '1rem', fontFamily: 'monospace',
                    letterSpacing: '0.15em', outline: 'none', textTransform: 'uppercase',
                }}
            />
            {error && <ErrorBox msg={error} />}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={onCancel} style={{ ...btnBase, color: 'rgba(237,237,237,0.35)', background: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>Cancel</button>
                <button
                    onClick={onVerify}
                    disabled={!code}
                    style={{ ...btnBase, color: code ? 'rgba(0,130,220,0.9)' : 'rgba(0,130,220,0.3)', background: 'rgba(0,130,220,0.08)', border: '1px solid rgba(0,130,220,0.25)', cursor: code ? 'pointer' : 'default' }}
                >
                    Confirm
                </button>
            </div>
        </>
    )
}

function ErrorBox({ msg }: { msg: string }) {
    return (
        <div style={{ fontSize: '0.78rem', color: 'rgba(219,80,80,0.9)', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.2)', padding: '8px 12px' }}>
            {msg}
        </div>
    )
}
