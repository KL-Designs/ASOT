import React from 'react'

/* ============================================================================
   The mockup's line icons, kept as-is.

   MUI carries equivalents for most of these and the navbar uses them, but this
   set is drawn on one grid at one weight — swapping half of them for Material's
   heavier, filled-adjacent shapes would leave the toolbar looking assembled
   from two kits. They are trivial paths; the consistency is worth more than the
   dependency.
   ========================================================================== */

const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
}

type P = { className?: string }

export const SearchIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} {...p} aria-hidden='true'>
        <path d='M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4.5 4.5' />
    </svg>
)

export const StarIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} {...p} aria-hidden='true'>
        <path d='M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8z' />
    </svg>
)

export const ChevronDown = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={2} {...p} aria-hidden='true'>
        <path d='M5 8.5l7 7 7-7' />
    </svg>
)

export const ChevronLeft = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={1.8} {...p} aria-hidden='true'>
        <path d='M15 5l-7 7 7 7' />
    </svg>
)

export const ChevronRight = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={1.8} {...p} aria-hidden='true'>
        <path d='M9 5l7 7-7 7' />
    </svg>
)

export const CloseIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={1.8} {...p} aria-hidden='true'>
        <path d='M5.5 5.5l13 13M18.5 5.5l-13 13' />
    </svg>
)

export const CrossSmall = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={2.4} {...p} aria-hidden='true'>
        <path d='M5.5 5.5l13 13M18.5 5.5l-13 13' />
    </svg>
)

export const CheckIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={3} {...p} aria-hidden='true'>
        <path d='M4.5 12.5l5 5 10-11' />
    </svg>
)

export const ExpandIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={1.8} {...p} aria-hidden='true'>
        <path d='M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5' />
    </svg>
)

export const DownloadIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} {...p} aria-hidden='true'>
        <path d='M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5M4 19.5h16' />
    </svg>
)

export const LinkIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} {...p} aria-hidden='true'>
        <path d='M10 14a4 4 0 006 .5l2.5-2.5a4 4 0 00-5.7-5.7L11.5 7.7' />
        <path d='M14 10a4 4 0 00-6-.5L5.5 12a4 4 0 005.7 5.7l1.3-1.4' />
    </svg>
)

export const MasonryIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={1.5} {...p} aria-hidden='true'>
        <path d='M4 4h6v9H4zM14 4h6v5h-6zM4 17h6v3H4zM14 13h6v7h-6z' />
    </svg>
)

export const SheetIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} strokeWidth={1.5} {...p} aria-hidden='true'>
        <path d='M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' />
    </svg>
)

export const GroupedIcon = (p: P) => (
    <svg viewBox='0 0 24 24' {...stroke} {...p} aria-hidden='true'>
        <path d='M4 5h16M4 11h16M4 17h16M4 5v14' />
    </svg>
)
