import type { IconKey } from '@/lib/loadout/classify'

/**
 * Marks for loadout items — our own, not Arma's.
 *
 * Real item artwork lives in mod PBOs as .paa textures and would mean
 * extracting and converting hundreds of files (spec §8). These generalise
 * instead: one mark per kind of thing, drawn on a 24x24 grid in currentColor so
 * a row can tint them with the member's accent.
 *
 * PATHS is a total map over IconKey, deliberately. Adding a key to ICON_KEYS
 * without drawing it is then a compile error, not a blank square in production.
 */
const PATHS: Record<IconKey, string> = {
    rifle: 'M2 10h13l2-2h5v3l-3 1v2h-4l-1 2h-3l-1-2H8v-2H2z',
    carbine: 'M3 10h11l2-2h5v3l-3 1v2h-4l-1 2h-2l-1-2H3z',
    dmr: 'M2 10h14l2-2h6v3l-3 1v2h-4l-1 2h-3l-1-2H6v-2H2z',
    sniper: 'M2 11h13l2-3h7v3l-4 1v2h-4l-1 2h-3v-2H2z',
    mg: 'M2 9h14l2-2h6v4l-3 1v3h-5l-1 2H6v-3H2z',
    launcher: 'M2 9h18a2 2 0 0 1 0 6H8l-2 3H4l1-3H2z',
    pistol: 'M4 8h12v4h-2l-1 2h-2l-3 6H5l1-6H4z',
    taser: 'M5 8h11l3 3-3 3h-3l-2 6H7l1-6H5z',
    optic: 'M4 9h16v6H4zm4-3h8v3H8zm-6 5h2v2H2zm18 0h2v2h-2z',
    holo: 'M5 8h14v8H5zm3 3h8v2H8z',
    pointer: 'M6 9h10v6H6zm10 2h6v2h-6zM4 11h2v2H4z',
    muzzle: 'M3 10h11v4H3zm11 1h8v2h-8z',
    bipod: 'M11 4h2v8h-2zM4 20l7-8 2 1-6 7zm16 0l-7-8-2 1 6 7z',
    grip: 'M9 4h6v6l-2 10h-2L9 10z',
    magazine: 'M7 4h10v5H7zm1 5h8v11H8z',
    belt: 'M3 9h18v6H3zm3 0v6m4-6v6m4-6v6m4-6v6',
    grenade: 'M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-2-3h4v3h-4z',
    smoke: 'M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-2-4h4v2h-4zM6 3q4 2 0 4',
    flashbang: 'M13 2 5 13h5l-1 9 8-11h-5z',
    explosive: 'M12 3l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z',
    tourniquet: 'M4 10h16v4H4zm5-4h2v12H9zm7 2 4 4-4 4z',
    bandage: 'M3 11h18v2H3zm4-5h10v12H7zm-2 6h14',
    iv: 'M10 2h4v6h-4zm1 6h2v8h-2zm-2 8h6v6H9z',
    syringe: 'M3 20l4-4 M6 17l-2 4 4-2M8 15l7-7 3 3-7 7zM16 4l4 4',
    splint: 'M6 3h3v18H6zm9 0h3v18h-3zM4 10h16v2H4z',
    airway: 'M6 18q0-12 8-12 4 0 4 4t-4 4h-4',
    chestseal: 'M4 5h16v14H4zm4 4h8v6H8z',
    surgical: 'M5 4h14v16H5zm4 4h6v2H9zm2-2h2v6h-2z',
    medication: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM7 12h10',
    diagnostic: 'M3 12h4l2-5 3 10 2-5h7',
    radio: 'M5 8h14v12H5zm3-6 3 6M18 4v4M8 12h4v4H8z',
    gps: 'M6 3h12v18H6zm2 3h8v8H8z',
    map: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16',
    compass: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm4 5-6 3-2 6 6-3z',
    watch: 'M9 2h6v4H9zm0 16h6v4H9zm3-12a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 2v4h3',
    nvg: 'M3 8h18v6a4 4 0 0 1-4 4h-2l-3-3-3 3H7a4 4 0 0 1-4-4zm3 2h4v3H6zm8 0h4v3h-4z',
    rangefinder: 'M3 7h18v10H3zm5 0v10m8-10v10M6 4h4v3H6zm8 0h4v3h-4z',
    strobe: 'M11 2h2v6h-2zM4 6l4 4M20 6l-4 4M8 12h8v10H8z',
    uniform: 'M9 3h6l5 3-2 4-2-1v12H8V9L6 10 4 6z',
    vest: 'M8 3h8l3 3v15H5V6zm4 0v18M5 10h14',
    backpack: 'M8 6h8a3 3 0 0 1 3 3v12H5V9a3 3 0 0 1 3-3zm1-3h6v3H9zm-1 9h8v4H8z',
    helmet: 'M3 15a9 9 0 0 1 18 0v3h-4l-2 2H9l-2-2H3z',
    facewear: 'M3 9h18v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zm0-3h18v3H3z',
    tool: 'M14 3a5 5 0 0 0-4 8l-7 7 3 3 7-7a5 5 0 0 0 6-7l-3 3-3-3 3-3a5 5 0 0 0-2-1z',
    document: 'M6 2h8l4 4v16H6zm8 0v5h5M9 12h6M9 16h6',
    item: 'M12 2l9 5v10l-9 5-9-5V7zm0 2.3L5 8v8l7 3.7L19 16V8z',
}

export function LoadoutIcon({ icon, size = 16 }: { icon: IconKey; size?: number }) {
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
            <path d={PATHS[icon]} />
        </svg>
    )
}
