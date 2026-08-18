import React from 'react'

/**
 * The supply-crate glyph from the mockup, kept as a hand-drawn path rather than
 * swapped for an MUI icon: the whole point of it is that donations read as
 * resupply rather than charity, which is a reading no stock heart or
 * shopping-box conveys. Everything else in the bar uses MUI icons.
 *
 * Sized by `.act svg` in navbar.module.css, and takes its colour from
 * `currentColor` like the MUI icons around it.
 */
export default function CrateIcon(props: React.SVGProps<SVGSVGElement>) {
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
            <path d='M3 7.5 12 4l9 3.5v9L12 20l-9-3.5v-9zM3 7.5 12 11l9-3.5M12 11v9M8.5 12.4v3.2M15.5 12.4v3.2' />
        </svg>
    )
}
