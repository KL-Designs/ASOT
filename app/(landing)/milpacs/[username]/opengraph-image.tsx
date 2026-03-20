import { ImageResponse } from 'next/og'
import client from '@/lib/discord'
import { fetchORBAT, findOrbatEntry } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/milpac-profile'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params

    const [allMembers, orbat] = await Promise.all([client.fetchAllMembers(), fetchORBAT()])
    const member = allMembers.find(m => m.username === username)

    if (!member) {
        return new ImageResponse(
            <div style={{ width: '100%', height: '100%', background: 'rgb(10,10,10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(237,237,237,0.3)', fontSize: 32, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Member Not Found
                </span>
            </div>,
            { ...size }
        )
    }

    const lookup = client.buildOrbatLookup(allMembers)
    const orbatEntry = findOrbatEntry(orbat, lookup, member.id)

    const { accent, name, fullRank } = resolveMilpacProfile(member, orbatEntry)

    const enlistedDate = member.milpac?.enlistedDate
        || (member.guild?.joinedTimestamp ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

    const avatarUrl = member.avatar
        ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/0.png`

    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                background: 'rgb(10,10,10)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '60px 80px',
                fontFamily: 'sans-serif',
            }}
        >
            {/* Top accent line */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: accent }} />

            {/* Card */}
            <div
                style={{
                    display: 'flex',
                    gap: 48,
                    alignItems: 'center',
                    padding: '48px 56px',
                    borderRadius: 16,
                    border: `1px solid ${accent}30`,
                    borderTop: `3px solid ${accent}`,
                    background: `linear-gradient(160deg, ${accent}12 0%, ${accent}04 40%, transparent 100%)`,
                }}
            >
                {/* Avatar */}
                <div
                    style={{
                        width: 160,
                        height: 160,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: `3px solid ${accent}80`,
                        display: 'flex',
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarUrl} width={160} height={160} style={{ objectFit: 'cover' }} alt='' />
                </div>

                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                    {fullRank && (
                        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${accent}cc` }}>
                            {fullRank}
                        </span>
                    )}

                    <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.95)', lineHeight: 1 }}>
                        {name}
                    </span>

                    {orbatEntry && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                            <span style={{
                                padding: '6px 18px',
                                border: `1px solid ${accent}50`,
                                background: `${accent}18`,
                                fontSize: 18,
                                fontWeight: 700,
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                color: `${accent}ee`,
                            }}>
                                {orbatEntry.role}
                            </span>
                            <span style={{
                                padding: '6px 18px',
                                border: '1px solid rgba(237,237,237,0.1)',
                                background: 'rgba(237,237,237,0.04)',
                                fontSize: 18,
                                fontWeight: 600,
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                color: 'rgba(237,237,237,0.4)',
                            }}>
                                {orbatEntry.section}
                            </span>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: 20, color: 'rgba(237,237,237,0.25)', letterSpacing: '0.12em' }}>
                            @{member.username}
                        </span>
                        {enlistedDate && (
                            <span style={{ fontSize: 16, color: 'rgba(237,237,237,0.15)', letterSpacing: '0.1em' }}>
                                Enlisted {enlistedDate}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{ position: 'absolute', bottom: 32, right: 80, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: `${accent}60` }} />
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.15)' }}>
                    Australian Special Operations Task Force
                </span>
            </div>
        </div>,
        { ...size }
    )
}
