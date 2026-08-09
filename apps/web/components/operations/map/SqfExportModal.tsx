'use client'

import { useState, useEffect } from 'react'

interface Props {
    code: string
    onClose: () => void
}

export default function SqfExportModal({ code, onClose }: Props) {
    const [copied, setCopied] = useState(false)

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.72)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#111',
                    border: '1px solid rgba(251,191,36,0.25)',
                    borderRadius: 8,
                    width: 680,
                    maxWidth: 'calc(100vw - 40px)',
                    maxHeight: 'calc(100vh - 80px)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: '#fbbf24', textTransform: 'uppercase' }}>
                        Export — SQF
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        Paste this script into the Arma 3 debug console or a mission init.sqf.
                    </div>
                </div>

                {/* Code block */}
                <pre style={{
                    flex: 1,
                    margin: 12,
                    padding: '12px 14px',
                    background: '#0a0a0a',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 4,
                    fontFamily: '"Consolas", "Courier New", monospace',
                    fontSize: 11.5,
                    lineHeight: 1.65,
                    color: '#a3e635',
                    overflowY: 'auto',
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                    minHeight: 0,
                }}>
                    {code}
                </pre>

                {/* Footer */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 8,
                    padding: '10px 16px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.7)',
                            borderRadius: 5,
                            padding: '6px 18px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                        }}
                    >
                        Close
                    </button>
                    <button
                        onClick={handleCopy}
                        style={{
                            background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.15)',
                            border: `1px solid ${copied ? 'rgba(34,197,94,0.5)' : 'rgba(251,191,36,0.4)'}`,
                            color: copied ? '#4ade80' : '#fbbf24',
                            borderRadius: 5,
                            padding: '6px 18px',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            transition: 'all 0.15s',
                        }}
                    >
                        {copied ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                </div>
            </div>
        </div>
    )
}
