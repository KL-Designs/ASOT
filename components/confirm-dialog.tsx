'use client'

interface Props {
    open: boolean
    title: string
    message?: string
    confirmLabel?: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: Props) {
    if (!open) return null

    const accentColor = danger ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.75)'
    const accentBorder = danger ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.2)'
    const accentBg = danger ? 'rgba(219,0,29,0.1)' : 'rgba(255,255,255,0.06)'
    const accentHover = danger ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.1)'

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
                    border: `1px solid ${danger ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.1)'}`,
                    borderTop: `2px solid ${danger ? 'rgba(219,0,29,0.8)' : 'rgba(255,255,255,0.35)'}`,
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
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 20px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'rgba(237,237,237,0.4)',
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                            cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.color = 'rgba(237,237,237,0.75)'; el.style.borderColor = 'rgba(255,255,255,0.25)'; el.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.color = 'rgba(237,237,237,0.4)'; el.style.borderColor = 'rgba(255,255,255,0.12)'; el.style.background = 'transparent' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '8px 20px',
                            background: accentBg,
                            border: `1px solid ${accentBorder}`,
                            color: accentColor,
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                            cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.background = accentHover }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.background = accentBg }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
