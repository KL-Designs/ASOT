import { ImageResponse } from 'next/og'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'
import { deriveStatus, platoonLabel } from '@/lib/military/milpac-status'
import { ensureVisible } from '@/lib/discord/color'
import { defaultAvatarURL } from '@/lib/discord/avatar'
import { readCoverImage } from '@/lib/military/milpac-cover'
import { resolveSegment } from '@/lib/military/milpac-slug'

export const size = { width: 1300, height: 630 }
export const contentType = 'image/png'

/**
 * The share card, in the same personnel-file language as the profile itself.
 *
 * Everything is inline style because this renders through satori, not a browser:
 * no stylesheet, no CSS custom properties, no film grain (satori has no
 * repeating-linear-gradient). The accent is threaded through by hand instead,
 * and passed through ensureVisible() so a near-black Discord accent does not
 * vanish into the card.
 *
 * A member who has uploaded a cover photo gets it as the card's ground, under a
 * scrim; everyone else gets the drawn ridgeline, the same fallback the profile
 * page makes. The two are never stacked — a photograph and a drawn dusk fighting
 * over the same 1300x630 is mud.
 */
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params

    // The same resolver the page uses, so a name-slug URL and a username URL
    // produce the same card rather than this route 404-ing on the pretty form.
    const allMembers = await client.fetchAllMembers()
    const member = resolveSegment(username, allMembers)?.member

    if (!member) {
        return new ImageResponse(
            <div style={{ width: '100%', height: '100%', background: '#08090a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#6b7480', fontSize: 30, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                    No personnel file
                </span>
            </div>,
            { ...size }
        )
    }

    const orbatEntry = await getOrbatEntryByUserId(member.id)
    const { accent: rawAccent, name, fullRank } = resolveMilpacProfile(member, orbatEntry)
    const accent = ensureVisible(rawAccent)

    const status  = deriveStatus(Boolean(member.discharged), orbatEntry?.category)
    const platoon = platoonLabel(orbatEntry?.category)

    const attendance = await Db.operationAttendance.countDocuments({
        records: { $elemMatch: { userId: member.id, confirmed: true } },
    }).catch(() => 0)

    const awards = member.milpac?.awards?.length ?? 0
    const quals  = member.milpac?.qualifications?.length ?? 0

    // Enlisted year alone: a full date earns no room at this size.
    const enlisted = member.milpac?.enlistedDate?.match(/\d{4}/)?.[0]
        ?? (member.guild?.joinedTimestamp ? String(new Date(member.guild.joinedTimestamp).getFullYear()) : '—')

    // Never throws and returns null when there is no cover, so the drawn card
    // below stays the guaranteed floor for this route.
    const cover = await readCoverImage(member.id)

    const avatarUrl = member.avatar
        ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.${member.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
        : defaultAvatarURL(member.id)

    const nameSize = name.length > 20 ? 62 : name.length > 15 ? 76 : name.length > 10 ? 92 : 106
    const meta = [platoon, orbatEntry?.section, orbatEntry?.role].filter(Boolean).join('  ·  ')

    const LABEL = {
        fontSize: 17,
        letterSpacing: '0.22em',
        textTransform: 'uppercase' as const,
        color: '#6b7480',
        fontWeight: 600,
    }

    const stats: [string, string, boolean][] = [
        [String(attendance), 'Operations', true],
        [enlisted, 'Enlisted', true],
        [String(awards), 'Awards', false],
        [String(quals), 'Qualifications', false],
    ]

    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                background: '#08090a',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'sans-serif',
                position: 'relative',
            }}
        >
            {cover && (
                <>
                    {/* Already cropped and re-encoded to exactly 1300x630, so it
                        needs no objectFit — satori's support for that is thin. */}
                    <img src={cover} width={1300} height={630} style={{ position: 'absolute', top: 0, left: 0 }} />

                    {/* Three scrims, each with its own job, because one flat wash
                        heavy enough for the stat strip would drown the photo
                        entirely. A share card is read at thumbnail size in a
                        Discord embed — the type has to win. */}

                    {/* Base wash: the floor of contrast, whatever was uploaded.
                        Tuned against a bright daylight photo rather than a dark
                        one — a fixed scrim cannot flatter both, and only one of
                        the two can make the type unreadable. */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: 1300, height: 630,
                        background: '#08090aad', display: 'flex',
                    }} />

                    {/* Vertical: lifts off the middle so the photo shows through
                        behind the name, and sinks hard into the stat strip. */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: 1300, height: 630,
                        background: 'linear-gradient(180deg, #08090a47 0%, #08090a1f 40%, #08090ad1 100%)',
                        display: 'flex',
                    }} />

                    {/* Horizontal: the rank, name and unit line are all flush
                        left, and this is what they sit against. */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: 1300, height: 630,
                        background: 'linear-gradient(90deg, #08090acc 0%, #08090a4d 45%, #08090a00 72%)',
                        display: 'flex',
                    }} />
                </>
            )}

            {/* A single low sun in the accent, echoing the profile's banner. The
                only colour on the card besides the accent itself. */}
            <div style={{
                position: 'absolute', top: -140, right: -60, width: 720, height: 720,
                borderRadius: 720,
                background: `radial-gradient(circle, ${accent}2e 0%, ${accent}0d 45%, #08090a00 70%)`,
                display: 'flex',
            }} />

            {/* The dossier's panel tick, at the card's own top-left corner. */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: 96, height: 5, background: accent, display: 'flex' }} />

            {/* Ridgeline, bottom third, well under the type — the stand-in for a
                cover, so it yields to a real one. */}
            {!cover && (
                <svg width={1300} height={200} viewBox='0 0 1300 200' style={{ position: 'absolute', left: 0, bottom: 96 }}>
                    <path d='M0 120 L150 88 L300 124 L450 84 L600 128 L760 92 L920 130 L1080 88 L1240 126 L1300 104 V200 H0 Z' fill='#101319' />
                    <path d='M0 156 L200 138 L400 166 L600 142 L800 170 L1000 146 L1200 172 L1300 152 V200 H0 Z' fill='#0b0e12' />
                </svg>
            )}

            {/* Top bar */}
            <div style={{
                display: 'flex', alignItems: 'center', height: 76,
                padding: '0 64px', borderBottom: '1px solid #1e232b',
            }}>
                <span style={{ ...LABEL, color: '#a8b0ba' }}>Australian Special Operations Taskforce</span>
                <span style={{ ...LABEL, marginLeft: 'auto', color: status.key === 'discharged' ? '#c05a48' : '#7fae5c' }}>
                    {status.label}
                </span>
            </div>

            {/* Identity */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 64px', flex: 1 }}>
                <div style={{ display: 'flex', position: 'relative', marginRight: 52 }}>
                    <img
                        src={avatarUrl}
                        width={228}
                        height={228}
                        style={{ borderRadius: 4, border: '1px solid #2a3038', objectFit: 'cover' }}
                    />
                    {/* Accent ring, inset — the same framing the page gives it. */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: 228, height: 228,
                        border: `1px solid ${accent}66`, borderRadius: 4, display: 'flex',
                    }} />
                    {member.milpac?.currentRank && (
                        <div style={{
                            position: 'absolute', left: 0, bottom: 0,
                            display: 'flex', padding: '6px 12px',
                            background: '#08090ae0', borderTop: '1px solid #2a3038', borderRight: '1px solid #2a3038',
                            fontSize: 20, letterSpacing: '0.12em', color: accent,
                        }}>
                            {member.milpac.currentRank}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: 21, letterSpacing: '0.26em', textTransform: 'uppercase', color: accent }}>
                        {fullRank || 'Serving member'}
                    </span>
                    <span style={{
                        fontSize: nameSize, fontWeight: 800, letterSpacing: '-0.01em',
                        textTransform: 'uppercase', color: '#e8eaed', lineHeight: 1.04, marginTop: 6,
                    }}>
                        {name}
                    </span>
                    {meta && (
                        <span style={{ fontSize: 23, color: '#a8b0ba', letterSpacing: '0.04em', marginTop: 14 }}>
                            {meta}
                        </span>
                    )}
                </div>
            </div>

            {/* Stat strip — the same four figures the profile leads with. */}
            <div style={{ display: 'flex', borderTop: '1px solid #1e232b' }}>
                {stats.map(([value, label, isAccent], i) => (
                    <div
                        key={label}
                        style={{
                            display: 'flex', flexDirection: 'column', flex: 1,
                            padding: '22px 64px 26px',
                            borderRight: i < stats.length - 1 ? '1px solid #1e232b' : 'none',
                        }}
                    >
                        <span style={{ fontSize: 46, fontWeight: 600, color: isAccent ? accent : '#e8eaed', lineHeight: 1 }}>
                            {value}
                        </span>
                        <span style={{ ...LABEL, fontSize: 15, marginTop: 9 }}>{label}</span>
                    </div>
                ))}
            </div>
        </div>,
        { ...size }
    )
}
