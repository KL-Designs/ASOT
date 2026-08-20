import React from 'react'

import Container from '@/components/container'
import { type RailItem } from '@/lib/shell/rail'
import { getRosterCount } from '@/lib/landing'
import MastheadAside from '@/components/ui/MastheadAside'

import ImgAbout from '@/public/images/home/training2.png'
import ImgCallsigns from '@/public/images/home/Gopro3.png'
import ImgContact from '@/public/images/home/Mike1440.png'
import ImgRules from '@/public/images/home/ADFField1.png'
import ImgFAQ from '@/public/images/home/SPEAR_OVERCAST_Final.png'
import ImgValues from '@/public/images/home/1122.png'

import { StaticImageData } from 'next/image'

/**
 * The About family: six pages sharing one masthead and one section rail.
 *
 * A server component, and each page names itself. This used to be a layout
 * that derived the page from an `x-pathname` header — a header nothing sets,
 * so every one of the six rendered the index's masthead. A server component
 * cannot read the path; being told which page it is renders is the fix.
 *
 * The kickers below are the one piece of page furniture written for the
 * redesign rather than derived — "About the unit" cannot be produced from the
 * segment "about". The subtitles are unchanged from the previous revision.
 */
export type AboutPageKey = 'index' | 'callsigns' | 'contact' | 'rules' | 'values' | 'faq'

type AboutPage = RailItem & {
    key: AboutPageKey
    kicker: string
    subtitle?: string
    background: StaticImageData
}

const ABOUT_PAGES: AboutPage[] = [
    {
        key: 'index',
        href: '/about',
        label: 'About Us',
        kicker: 'About the unit',
        background: ImgAbout,
    },
    {
        key: 'callsigns',
        href: '/about/callsigns',
        label: 'Callsigns',
        kicker: 'Registry',
        subtitle: 'Here you can see the current call signs we have and some basic information on how they are utilised in missions.',
        background: ImgCallsigns,
    },
    {
        key: 'contact',
        href: '/about/contact',
        label: 'Contact Us',
        kicker: 'Get in touch',
        subtitle: 'If you have any questions, queries, want to join or simply want to say hello, you can contact us any way you like. The best way is generally through our Discord but we are also active in all our media outlets.',
        background: ImgContact,
    },
    {
        key: 'rules',
        href: '/about/rules',
        label: 'Rules & Expectations',
        kicker: 'Standards of conduct',
        subtitle: 'These are some of the more basic rules and expectations we have for all members within the community. A more in depth version will be provided upon recruitment.',
        background: ImgRules,
    },
    {
        key: 'values',
        href: '/about/values',
        label: 'Principles & Values',
        kicker: 'What we stand for',
        background: ImgValues,
    },
    {
        key: 'faq',
        href: '/about/faq',
        label: 'FAQ',
        kicker: 'Common questions',
        subtitle: 'If you cannot find the answer to your questions, please feel free to contact us to seek clarification.',
        background: ImgFAQ,
    },
]

export default async function AboutShell({ page, children }: {
    page: AboutPageKey
    children: React.ReactNode
}) {
    const current = ABOUT_PAGES.find(p => p.key === page) ?? ABOUT_PAGES[0]

    // Only the index page carries an aside — the five sub-pages have no live
    // figures worth a second column, and a 340px band with an empty right half
    // reads as the two-column composition with a hole in it. It is also the
    // only page that pays for the roster query, and the only one that has to
    // render dynamically because of it.
    const isIndex = current.key === 'index'
    const roster = isIndex ? await getRosterCount() : null

    const aside = isIndex ? (
        <MastheadAside
            heading='At a glance'
            status='Live'
            rows={[
                { label: 'Active members', value: roster != null ? String(roster) : '—' },
                { label: 'Ops per week', value: '2' },
                { label: 'Applications', value: 'Open', accent: true },
            ]}
            cta={{ href: '/join', label: 'Enlist now' }}
        />
    ) : undefined

    return (
        <Container
            title={current.label.toUpperCase()}
            kicker={current.kicker}
            lede={current.subtitle}
            background={current.background}
            rail={ABOUT_PAGES}
            aside={aside}
            sx={{ bannerHeight: 'md', maxWidth: 'max-w-md' }}
        >
            {children}
        </Container>
    )
}
