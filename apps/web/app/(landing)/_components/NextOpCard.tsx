import React from 'react'
import Link from 'next/link'

import Button from '@/components/ui/Button'
import Pulse from '@/components/ui/Pulse'
import Countdown from '@/components/ui/Countdown'
import ProgressTrack from '@/components/ui/ProgressTrack'
import type { LandingOp } from '@/lib/landing'
import s from '@/styles/landing.module.css'

/**
 * "Tue 21:00" inside the week, "25 Aug" beyond it — a weekday on its own stops
 * meaning anything the moment it could be either of two Tuesdays.
 */
function shortWhen(at: Date): string {
    const withinWeek = at.getTime() - Date.now() < 6 * 24 * 60 * 60 * 1000
    return at.toLocaleString('en-AU', withinWeek
        ? { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
        : { day: 'numeric', month: 'short' })
}

/**
 * The next operation, as a card in the hero.
 *
 * This is the single block that gives the home page a job. The old page told a
 * visitor who we are but never told a member what to do — this is why someone
 * opens the site on a Thursday.
 */
export default function NextOpCard({ op }: { op: LandingOp }) {
    const running = op.status === 'Active' || op.stage === 'op_running' || op.stage === 'confirmations_open'

    // Once the op is running, RSVPs are stale — what matters is who turned up.
    const signedOn = running ? (op.confirmed || op.attending) : op.attending

    const canSignOn = op.rsvpOpen && !running

    /*
       A scheduled opening is only worth announcing while it is still ahead of
       us. Once the time has passed and sign-on is *still* shut, either the cron
       hasn't fired or someone closed it by hand — and the card would be
       promising an opening that has already failed to happen. In that case it
       falls back to saying nothing more than "not open", which is all we know.
    */
    const scheduled = op.rsvpOpenAt ? new Date(op.rsvpOpenAt) : null
    const opensAt = !canSignOn && !running && scheduled && scheduled.getTime() > Date.now()
        ? scheduled
        : null

    const heading = running
        ? 'Op running'
        : op.rsvpOpen ? 'Sign-on open'
            : opensAt ? `Sign-on opens ${shortWhen(opensAt)}`
                : 'Sign-on not open'

    const when = new Date(op.date).toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).toUpperCase()

    return (
        <aside className={s.opcard}>
            <div className={s.ocH}>
                {/* Amber is "pending" here, the same as it means in the status
                    rail: a sign-on with a time on it isn't live, but it isn't
                    the dead dot of one nobody has scheduled either. */}
                <Pulse tone={running || op.rsvpOpen ? 'live' : opensAt ? 'amber' : 'idle'} />
                {heading}
                {op.department && <span className={s.rt}>{op.department}</span>}
            </div>

            {/* Only when there is a cover. Rendering the panel regardless left a
                blank 118px band between the header and the title, which read as
                a broken image and pushed the card's content to the bottom of a
                box that looked empty. Operation covers are arbitrary stored URLs,
                so next/image would need every host allow-listed — a plain img is
                the honest choice. */}
            {op.coverImage && (
                <div className={s.ocImg}><img src={op.coverImage} alt='' /></div>
            )}

            <div className={s.ocB}>
                <div className={s.ocT}>{op.title}</div>
                <div className={s.ocM}>{when} AEST</div>

                <div className={s.ocCountdown}>
                    <Countdown
                        target={op.date}
                        onElapsed={<div className={s.ocM}>Underway</div>}
                    />
                </div>

                <ProgressTrack
                    className={s.ocSlots}
                    label='Signed on'
                    value={op.slots ? <><b>{signedOn}</b> / {op.slots}</> : <b>{signedOn}</b>}
                    pct={op.slots ? (signedOn / op.slots) * 100 : 0}
                />
            </div>

            {/* Sign-on is only a real action while RSVP is open. Disabled rather
                than hidden: the button going flat is what tells you the state,
                and a slot that empties and refills is harder to read than one
                that greys. Orders stay live — the briefing is worth reading
                before you can commit.

                "Closed" and "not open yet" are different states and the button
                says which: an op three days out has not closed anything. */}
            <div className={s.ocF}>
                <Button
                    variant='red'
                    size='sm'
                    href={`/operations/${op.id}`}
                    disabled={!canSignOn}
                >
                    {canSignOn ? 'Sign on' : opensAt ? 'Not open yet' : 'Sign-on closed'}
                </Button>
                <Button variant='ghost' size='sm' href={`/operations/${op.id}`}>Orders</Button>
            </div>
        </aside>
    )
}
