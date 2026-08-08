'use client'

interface Props {
    open: boolean
    title: string
    message?: string
    confirmLabel?: string
    danger?: boolean
    restore?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({ open, title, message, confirmLabel, danger, restore, onConfirm, onCancel }: Props) {
    if (!open) return null

    const defaultLabel = restore ? 'Restore' : danger ? 'Delete' : 'Confirm'
    const label = confirmLabel ?? defaultLabel

    // Confirm button: red for danger, green for restore, neutral otherwise
    const confirmColor = danger ? 'rgba(219,0,29,0.9)' : restore ? 'rgba(16,185,129,0.9)' : 'rgba(237,237,237,0.8)'
    const confirmBorder = danger ? 'rgba(219,0,29,0.5)' : restore ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.2)'
    const confirmBg = danger ? 'rgba(219,0,29,0.1)' : restore ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.06)'
    const confirmHover = danger ? 'rgba(219,0,29,0.22)' : restore ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.12)'

    const topBorder = danger ? 'rgba(219,0,29,0.8)' : restore ? 'rgba(16,185,129,0.7)' : 'rgba(255,255,255,0.35)'
    const sideBorder = danger ? 'rgba(219,0,29,0.25)' : restore ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)'

    return (
        <div
            onClick={onCancel}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(3px)',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'rgba(12,12,12,0.98)',
                    border: `1px solid ${sideBorder}`,
                    borderTop: `2px solid ${topBorder}`,
                    padding: '28px 32px',
                    minWidth: 340,
                    maxWidth: 460,
                    display: 'flex', flexDirection: 'column', gap: 20,
                    boxShadow: danger
                        ? '0 8px 48px rgba(219,0,29,0.15), 0 2px 16px rgba(0,0,0,0.8)'
                        : '0 8px 48px rgba(0,0,0,0.6)',
                }}
            >
                {/* Title */}
                <span style={{
                    fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)',
                }}>
                    {title}
                </span>

                {/* Message */}
                {message && (
                    <span style={{
                        fontSize: '0.78rem', letterSpacing: '0.03em', lineHeight: 1.6,
                        color: 'rgba(237,237,237,0.45)',
                    }}>
                        {message}
                    </span>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    {/* Cancel — always blue/neutral */}
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 20px',
                            background: 'transparent',
                            border: '1px solid rgba(100,150,237,0.3)',
                            color: 'rgba(100,150,237,0.65)',
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                            cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.color = 'rgba(100,150,237,0.95)'; el.style.borderColor = 'rgba(100,150,237,0.6)'; el.style.background = 'rgba(100,150,237,0.08)' }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.color = 'rgba(100,150,237,0.65)'; el.style.borderColor = 'rgba(100,150,237,0.3)'; el.style.background = 'transparent' }}
                    >
                        Cancel
                    </button>
                    {/* Confirm — red/green/neutral depending on variant */}
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '8px 20px',
                            background: confirmBg,
                            border: `1px solid ${confirmBorder}`,
                            color: confirmColor,
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                            cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.background = confirmHover }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.background = confirmBg }}
                    >
                        {label}
                    </button>
                </div>
            </div>
        </div>
    )
}
