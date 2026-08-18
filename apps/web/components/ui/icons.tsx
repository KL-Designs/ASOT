import React from 'react'

/**
 * The handful of hand-drawn glyphs the Command Strip language uses where a
 * stock MUI icon would say the wrong thing.
 *
 * Everything else on the site uses `@mui/icons-material` — only add here when
 * the meaning genuinely isn't in that set.
 */

type IconProps = React.SVGProps<SVGSVGElement>

function Stroke({ d, ...props }: IconProps & { d: string }) {
    return (
        <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
            {...props}
        >
            <path d={d} />
        </svg>
    )
}

/**
 * A supply crate. Donations read as resupply rather than charity, which sits
 * better with the milsim framing than a heart would.
 */
export const CrateIcon = (props: IconProps) => (
    <Stroke d='M3 7.5 12 4l9 3.5v9L12 20l-9-3.5v-9zM3 7.5 12 11l9-3.5M12 11v9M8.5 12.4v3.2M15.5 12.4v3.2' {...props} />
)

/** Arrow, for "this leads somewhere" on a primary action. */
export const ArrowIcon = (props: IconProps) => (
    <Stroke d='M5 12h13M13 6.5 18.5 12 13 17.5' {...props} />
)

/** Discord's mark. Filled rather than stroked — it is a logo, not a glyph. */
export const DiscordIcon = (props: IconProps) => (
    <svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true' {...props}>
        <path d='M19.3 5.6A16.7 16.7 0 0 0 15.1 4.3a11.6 11.6 0 0 0-.5 1.1 15.5 15.5 0 0 0-4.6 0 11.4 11.4 0 0 0-.6-1.1A16.6 16.6 0 0 0 5.2 5.6C2.6 9.5 1.9 13.3 2.2 17a16.8 16.8 0 0 0 5.1 2.6l1-1.7a10.9 10.9 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 10.3 0l.4.3a10.9 10.9 0 0 1-1.7.8l1 1.7a16.7 16.7 0 0 0 5.1-2.6c.4-4.3-.7-8-2.8-11.4ZM9.3 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.9.9 1.8 2c0 1.1-.8 2-1.8 2Zm5.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.9.9 1.8 2c0 1.1-.8 2-1.8 2Z' />
    </svg>
)

export const SteamIcon = (props: IconProps) => (
    <Stroke d='M12 3a9 9 0 100 18 9 9 0 000-18zM16 7.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8zM9.3 13.3a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2zM13.9 11.7 10.7 13.9' {...props} />
)

export const YouTubeIcon = (props: IconProps) => (
    <svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true' {...props}>
        <path d='M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3Z' />
    </svg>
)

export const MailIcon = (props: IconProps) => (
    <Stroke d='M3 6h18v12H3zM3 7l9 6 9-6' {...props} />
)
