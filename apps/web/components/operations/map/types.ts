import { DEFAULT_METIS, normaliseMetis, readMetis, type MetisMarker } from '@/lib/operations/metis'

export type AnnotationType = 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'marker' | 'text' | 'a3icon' | 'a3metis'

export type DrawingTool = AnnotationType | null

export type A3MarkerColor =
    | 'ColorBlack' | 'ColorRed' | 'ColorBlue' | 'ColorGreen'
    | 'ColorYellow' | 'ColorOrange' | 'ColorPink' | 'ColorWhite'
    | 'ColorWest' | 'ColorEast' | 'ColorGUER' | 'ColorCIV'

export const A3_MARKER_COLORS: { key: A3MarkerColor; hex: string; label: string }[] = [
    { key: 'ColorBlack',  hex: '#111111', label: 'Black'  },
    { key: 'ColorWhite',  hex: '#ffffff', label: 'White'  },
    { key: 'ColorRed',    hex: '#cc0000', label: 'Red'    },
    { key: 'ColorBlue',   hex: '#0044cc', label: 'Blue'   },
    { key: 'ColorGreen',  hex: '#007700', label: 'Green'  },
    { key: 'ColorYellow', hex: '#cccc00', label: 'Yellow' },
    { key: 'ColorOrange', hex: '#cc6600', label: 'Orange' },
    { key: 'ColorPink',   hex: '#cc4488', label: 'Pink'   },
    { key: 'ColorWest',   hex: '#004d99', label: 'West'   },
    { key: 'ColorEast',   hex: '#990000', label: 'East'   },
    { key: 'ColorGUER',   hex: '#004d00', label: 'Guer'   },
    { key: 'ColorCIV',    hex: '#660099', label: 'Civ'    },
]

export type A3SideId = 'blu' | 'red' | 'grn' | 'unk'

// Common Arma 3 marker type strings
export const A3_ICON_TYPES = [
    // Generic
    { key: 'hd_dot',       label: 'Dot',         group: 'Generic' },
    { key: 'hd_objective', label: 'Objective',   group: 'Generic' },
    { key: 'hd_attack',    label: 'Attack',      group: 'Generic' },
    { key: 'hd_defend',    label: 'Defend',      group: 'Generic' },
    { key: 'hd_pickup',    label: 'Pickup',      group: 'Generic' },
    { key: 'hd_destroy',   label: 'Destroy',     group: 'Generic' },
    { key: 'hd_regroup',   label: 'Regroup',     group: 'Generic' },
    { key: 'hd_start',     label: 'Start',       group: 'Generic' },
    { key: 'hd_end',       label: 'End',         group: 'Generic' },
    { key: 'hd_location',  label: 'Location',    group: 'Generic' },
    { key: 'hd_arrow',     label: 'Arrow',       group: 'Generic' },
    { key: 'hd_join',      label: 'Join',        group: 'Generic' },
    { key: 'hd_move',      label: 'Move',        group: 'Generic' },
    { key: 'hd_heal',      label: 'Heal',        group: 'Generic' },
    // Shapes
    { key: 'mil_dot',      label: 'Mil Dot',     group: 'Shape' },
    { key: 'mil_triangle', label: 'Triangle',    group: 'Shape' },
    { key: 'mil_square',   label: 'Square',      group: 'Shape' },
    { key: 'mil_diamond',  label: 'Diamond',     group: 'Shape' },
    { key: 'mil_circle',   label: 'Circle',      group: 'Shape' },
    { key: 'mil_arrow1',   label: 'Arrow 1',     group: 'Shape' },
    { key: 'mil_arrow2',   label: 'Arrow 2',     group: 'Shape' },
    { key: 'mil_start',    label: 'Mil Start',   group: 'Shape' },
    { key: 'mil_destroy',  label: 'Mil Destroy', group: 'Shape' },
    // BLUFOR
    { key: 'b_inf',        label: 'Infantry',    group: 'BLUFOR' },
    { key: 'b_mech_inf',   label: 'Mech Inf',    group: 'BLUFOR' },
    { key: 'b_motor_inf',  label: 'Motor Inf',   group: 'BLUFOR' },
    { key: 'b_armor',      label: 'Armor',       group: 'BLUFOR' },
    { key: 'b_recon',      label: 'Recon',       group: 'BLUFOR' },
    { key: 'b_heli',       label: 'Helicopter',  group: 'BLUFOR' },
    { key: 'b_plane',      label: 'Plane',       group: 'BLUFOR' },
    { key: 'b_uav',        label: 'UAV',         group: 'BLUFOR' },
    { key: 'b_support',    label: 'Support',     group: 'BLUFOR' },
    { key: 'b_naval',      label: 'Naval',       group: 'BLUFOR' },
    // OPFOR
    { key: 'o_inf',        label: 'Infantry',    group: 'OPFOR' },
    { key: 'o_mech_inf',   label: 'Mech Inf',    group: 'OPFOR' },
    { key: 'o_motor_inf',  label: 'Motor Inf',   group: 'OPFOR' },
    { key: 'o_armor',      label: 'Armor',       group: 'OPFOR' },
    { key: 'o_recon',      label: 'Recon',       group: 'OPFOR' },
    { key: 'o_heli',       label: 'Helicopter',  group: 'OPFOR' },
    { key: 'o_plane',      label: 'Plane',       group: 'OPFOR' },
    { key: 'o_uav',        label: 'UAV',         group: 'OPFOR' },
    { key: 'o_support',    label: 'Support',     group: 'OPFOR' },
    { key: 'o_naval',      label: 'Naval',       group: 'OPFOR' },
    // Independent
    { key: 'n_inf',        label: 'Infantry',    group: 'IND' },
    { key: 'n_armor',      label: 'Armor',       group: 'IND' },
    { key: 'n_heli',       label: 'Helicopter',  group: 'IND' },
    // Civilian
    { key: 'c_car',        label: 'Car',         group: 'CIV' },
    { key: 'c_truck',      label: 'Truck',       group: 'CIV' },
] as const

// The Metis catalogue (icons, modifiers, echelons, the stored format and the
// SQF) lives in lib/operations/metis.ts, taken from the mod's own source. It
// used to be a set of hand-written lists here that did not match the mod.

export interface MapLayer {
    id: string
    name: string
    color: string
    /** The shared default. What a viewer actually sees is `resolveVisibility`
     *  (lib/operations/map-layers.ts) over their own choices. */
    visible: boolean
    order: number
    /** The overlay this layer sits inside, or null for an overlay itself. */
    parentId?: string | null
}

export interface AnnotationProperties {
    color: string
    weight: number
    fillColor: string
    fillOpacity: number
    radius?: number      // circle only, in metres
    label?: string       // text / marker label
    fontSize?: number    // text only
    // a3icon fields
    a3MarkerType?: string
    a3MarkerColor?: A3MarkerColor
    a3MarkerDir?: number
    a3MarkerScale?: number
    // a3metis fields. `a3MetisV: 2` means the ids are the mod's own; anything
    // without it was written with the old lists and is translated on read by
    // `readMetis` (lib/operations/metis.ts). Write with `writeMetis`.
    a3MetisV?: number
    a3Hq?: boolean
    a3Condition?: number
    a3Direction?: string
    a3SideId?: A3SideId | 'neu'
    a3Dashed?: boolean
    a3Icon?: number
    a3Mod1?: number
    a3Mod2?: number
    a3Size?: number
    a3HqTf?: number          // index into METIS_HQTF
    a3Designation?: string
    a3MetisScale?: number
    a3AssumedFriend?: boolean
    a3Reinforced?: boolean
    a3Reduced?: boolean
    a3HigherFormation?: string
    a3AdditionalInfo?: string
}

export interface MapAnnotation {
    id: string
    layerId: string
    type: AnnotationType
    // polyline/polygon: [[lat,lng],...], rectangle: [[swLat,swLng],[neLat,neLng]], circle/marker/text: [lat,lng]
    geometry: number[][]
    properties: AnnotationProperties
}

export type MapMode = 'sat' | 'map' | 'terrain'

export interface MapWorld {
    name: string          // directory key, e.g. "altis"
    displayName: string   // e.g. "Altis"
    worldSize: number     // metres, e.g. 30720
    satTiles: number      // number of sat tiles per side (e.g. 4 = 4×4 grid)
    hasGeoJSON: boolean
    hasTerrain: boolean    // terrain.png generated from DEM
    hasCoastline: boolean  // coastline.png — binary land/ocean mask for map mode
    hasContours: boolean   // contours.geojson.gz generated from DEM
    hasPreview: boolean    // preview.png — thumbnail shown in the edit page selector
    colorOutside?: [number, number, number, number]  // RGBA 0–1, used as bg in map mode
}

// Active A3 tool configuration (shared between LayersPanel ↔ OperationMap via MapSection)
export interface A3ToolProps {
    markerType: string
    markerColor: A3MarkerColor
    markerDir: number
    markerScale: number
    /** The Metis marker the tool will place. */
    metis: MetisMarker
}

export const DEFAULT_A3_PROPS: A3ToolProps = {
    markerType: 'hd_dot',
    markerColor: 'ColorBlack',
    markerDir: 0,
    markerScale: 1,
    metis: DEFAULT_METIS,
}

export interface MapPresenceUser {
    name: string
    color: string
    avatar: string | null
    // null when not hovering over the map
    cursor: [number, number] | null
}

/**
 * A saved preset as tool properties.
 *
 * Presets saved before the Metis rebuild hold the old flat fields (`icon`,
 * `mod1`, `hqTf`, …) with the old ids; those are translated the same way an
 * old marker on the map is, so a preset keeps the picture it was saved with.
 */
export function toolPropsFromPreset(preset: Pick<MapMarkerPreset, 'a3Props'>): Partial<A3ToolProps> {
    const p = (preset.a3Props ?? {}) as Record<string, unknown>
    if (p.metis && typeof p.metis === 'object') {
        return { ...(p as Partial<A3ToolProps>), metis: normaliseMetis(p.metis as Partial<MetisMarker>) }
    }
    const { sideId, dashed, icon, mod1, mod2, size, hqTf, designation, metisScale, reinforced, reduced, higherFormation, additionalInfo, assumedFriend: _unused, ...rest } = p
    return {
        ...(rest as Partial<A3ToolProps>),
        metis: readMetis({
            a3SideId: sideId as string, a3Dashed: dashed as boolean, a3Icon: icon as number, a3Mod1: mod1 as number, a3Mod2: mod2 as number,
            a3Size: size as number, a3HqTf: hqTf as number, a3Designation: designation as string, a3MetisScale: metisScale as number,
            a3Reinforced: reinforced as boolean, a3Reduced: reduced as boolean,
            a3HigherFormation: higherFormation as string, a3AdditionalInfo: additionalInfo as string,
        }),
    }
}

export interface MapMarkerPreset {
    _id: string
    name: string
    type: 'a3icon' | 'a3metis'
    a3Props: Partial<A3ToolProps>
    createdAt: string
}
