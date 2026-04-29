export type AnnotationType = 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'marker' | 'text'

export type DrawingTool = AnnotationType | null

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
}

export interface MapAnnotation {
    id: string
    layerId: string
    type: AnnotationType
    // polyline/polygon: [[lat,lng],...], rectangle: [[swLat,swLng],[neLat,neLng]], circle/marker/text: [lat,lng]
    geometry: number[][]
    properties: AnnotationProperties
}

export interface MapWorld {
    name: string          // directory key, e.g. "altis"
    displayName: string   // e.g. "Altis"
    worldSize: number     // metres, e.g. 30720
    satTiles: number      // number of sat tiles per side (e.g. 4 = 4×4 grid)
}

export interface MapPresenceUser {
    name: string
    color: string
    avatar: string | null
    // null when not hovering over the map
    cursor: [number, number] | null
}
