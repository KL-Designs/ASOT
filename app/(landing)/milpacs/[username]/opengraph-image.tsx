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

    const nameFontSize = name.length > 18 ? 52 : name.length > 14 ? 64 : name.length > 10 ? 78 : 96

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
                background: 'rgb(8,8,8)',
                borderTop: `4px solid ${accent}`,
                borderRadius: 24,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '52px 80px',
                fontFamily: 'sans-serif',
            }}
        >
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `linear-gradient(160deg, ${accent}22 0%, ${accent}0a 45%, transparent 100%)`, display: 'flex' }} />

            {/* Content row */}
            <div style={{ display: 'flex', gap: 64, alignItems: 'center', flex: 1 }}>
                {/* Avatar */}
                <div
                    style={{
                        width: 240,
                        height: 240,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: `4px solid ${accent}80`,
                        display: 'flex',
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarUrl} width={240} height={240} style={{ objectFit: 'cover' }} alt='' />
                </div>

                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
                    {fullRank && (
                        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${accent}cc` }}>
                            {fullRank}
                        </span>
                    )}

                    <span style={{ fontSize: nameFontSize, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.95)', lineHeight: 1 }}>
                        {name}
                    </span>

                    {orbatEntry && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
                            <span style={{
                                padding: '8px 22px',
                                border: `1px solid ${accent}50`,
                                background: `${accent}18`,
                                fontSize: 22,
                                fontWeight: 700,
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                color: `${accent}ee`,
                            }}>
                                {orbatEntry.role}
                            </span>
                            <span style={{
                                padding: '8px 22px',
                                border: '1px solid rgba(237,237,237,0.1)',
                                background: 'rgba(237,237,237,0.04)',
                                fontSize: 22,
                                fontWeight: 600,
                                letterSpacing: '0.14em',
                                textTransform: 'uppercase',
                                color: 'rgba(237,237,237,0.4)',
                            }}>
                                {orbatEntry.section}
                            </span>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: 26, color: 'rgba(237,237,237,0.25)', letterSpacing: '0.12em' }}>
                            @{member.username}
                        </span>
                        {enlistedDate && (
                            <span style={{ fontSize: 22, color: 'rgba(237,237,237,0.15)', letterSpacing: '0.1em' }}>
                                Enlisted {enlistedDate}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 32 }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: `${accent}60` }} />
                <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.15)' }}>
                    Australian Special Operations Task Force
                </span>
            </div>
        </div>,
        { ...size }
    )
}
