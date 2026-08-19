import React from 'react'

/* ============================================================================
   The kit's own icons.

   Only what the components themselves need — a tick, a chevron, the stepper's
   plus and minus, the warning triangle a confirm dialog leads with. Screens
   built on the kit reach for MUI as they always have; these exist so a Button
   or a Stepper is never waiting on an icon prop to look finished.
   ========================================================================== */

const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
}

type P = { className?: string }

export const Check = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} strokeWidth={2.2} {...p} aria-hidden='true'>
        <path d='M4.5 12.5l5 5 10-11' />
    </svg>
)

export const CheckBold = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} strokeWidth={3} {...p} aria-hidden='true'>
        <path d='M4.5 12.5l5 5 10-11' />
    </svg>
)

export const ChevronDown = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} strokeWidth={2} {...p} aria-hidden='true'>
        <path d='M5 8.5l7 7 7-7' />
    </svg>
)

export const ArrowRight = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} {...p} aria-hidden='true'>
        <path d='M5 12h13M13 6.5 18.5 12 13 17.5' />
    </svg>
)

export const Plus = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} strokeWidth={2} {...p} aria-hidden='true'>
        <path d='M12 5v14M5 12h14' />
    </svg>
)

export const Minus = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} strokeWidth={2} {...p} aria-hidden='true'>
        <path d='M5 12h14' />
    </svg>
)

export const Warning = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} {...p} aria-hidden='true'>
        <path d='M12 4l9 16H3zM12 10v4M12 17h.01' />
    </svg>
)

export const Close = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} {...p} aria-hidden='true'>
        <path d='M6 6l12 12M18 6L6 18' />
    </svg>
)

export const Dots = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} strokeWidth={2.6} {...p} aria-hidden='true'>
        <path d='M6 12h.01M12 12h.01M18 12h.01' />
    </svg>
)

export const Star = (p: P) => (
    <svg viewBox='0 0 24 24' {...line} {...p} aria-hidden='true'>
        <path d='M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8z' />
    </svg>
)
