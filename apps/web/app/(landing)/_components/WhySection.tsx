import React from 'react'
import Image from 'next/image'

import SectionHead from '@/components/ui/SectionHead'
import { MilitaryTech, Group, Backpack, TrackChanges } from '@mui/icons-material'

import LargestMilsim from '@/public/images/home/Rooftopincert.jpg'
import s from '@/styles/landing.module.css'

/**
 * Why ASOT — one lead card carrying the headline number, then four short cards.
 *
 * This replaces four full-width alternating text-and-image blocks that took
 * roughly 4,800px of scroll to deliver four short paragraphs. The same content
 * fits in about 700px here, which is what buys room for the operations board,
 * the gallery strip and the enlistment path — none of which the old page had.
 */

const CARDS = [
    {
        n: '01', kicker: 'Experience', title: 'Six years of it',
        icon: <MilitaryTech />,
        body: 'Previous and currently serving members of the armed forces have helped shape our gameplay into a genuine balance of realism and playability.',
    },
    {
        n: '02', kicker: 'Culture', title: 'Everyone has a voice',
        icon: <Group />,
        body: 'Large and structured, but every member gets a say in nearly everything we do. New ideas are welcomed. It runs more like a family than a chain of command.',
    },
    {
        n: '03', kicker: 'Features', title: 'ASOT-only systems',
        icon: <Backpack />,
        body: 'Custom uniforms, patches and weapons, plus vehicle recovery that lets engineers bring back fully destroyed vehicles and aircraft. Nothing else in ArmA works like it.',
    },
    {
        n: '04', kicker: 'Gameplay', title: 'Never the same twice',
        icon: <TrackChanges />,
        body: 'A full-time Zeus team builds balanced, challenging missions every week across infantry, armour, rotary and support. There’s something for everyone.',
    },
]

export default function WhySection({ roster }: { roster: number | null }) {
    return (
        <section className={`${s.sec} ${s.secTight}`} id='why'>
            <div className={s.inner}>
                <SectionHead
                    kicker='Why ASOT'
                    title="What you're joining"
                    more={{ href: '/about', label: 'About the unit' }}
                />

                <div className={s.why}>
                    <article className={s.whyLead}>
                        <div className={s.img}>
                            <Image src={LargestMilsim} alt='' fill style={{ objectFit: 'cover' }} />
                        </div>
                        <div className={s.body}>
                            <div className={s.big}>{roster ?? '—'}<em>+</em></div>
                            <h3>The largest milsim in Oceania</h3>
                            <p>
                                Not just Australia — the whole region. New recruits join every week from
                                across Australia, New Zealand and Asia, and operations regularly field 50
                                or more.
                            </p>
                        </div>
                    </article>

                    {CARDS.map(c => (
                        <article key={c.n} className={s.card}>
                            <span className={s.ghost}>{c.n}</span>
                            <div className={s.k}>{c.kicker}</div>
                            <span className={s.ic}>{c.icon}</span>
                            <h3>{c.title}</h3>
                            <p>{c.body}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    )
}
