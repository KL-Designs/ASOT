/**
 * Badges a member can pick for one of their kits.
 *
 * Marks rather than artwork, drawn on the same 24x24 grid in `currentColor` as
 * the item icons in `components/loadout/icons.tsx`, so a chip can tint them with
 * the member's accent. The set is deliberately small and role-shaped — a member
 * picking one is saying "this is my medic kit", not decorating.
 *
 * Path data lives here rather than beside the component because the API routes
 * validate against it and must not pull JSX into a route handler. The component
 * is `components/loadout/kit-icons.tsx`.
 */

export const KIT_ICON_PATHS = {
    kit: 'M8 6h8a3 3 0 0 1 3 3v12H5V9a3 3 0 0 1 3-3zm1-3h6v3H9zm-1 9h8v4H8z',
    rifle: 'M2 10h13l2-2h5v3l-3 1v2h-4l-1 2h-3l-1-2H8v-2H2z',
    crosshair: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 2v5m0 10v5M2 12h5m10 0h5',
    medic: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
    radio: 'M4 9h16v12H4zm4-7 6 7M8 13h6v4H8z',
    explosive: 'M6 10h12v11H6zm6 0V6a3 3 0 0 1 5-2',
    grenade: 'M12 6a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-2-4h4v4h-4zm4 1 4-2',
    binoculars: 'M6 8a4 4 0 1 1 0 12 4 4 0 0 1 0-12zm12 0a4 4 0 1 1 0 12 4 4 0 0 1 0-12zM10 14h4M7 4h3v4H7zm7 0h3v4h-3z',
    wrench: 'M14 3a5 5 0 0 0-4 8l-7 7 3 3 7-7a5 5 0 0 0 6-7l-3 3-3-3 3-3a5 5 0 0 0-2-1z',
    rocket: 'M2 9h16a3 3 0 0 1 0 6H8l-2 4H4l1-4H2zm16 0 4 3-4 3',
    shield: 'M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5z',
    star: 'M12 2.8 15 9.5l7.2 1-5.2 5 1.2 7.2L12 19.3 5.8 22.7 7 15.5 1.8 10.5l7.2-1z',
    chevron: 'M4 12 12 5l8 7M4 19l8-7 8 7',
    parachute: 'M2 12a10 10 0 0 1 20 0H2zm4 0 6 9m6-9-6 9M12 12v9',
    wings: 'M12 7v10M3 10c3-1 6 0 9 3 3-3 6-4 9-3-3 4-6 5-9 3-3 2-6 1-9-3z',
    skull: 'M12 3a8 8 0 0 1 8 8v4l-2 2v3H6v-3l-2-2v-4a8 8 0 0 1 8-8zm-3 8h2v2H9zm4 0h2v2h-2z',
    compass: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm4 5-6 2-2 6 6-2z',
    flag: 'M5 3v18M5 4h13l-3 4 3 4H5z',
    helmet: 'M3 15a9 9 0 0 1 18 0v3h-4l-2 2H9l-2-2H3z',
} as const

export type KitIconKey = keyof typeof KIT_ICON_PATHS

/** Ordered for the picker grid; `kit` first because it is the default. */
export const KIT_ICON_KEYS = Object.keys(KIT_ICON_PATHS) as KitIconKey[]

/** What a kit imported before icons existed — and anything unrecognised — shows. */
export const DEFAULT_KIT_ICON: KitIconKey = 'kit'

/**
 * Narrow an untrusted value to a key.
 *
 * The icon arrives from a JSON body and ends up in a `Record` lookup, so this
 * has to reject `__proto__` and `constructor` as firmly as it rejects a typo —
 * hence the explicit key-list check rather than `key in KIT_ICON_PATHS`.
 */
export function isKitIcon(value: unknown): value is KitIconKey {
    return typeof value === 'string' && (KIT_ICON_KEYS as string[]).includes(value)
}

/** The key to render for a stored value, never throwing on an unknown one. */
export function kitIcon(value: unknown): KitIconKey {
    return isKitIcon(value) ? value : DEFAULT_KIT_ICON
}
