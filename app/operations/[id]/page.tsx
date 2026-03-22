import Db from '@/lib/mongo'
import dayjs from 'dayjs'
import Link from 'next/link'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import DocBody from './doc-body'


export default async function Page({ params }: { params: { id: string } }) {
    const { id } = params
    await connection()

    const operation = await Db.operations.findOne({ _id: new ObjectId(id) })
    if (!operation) return (
        <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Operation not found
        </div>
    )

    return (
        <div className='flex flex-col min-h-full'>

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <div style={{ position: 'relative', overflow: 'hidden', paddingBottom: 1 }}>

                {/* Tactical grid background */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    backgroundImage: 'linear-gradient(rgba(219,0,29,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(219,0,29,0.045) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                }} />

                {/* Radial red glow */}
                <div style={{
                    position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
                    width: '80%', height: '200%',
                    background: 'radial-gradient(ellipse at 50% 40%, rgba(219,0,29,0.18) 0%, rgba(219,0,29,0.06) 35%, transparent 70%)',
                    zIndex: 0, pointerEvents: 'none',
                }} />

                {/* Corner scan-line accents */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: 80, height: 80, zIndex: 1, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 40, height: 2, background: 'var(--red)', opacity: 0.7 }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: 40, background: 'var(--red)', opacity: 0.7 }} />
                </div>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, zIndex: 1, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 40, height: 2, background: 'var(--red)', opacity: 0.7 }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 2, height: 40, background: 'var(--red)', opacity: 0.7 }} />
                </div>

                <div className='flex flex-col items-center px-8 pt-16 pb-20 text-center' style={{ position: 'relative', zIndex: 2, maxWidth: 960, margin: '0 auto', width: '100%' }}>

                    {/* Back nav */}
                    <Link
                        href='/operations'
                        style={{ position: 'absolute', top: 20, left: 0, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)', textDecoration: 'none' }}
                    >
                        ← Operations
                    </Link>

                    {/* Department badge */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1px solid rgba(219,0,29,0.35)', padding: '4px 16px', marginBottom: 28, background: 'rgba(219,0,29,0.06)' }}>
                        <span style={{ width: 4, height: 4, background: 'var(--red)', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.85)' }}>
                            {operation.department || 'Joint Operation'}
                        </span>
                        <span style={{ width: 4, height: 4, background: 'var(--red)', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                    </div>

                    {/* Operation title */}
                    <h1 style={{
                        fontSize: 'clamp(2rem, 6vw, 3.8rem)',
                        fontWeight: 900,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        margin: '0 0 8px',
                        lineHeight: 1.08,
                        background: 'linear-gradient(175deg, #ffffff 20%, rgba(237,237,237,0.55) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        filter: 'drop-shadow(0 0 28px rgba(219,0,29,0.55)) drop-shadow(0 0 8px rgba(219,0,29,0.3))',
                        textAlign: 'center'
                    }}>
                        {operation.title}
                    </h1>

                    {/* Decorative rule */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 480, margin: '20px auto 28px' }}>
                        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(219,0,29,0.4))' }} />
                        <div style={{ width: 5, height: 5, border: '1px solid rgba(219,0,29,0.6)', transform: 'rotate(45deg)', flexShrink: 0 }} />
                        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(219,0,29,0.4))' }} />
                    </div>

                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px', borderRight: operation.loreDate ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>Operation Date</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.8)' }}>
                                {dayjs(operation.date).format('DD MMM YYYY — HH:mm').toUpperCase()}
                            </span>
                        </div>
                        {operation.loreDate && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px' }}>
                                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>In-Game Date</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.8)' }}>
                                    {dayjs(operation.loreDate).format('DD HHmm MMM YY').toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>

                </div>

                {/* Bottom fade into page background */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(to bottom, transparent, var(--background))', zIndex: 3, pointerEvents: 'none' }} />
            </div>

            {/* ── Orders / Document body ────────────────────────────────────── */}
            <div className='w-full max-w-[900px] mx-auto px-6 md:px-10 pb-16 flex flex-col gap-0' style={{ marginTop: -1 }}>

                {/* "Orders" section label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0 }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.18)' }}>
                        Orders
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                </div>

                <DocBody content={operation.content ?? null} />
            </div>

        </div>
    )
}
