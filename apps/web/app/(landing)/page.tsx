import React from 'react'

import {
    getFeaturedOp, getOperationsLog, getPlatoonStats,
    getRosterCount, getGalleryTiles, getScreenshotOfMonth,
} from '@/lib/landing'
import client from '@/lib/discord'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

import Hero from './_components/Hero'
import NextOpCard from './_components/NextOpCard'
import StatReadout from './_components/StatReadout'
import IntelBoard from './_components/IntelBoard'
import WhySection from './_components/WhySection'
import Platoons from './_components/Platoons'
import GalleryStrip from './_components/GalleryStrip'
import EnlistBand from './_components/EnlistBand'

import s from '@/styles/landing.module.css'

/**
 * The public home page.
 *
 * A server component: every figure on the page comes out of Mongo through
 * `lib/landing`, so it renders complete rather than filling in after mount.
 * Only the pieces that genuinely need the browser are client components — the
 * hero (which hosts the minigame) and the countdown inside the operation card.
 *
 * The page leads with what is happening next. The version it replaces was an
 * about page: it explained who we are four separate times and never told a
 * returning member anything actionable.
 */

// Operation status, sign-on counts and the roster all move between requests.
export const dynamic = 'force-dynamic'

export default async function Page() {
    const [sotm, featured, log, platoons, roster, tiles, me] = await Promise.all([
        getScreenshotOfMonth(),
        getFeaturedOp(),
        getOperationsLog(6),
        getPlatoonStats(),
        getRosterCount(),
        getGalleryTiles(6),
        // No token, a discharged account or a cold Discord cache all mean the
        // same thing to this page: render it as a visitor sees it.
        client.fetchMe().catch(() => null),
    ])

    const isMember = me ? await hasDashboardAccess(me).catch(() => false) : false

    /*
       Where the board sits depends on who is reading and whether there is
       anything to read.

       A visitor is being sold the unit, and the operations log is evidence for
       that pitch rather than something to act on — it belongs late, after the
       case has been made. A signed-in member with an operation coming up is
       here for exactly one thing, so the board comes to them.

       Both halves of that have to hold. With no featured operation the board
       has no large panel to lead with, only the log, and promoting a bare list
       above the pitch would serve nobody — so it stays at the bottom no matter
       who is looking.
    */
    const board = <IntelBoard featured={featured} log={log} />
    const promoted = isMember && !!featured

    return (
        <div className={s.page}>
            <Hero
                sotm={sotm}
                roster={roster}
                opCard={featured ? <NextOpCard op={featured} /> : null}
            />

            {/* The readout stays welded to the hero even when the board is
                promoted — it is the base of the hero's composition, a thin band
                of figures rather than a section of its own, and slotting
                anything between the two leaves the hero ending on nothing.
                Promoted, the board becomes the first real section instead. */}
            <StatReadout roster={roster} />

            {promoted && board}

            {/* The pitch first, then the proof, then the standing record. The
                enlist band stays last — it is the page's closing move, and the
                operations log reads as evidence for it rather than as a section
                someone is meant to act on. */}
            <WhySection roster={roster} />
            <Platoons stats={platoons} />
            <GalleryStrip tiles={tiles} />
            {!promoted && board}
            <EnlistBand />
        </div>
    )
}
