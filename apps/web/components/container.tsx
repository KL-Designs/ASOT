import React from 'react'
import { StaticImageData } from 'next/image'

import Masthead from '@/components/ui/Masthead'
import SectionRail from '@/components/ui/SectionRail'
import { type BannerHeight } from '@/lib/shell/masthead'
import { type RailItem } from '@/lib/shell/rail'
import s from '@/styles/shell.module.css'

/**
 * The shell behind every public page that is not the landing page.
 *
 * Ten files render this. The four original props and the whole `sx` object
 * keep their meaning so none of them had to change when the banner was
 * rebuilt; everything added since is optional.
 *
 * `bannerHeight` still takes xsm/sm/md/lg, but those now resolve to clamped
 * pixel heights rather than the `vh` values they used to — see
 * lib/shell/masthead.ts for why.
 *
 * Synchronous, and deliberately so: a server component cannot read the current
 * path (nothing sets a pathname header, and a middleware that did would have to
 * run app-wide, which this app's middleware deliberately does not). Anything
 * page-specific — the kicker included — is passed in by the caller.
 */
export default function Container({
    children, title, subtitle, background, backgroundUrl, kicker, lede, aside, rail, sx,
}: {
    children?: React.ReactNode
    title?: string
    subtitle?: string
    background?: StaticImageData
    backgroundUrl?: string
    /** The mono label above the title. Omit to render no kicker. */
    kicker?: string
    /** Overrides `subtitle` for the paragraph under the title. */
    lede?: string
    /** The masthead's second column. Omit for a solo band. */
    aside?: React.ReactNode
    /** The sticky section rail. Only the About family passes one. */
    rail?: RailItem[]
    sx?: {
        maxWidth?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | (string & {})
        bannerHeight?: BannerHeight
        padding?: string
        gap?: string | undefined
    }
}) {
    return (
        <div className={s.shell}>
            <Masthead
                title={title || 'PAGE TITLE'}
                kicker={kicker}
                lede={lede ?? subtitle}
                background={background}
                backgroundUrl={backgroundUrl}
                bannerHeight={sx?.bannerHeight}
                aside={aside}
            />

            {rail && <SectionRail items={rail} />}

            <div
                className={`${s.body} ${sx?.maxWidth || 'max-w-md'} ${sx?.gap ?? ''}`}
                style={sx?.padding ? { padding: sx.padding } : undefined}
            >
                {children}
            </div>
        </div>
    )
}
