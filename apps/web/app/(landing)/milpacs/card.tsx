import type { Route } from 'next'
import Link from 'next/link'
import Image from 'next/image'

import Avatar from '@/components/member/avatar'
import { resolveMemberAccent } from '@/lib/military/accent'
import type { MilpacKitLine } from '@/lib/milpac-kits'
import s from './roster.module.css'

/**
 * A member on the roster.
 *
 * The tile this replaces showed a rank, a name and a billet in 180px and
 * nothing else — for a page whose job is "who is in this unit", that left the
 * reader clicking through to find out anything at all. This carries the
 * member's milpac cover photo, avatar, a clipped biography and their default
 * public kit, all of which the unit already stores and none of which was on
 * show.
 *
 * A server component now. The old one was `'use client'` solely to run a
 * mouse-tilt effect; the hover treatment is CSS, so 163 of these no longer ship
 * a component's worth of JavaScript each.
 */
export default function Card({ member, role, href, kit, coverUrl }: {
    member: User
    role?: string
    /** The member's canonical milpac path; without it the username URL still
     *  works, it just costs a redirect. */
    href?: Route
    /** Their default kit, when they have one and have shared it. */
    kit?: MilpacKitLine | null
    /** The cover photo from their milpac profile, when they have uploaded one.
     *  Deliberately not the Discord banner: this is the image the member chose
     *  for their own file, and the one they can actually change. */
    coverUrl?: string
}) {
    const accent = resolveMemberAccent(member)

    // Prefer explicit name; fall back to parsing the Discord nickname.
    const strippedNick = member.guild.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const nickParts = (strippedNick || member.globalName || member.username || '').split(' ')
    const parsedName = nickParts.length > 1 ? nickParts.slice(1).join(' ') : (strippedNick || member.globalName || 'Unknown')
    const name = member.name || parsedName

    // Prefer DB rank; fall back to the first word of the Discord nickname.
    const rankAbbr = member.milpac?.currentRank || (nickParts.length > 1 ? nickParts[0] : null)

    const bio = member.bio?.content?.trim()

    return (
        <Link
            href={href ?? `/milpacs/${member.username}`}
            className={s.card}
            style={{ ['--acc' as string]: accent }}
        >
            <div className={s.banner}>
                {coverUrl && (
                    <Image
                        src={coverUrl}
                        alt=''
                        width={480}
                        height={136}
                        // Covers are stored exactly as uploaded — the route does
                        // no resizing — so a roster of 163 of them has to go
                        // through the optimiser or it ships tens of megabytes.
                        // 75 and not an arbitrary number: `images.qualities` in
                        // next.config.ts is an allow-list, and anything off it
                        // is a runtime error rather than a warning.
                        quality={75}
                        // Decorative and below the fold for all but the first
                        // row — never worth blocking the roster on.
                        loading='lazy'
                    />
                )}
            </div>

            <div className={s.avatarWrap}>
                <div className={s.avatar}>
                    <Avatar user={{ id: member.id, avatarURL: member.avatarURL }} />
                </div>
            </div>

            <div className={s.body}>
                <div className={s.who}>
                    {rankAbbr && <span className={s.rank}>{rankAbbr}</span>}
                    <p className={s.name}>{name}</p>
                    {role && <span className={s.billet}>{role}</span>}
                </div>

                {bio
                    ? <p className={s.bio}>{bio}</p>
                    : <p className={s.bioEmpty}>No biography set.</p>}
            </div>

            {kit
                ? (
                    <div className={s.kit}>
                        <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor'
                             strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                            <path d='M3 13h11l4-4h3' />
                            <path d='M6 13v4' />
                            <path d='M14 9V7' />
                        </svg>
                        <span className={s.kitText}>
                            {kit.primary ? `${kit.primary} · ` : ''}{kit.itemCount} {kit.itemCount === 1 ? 'item' : 'items'}
                        </span>
                    </div>
                )
                : <div className={s.kitEmpty}>No public kit</div>}
        </Link>
    )
}
