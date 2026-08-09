'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DevTestApplicationButton() {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<string | null>(null)
    const router = useRouter()

    async function handleCreate() {
        setLoading(true)
        setResult(null)
        try {
            const res = await fetch('/api/dev/test-application', { method: 'POST' })
            const data = await res.json()
            if (data.ok) {
                setResult(`Created: ${data.inGameName}`)
                setTimeout(() => router.push(`/dashboard/j1?tab=1&app=${data.id}`), 800)
            } else {
                setResult(data.error ?? 'Failed')
            }
        } catch {
            setResult('Request failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            marginTop: 24,
            padding: '12px 16px',
            border: '1px dashed rgba(245,158,11,0.4)',
            background: 'rgba(245,158,11,0.04)',
        }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(245,158,11,0.6)', marginBottom: 8 }}>
                Dev Tools
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                    onClick={handleCreate}
                    disabled={loading}
                    style={{
                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', padding: '7px 18px', cursor: loading ? 'default' : 'pointer',
                        background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)',
                        color: '#f59e0b', opacity: loading ? 0.6 : 1,
                    }}
                >
                    {loading ? 'Creating…' : '⚡ Create Test Application'}
                </button>
                {result && (
                    <span style={{ fontSize: '0.75rem', color: result.startsWith('Created') ? '#00c364' : 'var(--red)' }}>
                        {result} — redirecting to J1…
                    </span>
                )}
            </div>
        </div>
    )
}
