import React from 'react'
import Link from 'next/link'

import Button from '@/components/ui/Button'
import Pulse from '@/components/ui/Pulse'
import ProgressTrack from '@/components/ui/ProgressTrack'
import SectionHead, { Kicker } from '@/components/ui/SectionHead'
import type { LandingOp } from '@/lib/landing'
import s from '@/styles/landing.module.css'

/**
 * The operations board: one featured operation, and a log beside it.
 *
 * The log deliberately mixes upcoming and recent with a status dot on each.
 * The old page headed this "Recent & Upcoming" over three cards all marked
 * COMPLETED, which reads as a dead unit to a visitor deciding whether to apply
 * — same data, honest framing.
 */
export default function IntelBoard({ featured, log }: { featured: LandingOp | null, log: LandingOp[] }) {
    if (!featured && log.length === 0) return null

    const upcoming = log.filter(o => o.status !== 'Completed').length
    const recent = log.length - upcoming

    return (
        <section className={s.sec} id='operations'>
            <div className={s.inner}>
                <SectionHead
                    kicker='Intel board'
                    title={featured ? 'Next operation' : 'Operations'}
                    more={{ href: '/operations', label: 'View all operations' }}
                />

                <div className={`${s.intel} ${featured ? '' : s.intelSolo}`}>
                    {featured && <FeaturedOp op={featured} />}

                    <aside className={s.oplist}>
                        <div className={s.lh}>
                            <span>Operations log</span>
                            <span>{upcoming} upcoming · {recent} recent</span>
                        </div>

                        {log.map(op => <LogRow key={op.id} op={op} />)}

                        <div className={s.lf}>
                            <Button variant='ghost' size='sm' href='/operations'>Full operations archive</Button>
                        </div>
                    </aside>
                </div>
            </div>
        </section>
    )
}

function FeaturedOp({ op }: { op: LandingOp }) {
    const running = op.status === 'Active' || op.stage === 'op_running' || op.stage === 'confirmations_open'
    const signedOn = running ? (op.confirmed || op.attending) : op.attending

    const when = new Date(op.date).toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    })

    return (
        <article className={s.opfeat}>
            <div className={s.opfeatImg}>
                {op.coverImage && <img src={op.coverImage} alt='' />}
                <span className={s.badge}>
                    <Pulse tone={running || op.rsvpOpen ? 'live' : 'idle'} />
                    {running ? 'Op running' : op.rsvpOpen ? 'Sign-on open' : 'Briefing pending'}
                </span>
            </div>

            <div className={s.opfeatBody}>
                <Kicker>{when} AEST{op.department ? ` · ${op.department}` : ''}</Kicker>
                <h3 className={s.opfeatT}>{op.title}</h3>

                {/* Only fields the schema actually carries. There is no duration or
                    modset stored anywhere, so neither is claimed here. */}
                <div className={s.meta}>
                    {op.ownedByName && <span>Mission by <b>{op.ownedByName}</b></span>}
                    {op.mapWorld && <span>Map <b>{op.mapWorld}</b></span>}
                    <span>Status <b>{op.status}</b></span>
                </div>

                {op.blurb && <p className={s.opfeatD}>{op.blurb}</p>}

                <div className={s.opfeatFoot}>
                    <ProgressTrack
                        className={s.slots}
                        label='Signed on'
                        value={op.slots ? <><b>{signedOn}</b> / {op.slots} slots</> : <><b>{signedOn}</b> signed on</>}
                        pct={op.slots ? (signedOn / op.slots) * 100 : 0}
                    />
                    <Button variant='red' href={`/operations/${op.id}`}>Sign on</Button>
                    <Button variant='ghost' href={`/operations/${op.id}`}>Read orders</Button>
                </div>
            </div>
        </article>
    )
}

function LogRow({ op }: { op: LandingOp }) {
    const date = new Date(op.date)
    const upcoming = op.status !== 'Completed'

    const status = upcoming
        ? op.rsvpOpen
            ? `Sign-on open · ${op.attending}${op.slots ? ` / ${op.slots}` : ''}`
            : 'Briefing pending'
        : 'Completed'

    return (
        <Link href={`/operations/${op.id}` as any} className={`${s.oprow} ${upcoming ? s.up : ''}`}>
            <span className={s.dt}>
                {date.toLocaleDateString('en-AU', { month: 'short' })}
                <b>{date.toLocaleDateString('en-AU', { day: '2-digit' })}</b>
            </span>
            <span>
                <span className={s.nm}>{op.title}</span>
                <span className={s.st}><i />{status}</span>
            </span>
            <span className={s.go}>→</span>
        </Link>
    )
}
