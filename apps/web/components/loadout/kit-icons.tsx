import { KIT_ICON_PATHS, type KitIconKey } from '@/lib/loadout/kit-icons'

/**
 * A kit's chosen badge. Path data and the key list live in
 * `lib/loadout/kit-icons.ts` — the API routes validate against them and must not
 * pull JSX into a route handler.
 */
export function KitIcon({ icon, size = 14 }: { icon: KitIconKey; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth={1.4}
            strokeLinejoin='round'
            aria-hidden='true'
        >
            <path d={KIT_ICON_PATHS[icon]} />
        </svg>
    )
}

/**
 * Marks for the controls around a kit — copy, delete, import and so on.
 *
 * Same 24x24 grid and the same `currentColor` stroke as everything else here, so
 * a button inherits its colour (including the danger red and the published
 * green) without the icon needing to know about it.
 */
const UI_PATHS = {
    plus: 'M12 5v14M5 12h14',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6',
    import: 'M12 3v10m0 0-4-4m4 4 4-4M4 17v3h16v-3',
    check: 'M4 12l5 5L20 6',
    close: 'M5 5l14 14M19 5 5 19',
    pencil: 'M4 20h4L20 8l-4-4L4 16z',
    eye: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zm9-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
} as const

export type UiIconKey = keyof typeof UI_PATHS

export function UiIcon({ icon, size = 12 }: { icon: UiIconKey; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth={1.6}
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
        >
            <path d={UI_PATHS[icon]} />
        </svg>
    )
}
