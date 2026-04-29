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

// METIS icon index → label + milsymbol function ID
export const METIS_ICONS = [
    { index: 0,  label: 'Infantry',      sidc: 'GPI'   },
    { index: 1,  label: 'Mech. Inf.',    sidc: 'GPIM'  },
    { index: 2,  label: 'Motor Inf.',    sidc: 'GPIMR' },
    { index: 3,  label: 'Armor',         sidc: 'GPA'   },
    { index: 4,  label: 'Anti-Tank',     sidc: 'GPAT'  },
    { index: 5,  label: 'Artillery',     sidc: 'GPAF'  },
    { index: 6,  label: 'Air Defense',   sidc: 'GPAD'  },
    { index: 7,  label: 'Helicopter',    sidc: 'APMFH' },
    { index: 8,  label: 'Fixed Wing',    sidc: 'APMFF' },
    { index: 9,  label: 'Naval',         sidc: 'SP'    },
    { index: 10, label: 'Support',       sidc: 'GPUSS' },
    { index: 11, label: 'Medical',       sidc: 'GPUSM' },
    { index: 12, label: 'Recon',         sidc: 'GPUSR' },
    { index: 13, label: 'Engineer',      sidc: 'GPE'   },
    { index: 14, label: 'Signal',        sidc: 'GPS'   },
    { index: 15, label: 'Mortar',        sidc: 'GPWM'  },
    { index: 16, label: 'Spec. Ops.',    sidc: 'GPSF'  },
    { index: 17, label: 'Mil. Police',   sidc: 'GPUMP' },
    { index: 37, label: 'Unknown',       sidc: 'GP'    },
] as const

// METIS size value → echelon label + milsymbol SIDC char (goes at SIDC position 11, index 11)
export const METIS_ECHELONS = [
    { size: 0, label: 'None',      milChar: '-', nato: '—'   },
    { size: 1, label: 'Team',      milChar: 'A', nato: '●'   },
    { size: 2, label: 'Squad',     milChar: 'B', nato: '●●'  },
    { size: 3, label: 'Section',   milChar: 'C', nato: '●●●' },
    { size: 4, label: 'Platoon',   milChar: 'D', nato: 'I'   },
    { size: 5, label: 'Company',   milChar: 'E', nato: 'II'  },
    { size: 6, label: 'Battalion', milChar: 'F', nato: 'III' },
    { size: 7, label: 'Regiment',  milChar: 'G', nato: 'X'   },
    { size: 8, label: 'Brigade',   milChar: 'H', nato: 'XX'  },
    { size: 9, label: 'Division',  milChar: 'I', nato: 'XXX' },
] as const

// HQ / Task Force / Feint-Dummy combinations (SIDC position 10, index 10)
export const METIS_HQTF = [
    { index: 0, label: 'None',                           mod11: '-' },
    { index: 1, label: 'Headquarters',                   mod11: 'A' },
    { index: 2, label: 'Feint/Dummy Headquarters',       mod11: 'C' },
    { index: 3, label: 'Task Force',                     mod11: 'E' },
    { index: 4, label: 'Feint/Dummy Task Force',         mod11: 'G' },
    { index: 5, label: 'Task Force Headquarters',        mod11: 'B' },
    { index: 6, label: 'Feint/Dummy Task Force HQ',      mod11: 'D' },
    { index: 7, label: 'Feint/Dummy',                    mod11: 'F' },
] as const

// Mobility modifiers for mod1 (SIDC: 'M' at index 10, char at index 11)
export const METIS_MOB = [
    { index: 0,  label: 'None',             mobChar: ''  },
    { index: 1,  label: 'Wheeled (limited)', mobChar: 'O' },
    { index: 2,  label: 'Wheeled',           mobChar: 'P' },
    { index: 3,  label: 'Tracked',           mobChar: 'Q' },
    { index: 4,  label: 'Wh. + Tracked',    mobChar: 'R' },
    { index: 5,  label: 'Towed',             mobChar: 'S' },
    { index: 6,  label: 'Rail',              mobChar: 'T' },
    { index: 7,  label: 'Over Snow',         mobChar: 'U' },
    { index: 8,  label: 'Sled',              mobChar: 'V' },
    { index: 9,  label: 'Pack Animals',      mobChar: 'W' },
    { index: 10, label: 'Barge',             mobChar: 'X' },
    { index: 11, label: 'Amphibious',        mobChar: 'Y' },
] as const

export interface MapLayer {
    id: string
    name: string
    color: string
    visible: boolean
    order: number
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
    // a3metis fields
    a3SideId?: A3SideId
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
    sideId: A3SideId
    dashed: boolean
    icon: number
    mod1: number
    mod2: number
    size: number
    hqTf: number             // index into METIS_HQTF
    designation: string
    metisScale: number
    assumedFriend: boolean
    reinforced: boolean
    reduced: boolean
    higherFormation: string
    additionalInfo: string
}

export const DEFAULT_A3_PROPS: A3ToolProps = {
    markerType: 'hd_dot',
    markerColor: 'ColorBlack',
    markerDir: 0,
    markerScale: 1,
    sideId: 'blu',
    dashed: false,
    icon: 0,
    mod1: 0,
    mod2: 0,
    size: 0,
    hqTf: 0,
    designation: '',
    metisScale: 1,
    assumedFriend: false,
    reinforced: false,
    reduced: false,
    higherFormation: '',
    additionalInfo: '',
}

export interface MapPresenceUser {
    name: string
    color: string
    avatar: string | null
    // null when not hovering over the map
    cursor: [number, number] | null
}

export interface MapMarkerPreset {
    _id: string
    name: string
    type: 'a3icon' | 'a3metis'
    a3Props: Partial<A3ToolProps>
    createdAt: string
}
