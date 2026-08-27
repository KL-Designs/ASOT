import React from 'react'

import Button from '@/components/ui/Button'
import EnlistButton from '@/components/ui/EnlistButton'
import Topo from '@/components/ui/Topo'
import { Kicker, Lede } from '@/components/ui/SectionHead'
import { ArrowIcon, DiscordIcon, CrateIcon } from '@/components/ui/icons'
import s from '@/styles/landing.module.css'
import ui from '@/styles/ui.module.css'

/**
 * The enlistment path.
 *
 * The old page had an ENLIST button but never said what happens after you press
 * it. For a unit with an interview and a basic-training gate, that silence
 * costs applications — so the three steps are stated plainly, immediately above
 * the final call to action.
 */

const STEPS = [
    {
        n: 'Step 01', title: 'Apply',
        body: "Five-minute form on the site, then join the Discord. We'll confirm within 48 hours and assign you a recruiter.",
    },
    {
        n: 'Step 02', title: 'Interview',
        body: 'A relaxed voice chat with a recruiter — expectations, mod setup, and which platoon suits how you want to play.',
    },
    {
        n: 'Step 03', title: 'Basic training',
        body: "One session covering comms, movement and our systems. Pass it and you're posted to a section for your first operation.",
    },
]

export default function EnlistBand() {
    return (
        <section className={s.enlist} id='enlist'>
            <Topo opacity={0.05} driftSeconds={720} />

            <div className={s.enlistIn}>
                <Kicker>Enlistment</Kicker>
                <h2 className={ui.h2}>Three steps to the field</h2>
                <Lede>
                    No experience with milsim required — most of our members had none when they
                    joined. Bring ArmA 3, a working mic and a Saturday night.
                </Lede>

                <div className={s.steps}>
                    {STEPS.map(step => (
                        <div key={step.n} className={s.step}>
                            <div className={s.n}>{step.n}</div>
                            <h4>{step.title}</h4>
                            <p>{step.body}</p>
                        </div>
                    ))}
                </div>

                <div className={s.enlistCta}>
                    <div className={s.t}>Ready when you are.</div>
                    <div className={s.btns}>
                        <EnlistButton>Enlist now <ArrowIcon /></EnlistButton>
                        <Button variant='discord' href='https://discord.gg/asot' external>
                            <DiscordIcon /> Join Discord
                        </Button>
                        <Button variant='amber' href='/donate'>
                            <CrateIcon /> Donate
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
