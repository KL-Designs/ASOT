import React from 'react'
import Image from 'next/image'

import Button from '@/components/ui/Button'
import SectionHead from '@/components/ui/SectionHead'
import { ArrowIcon } from '@/components/ui/icons'
import type { PlatoonStat } from '@/lib/landing'

import Droneteam7 from '@/public/images/home/Droneteam7.png'
import SPEAR_OVERCAST_Final from '@/public/images/home/SPEAR_OVERCAST_Final.png'
import Mike1440 from '@/public/images/home/Mike1440.png'
import s from '@/styles/landing.module.css'

/**
 * The three platoons.
 *
 * The member and section counts are live off the ORBAT rather than written
 * into the copy, so a card can't quietly go stale. There is no recruiting
 * status chip: every platoon is permanently open, so the slot only ever said
 * one thing, and the ORBAT holds no establishment ceiling to make it a real
 * figure instead.
 */

const PLATOONS = [
    {
        id: 'platoon11', number: '1-1', role: 'Infantry', image: Droneteam7,
        body: 'Our primary infantry platoon and the main fighting force of the taskforce — three eight-man sections and a four-man headquarters, across a wide range of weapons, vehicles and equipment.',
    },
    {
        id: 'platoon12', number: '1-2', role: 'Infantry', image: SPEAR_OVERCAST_Final,
        body: 'Mirrors the structure and role of 1-1 as a second core infantry platoon. Three eight-man sections and a four-man headquarters handling tactical operations across every environment.',
    },
    {
        id: 'support', number: '1-3', role: 'Support', image: Mike1440,
        body: 'The support platoon — combat engineering, indirect fire, rotary air support, medical and armoured cavalry. Specialised teams that give every mission its operational flexibility.',
    },
]

export default function Platoons({ stats }: { stats: PlatoonStat[] }) {
    const statFor = (id: string) => stats.find(st => st.id === id)

    return (
        <section className={s.sec} id='platoons'>
            <div className={s.inner}>
                <SectionHead
                    kicker='Our units'
                    title='Join a platoon'
                    more={{ href: '/orbat', label: 'Full ORBAT' }}
                />

                <div className={s.plats}>
                    {PLATOONS.map(p => {
                        const stat = statFor(p.id)
                        return (
                            <article key={p.id} className={s.plat}>
                                <div className={s.img}>
                                    <Image src={p.image} alt='' fill style={{ objectFit: 'cover' }} />
                                    <span className={s.role}>{p.role}</span>
                                    <span className={s.num}>
                                        <span className={s.k}>Platoon</span>
                                        <span className={s.v}>{p.number}</span>
                                    </span>
                                </div>

                                <div className={s.body}>
                                    <p>{p.body}</p>
                                    <div className={s.stats}>
                                        <span><b>{stat?.members ?? '—'}</b>Members</span>
                                        <span><b>{stat?.sections ?? '—'}</b>Sections</span>
                                    </div>
                                    <Button variant='red' size='sm' href={`/about/callsigns#${p.number}`}>
                                        Learn more <ArrowIcon />
                                    </Button>
                                </div>
                            </article>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
