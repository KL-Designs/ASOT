import { connection } from 'next/server'
import type { Metadata } from 'next'
import Image from 'next/image'
import { Typography } from '@mui/material'

import Container from '@/components/container'
import { getCreditsData } from '@/lib/credits'

import BannerImg from '@/public/images/home/3DMA_Final2.png'


export const metadata: Metadata = {
    title: 'Credits | ASOT',
    description: 'The people who built the ASOT platform.',
}


export default async function Page() {
    await connection()

    const { contributors, thanks } = await getCreditsData()

    return (
        <Container
            title='CREDITS'
            kicker='Colophon'
            subtitle='The people who built this platform'
            background={BannerImg}
            sx={{ bannerHeight: 'sm', maxWidth: 'max-w-[1240px]', gap: 'gap-14', padding: '3rem 2rem' }}
        >

            {/* Intro */}
            <div className='flex flex-col items-center gap-5 text-center' style={{ maxWidth: 560, margin: '0 auto' }}>
                <div className='flex items-center gap-3 w-full'>
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                    <div style={{ width: 40, height: 2, background: 'var(--red)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                </div>
                <Typography style={{ fontSize: '0.82rem', lineHeight: 1.9, color: 'rgba(237,237,237,0.45)', letterSpacing: '0.05em' }}>
                    The ASOT platform was built by members of the community who volunteered their time,
                    skills, and expertise. These are the people who made it possible.
                </Typography>
                <div className='flex items-center gap-3 w-full'>
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                    <div style={{ width: 40, height: 2, background: 'var(--red)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                </div>
            </div>

            {/* Contributor cards */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                {contributors.map((c, index) => (
                    <div
                        key={c.id}
                        className='flex flex-col overflow-hidden relative'
                        style={{
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderTop: `3px solid ${c.accent}`,
                            background: '#0c0c0c',
                        }}
                    >
                        {/* Faint index number watermark */}
                        <div
                            aria-hidden
                            style={{
                                position: 'absolute',
                                top: '50%',
                                right: '-0.05em',
                                transform: 'translateY(-50%)',
                                fontSize: '14rem',
                                fontWeight: 900,
                                color: 'rgba(237,237,237,0.025)',
                                lineHeight: 1,
                                fontFamily: 'Montserrat, sans-serif',
                                letterSpacing: '-0.05em',
                                pointerEvents: 'none',
                                userSelect: 'none',
                                zIndex: 0,
                            }}
                        >
                            {String(index + 1).padStart(2, '0')}
                        </div>

                        {/* Top — avatar section */}
                        <div
                            className='relative z-10 flex flex-col items-center gap-4 px-6 pt-8 pb-6'
                            style={{
                                background: `radial-gradient(ellipse at 50% 0%, ${c.accent}14 0%, transparent 65%)`,
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                            }}
                        >
                            {/* Avatar */}
                            <div className='relative shrink-0' style={{ width: 96, height: 96 }}>
                                <Image
                                    src={c.avatarURL}
                                    alt={c.name}
                                    fill
                                    className='rounded-full object-cover'
                                    style={{
                                        outline: `3px solid ${c.accent}66`,
                                        outlineOffset: 4,
                                        boxShadow: `0 0 28px ${c.accent}28`,
                                    }}
                                />
                            </div>

                            {/* Name block */}
                            <div className='flex flex-col items-center gap-1 text-center'>
                                {c.rankAbbr && (
                                    <div style={{
                                        fontSize: '0.63rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.24em',
                                        color: c.accent,
                                        textTransform: 'uppercase',
                                    }}>
                                        {c.rankAbbr}
                                    </div>
                                )}
                                <h3 style={{
                                    fontSize: 'clamp(1.3rem, 3vw, 1.6rem)',
                                    fontWeight: 800,
                                    letterSpacing: '0.06em',
                                    margin: 0,
                                    textTransform: 'uppercase',
                                    color: 'rgba(237,237,237,0.95)',
                                    lineHeight: 1.15,
                                }}>
                                    {c.name}
                                </h3>
                                {c.fullRank && c.fullRank !== c.rankAbbr && (
                                    <div style={{
                                        fontSize: '0.66rem',
                                        letterSpacing: '0.14em',
                                        color: 'rgba(237,237,237,0.28)',
                                        textTransform: 'uppercase',
                                    }}>
                                        {c.fullRank}
                                    </div>
                                )}
                            </div>

                            {/* ORBAT entry */}
                            {c.orbatRole && (
                                <div className='flex flex-col items-center gap-[5px] text-center w-full'>
                                    <div style={{ height: 1, width: 36, background: `${c.accent}50`, marginBottom: 2 }} />
                                    <div style={{
                                        fontSize: '0.63rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.2em',
                                        color: `${c.accent}cc`,
                                        textTransform: 'uppercase',
                                    }}>
                                        {c.orbatRole}
                                    </div>
                                    {c.orbatSection && (
                                        <div style={{
                                            fontSize: '0.6rem',
                                            letterSpacing: '0.12em',
                                            color: 'rgba(237,237,237,0.2)',
                                            textTransform: 'uppercase',
                                        }}>
                                            {c.orbatSection}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Bottom — contribution */}
                        <div className='relative z-10 flex flex-col gap-3 p-5 flex-1'>
                            <div>
                                <div style={{
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.24em',
                                    color: 'rgba(219,0,29,0.6)',
                                    textTransform: 'uppercase',
                                    marginBottom: 4,
                                }}>
                                    Contribution
                                </div>
                                <div style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.14em',
                                    color: c.accent,
                                    textTransform: 'uppercase',
                                    marginBottom: 10,
                                }}>
                                    {c.title}
                                </div>
                                <p style={{
                                    fontSize: '0.78rem',
                                    lineHeight: 1.8,
                                    color: 'rgba(237,237,237,0.45)',
                                    margin: 0,
                                }}>
                                    {c.description}
                                </p>
                            </div>

                            {/* Milpac stats */}
                            {(c.promoCount > 0 || c.awardsCount > 0 || c.qualCount > 0) && (
                                <div
                                    className='flex gap-5 mt-auto pt-4'
                                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                                >
                                    {c.promoCount > 0 && (
                                        <div className='flex flex-col gap-[2px]'>
                                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', lineHeight: 1 }}>
                                                {c.promoCount}
                                            </span>
                                            <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.22)', textTransform: 'uppercase' }}>
                                                Promotions
                                            </span>
                                        </div>
                                    )}
                                    {c.awardsCount > 0 && (
                                        <div className='flex flex-col gap-[2px]'>
                                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', lineHeight: 1 }}>
                                                {c.awardsCount}
                                            </span>
                                            <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.22)', textTransform: 'uppercase' }}>
                                                Awards
                                            </span>
                                        </div>
                                    )}
                                    {c.qualCount > 0 && (
                                        <div className='flex flex-col gap-[2px]'>
                                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', lineHeight: 1 }}>
                                                {c.qualCount}
                                            </span>
                                            <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.22)', textTransform: 'uppercase' }}>
                                                Quals
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Special Thanks */}
            <div className='flex flex-col gap-6'>
                <div className='flex flex-col items-center gap-3 text-center'>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(219,0,29,0.5)', textTransform: 'uppercase' }}>
                        Honourable Mentions
                    </div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0, color: 'rgba(237,237,237,0.6)' }}>
                        Special Thanks
                    </h2>
                    <div style={{ height: 1, width: 60, background: 'rgba(219,0,29,0.2)' }} />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    {thanks.map(t => (
                        <div
                            key={t.id}
                            className='flex items-start gap-4 p-4'
                            style={{
                                border: '1px solid rgba(255,255,255,0.05)',
                                borderLeft: `2px solid ${t.accent}60`,
                                background: 'rgba(255,255,255,0.01)',
                            }}
                        >
                            <div className='relative shrink-0' style={{ width: 44, height: 44 }}>
                                <Image
                                    src={t.avatarURL}
                                    alt={t.name}
                                    fill
                                    className='rounded-full object-cover'
                                    style={{ outline: `2px solid ${t.accent}44`, outlineOffset: 2 }}
                                />
                            </div>
                            <div className='flex flex-col gap-1 min-w-0'>
                                <div className='flex items-baseline gap-2 flex-wrap'>
                                    {t.rankAbbr && (
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', color: t.accent, textTransform: 'uppercase' }}>
                                            {t.rankAbbr}
                                        </span>
                                    )}
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.8)' }}>
                                        {t.name}
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.72rem', lineHeight: 1.7, color: 'rgba(237,237,237,0.38)', margin: 0 }}>
                                    {t.reason}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Built-with footer note */}
            <div className='flex flex-col items-center gap-5 text-center'>
                <div style={{ height: 1, width: 60, background: 'rgba(219,0,29,0.2)', margin: '0 auto' }} />

                <div className='flex flex-col items-center gap-4 w-full'>
                    {/* Stack */}
                    <div className='flex flex-col items-center gap-2'>
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(237,237,237,0.12)', textTransform: 'uppercase' }}>
                            Stack
                        </span>
                        <div className='flex flex-wrap justify-center gap-2'>
                            {['Next.js 15', 'React 19', 'TypeScript', 'MongoDB', 'Tailwind CSS', 'Material UI', 'Discord OAuth'].map(item => (
                                <span key={item} style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 600,
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    color: 'rgba(237,237,237,0.2)',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    padding: '3px 10px',
                                }}>
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div style={{ height: 1, width: 40, background: 'rgba(255,255,255,0.05)' }} />

                    {/* Custom systems */}
                    <div className='flex flex-col items-center gap-2'>
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(237,237,237,0.12)', textTransform: 'uppercase' }}>
                            Systems
                        </span>
                        <div className='flex flex-wrap justify-center gap-2'>
                            {[
                                'MILPAC Pipeline',
                                'ORBAT System',
                                'Operations Board',
                                'Collaborative Briefing',
                                'Interactive Maps',
                                'Certificate Generator',
                                'TeamSpeak Integration',
                                'Real-time Sync',
                                'Gallery & SotM',
                            ].map(item => (
                                <span key={item} style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 600,
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    color: 'rgba(237,237,237,0.15)',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    padding: '3px 10px',
                                }}>
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

        </Container>
    )
}
