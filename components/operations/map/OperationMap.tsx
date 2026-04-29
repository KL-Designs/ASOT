'use client'

import { useEffect, useRef } from 'react'
import type { MapLayer, MapAnnotation, MapPresenceUser, DrawingTool, AnnotationProperties, MapWorld, MapMode } from './types'

// ── GeoJSON layer definitions (rendered in order, back → front) ──────────────
// detail:true layers only appear at DETAIL_MIN_ZOOM or closer to avoid rendering
// thousands of features when zoomed out
const DETAIL_MIN_ZOOM = -2

interface LabelStyle { fontSize: number; color: string; fontWeight?: number; outlineColor?: string }

const GEO_LAYERS: Array<{ path: string; style: Record<string, unknown>; detail?: boolean; labelStyle?: LabelStyle; spotHeight?: boolean }> = [
    { path: 'forest',                 style: { fillColor: '#2a4019', color: '#1e3010', weight: 0.3, fillOpacity: 0.55 } },
    { path: 'mounts',                 style: {}, detail: true, spotHeight: true },
    { path: 'runway',                 style: { fillColor: '#4a4848', color: '#2a2828', weight: 0.5, fillOpacity: 0.8 } },
    { path: 'house',                  style: { fillColor: '#6a5a4a', color: '#3a2e24', weight: 0.3, fillOpacity: 0.85 }, detail: true },
    { path: 'ruin',                   style: { fillColor: '#4a3a2a', color: '#2a1a0a', weight: 0.3, fillOpacity: 0.5 }, detail: true },
    { path: 'roads/main_road',        style: { color: '#9a8d6a', weight: 3,   fill: false } },
    { path: 'roads/main_road-bridge', style: { color: '#9a8d6a', weight: 3,   fill: false } },
    { path: 'roads/road',             style: { color: '#b0a07a', weight: 1.5, fill: false }, detail: true },
    { path: 'roads/road-bridge',      style: { color: '#b0a07a', weight: 1.5, fill: false }, detail: true },
    { path: 'roads/track',            style: { color: '#a09070', weight: 1,   dashArray: '4,3', fill: false }, detail: true },
    { path: 'roads/track-bridge',     style: { color: '#a09070', weight: 1,   fill: false }, detail: true },
    { path: 'powerline',              style: { color: '#606060', weight: 0.8, dashArray: '4,4', fill: false }, detail: true },
    // Location labels — point features rendered as divIcon text markers
    { path: 'locations/namecitycapital', style: {}, labelStyle: { fontSize: 14, color: '#1a1a2e', fontWeight: 700, outlineColor: '#d8cfa8' } },
    { path: 'locations/namecity',        style: {}, labelStyle: { fontSize: 12, color: '#1a1a2e', fontWeight: 600, outlineColor: '#d8cfa8' } },
    { path: 'locations/namemarine',      style: {}, labelStyle: { fontSize: 11, color: '#1a3a5e', fontWeight: 500, outlineColor: '#c8dff0' } },
    { path: 'locations/namevillage',     style: {}, detail: true, labelStyle: { fontSize: 11, color: '#2a2a2e', fontWeight: 500, outlineColor: '#d8cfa8' } },
    { path: 'locations/namelocal',       style: {}, detail: true, labelStyle: { fontSize: 10, color: '#3a3a4e', fontWeight: 400, outlineColor: '#d8cfa8' } },
    { path: 'locations/hill',            style: {}, detail: true, labelStyle: { fontSize: 10, color: '#4a3a2a', fontWeight: 400, outlineColor: '#d8cfa8' } },
]


async function fetchGzJson(url: string): Promise<unknown> {
    try {
        const res = await fetch(url)
        if (!res.ok || !res.body) return null
        const ds = new DecompressionStream('gzip')
        return JSON.parse(await new Response(res.body.pipeThrough(ds)).text())
    } catch {
        return null
    }
}

function outsideBg(rgba?: [number, number, number, number]): string {
    if (!rgba) return '#2a3040'
    const [r, g, b] = rgba
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
}

const DEFAULT_PROPS: AnnotationProperties = {
    color: '#db001d',
    weight: 2,
    fillColor: '#db001d',
    fillOpacity: 0.2,
}

interface Props {
    world: MapWorld | null
    mapMode: MapMode
    layers: MapLayer[]
    annotations: MapAnnotation[]
    peers: MapPresenceUser[]
    activeTool: DrawingTool
    activeLayerId: string | null
    activeColor: string
    canEdit: boolean
    onAnnotationAdd: (type: DrawingTool, geometry: number[][], properties: Partial<AnnotationProperties>) => void
    onAnnotationUpdate: (id: string, geometry: number[][]) => void
    onAnnotationRemove: (id: string) => void
    onCursorMove: (pos: [number, number] | null) => void
    onToolDone: () => void
}

// Converts Arma3 coords to Leaflet LatLng (metres → degrees using Simple CRS scaling)
// Leaflet CRS.Simple treats lat/lng as direct pixel coords, so we use [y, x] (lat = northing = y)
function armaToLatLng(x: number, y: number): [number, number] {
    return [y, x]
}

function latLngToArma(lat: number, lng: number): [number, number] {
    return [lng, lat]
}

// Build Leaflet path options from annotation properties and layer color
function pathOptions(ann: MapAnnotation, layer: MapLayer | undefined) {
    const color = ann.properties.color || layer?.color || '#db001d'
    return {
        color,
        weight: ann.properties.weight ?? 2,
        fillColor: ann.properties.fillColor || color,
        fillOpacity: ann.properties.fillOpacity ?? 0.2,
        interactive: true,
    }
}

export default function OperationMap({
    world,
    mapMode,
    layers,
    annotations,
    peers,
    activeTool,
    activeLayerId,
    activeColor,
    canEdit,
    onAnnotationAdd,
    onAnnotationUpdate,
    onAnnotationRemove,
    onCursorMove,
    onToolDone,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<L.Map | null>(null)
    const satOverlaysRef = useRef<L.ImageOverlay[]>([])
    const geoJsonCacheRef = useRef<Map<string, { all: L.FeatureGroup; detail: L.FeatureGroup }>>(new Map())
    const lastFitWorldRef = useRef<string | null>(null)
    const annotationLayersRef = useRef<Map<string, L.Layer>>(new Map())
    const peerMarkersRef = useRef<Map<string, L.Marker>>(new Map())
    const spotHeightsCacheRef = useRef<Map<string, Array<{ latlng: any; elev: number }>>>(new Map())
    const spotHeightsDataRef = useRef<Array<{ latlng: any; elev: number }>>([])
    const spotHeightGroupRef = useRef<any>(null)
    const updateSpotHeightsRef = useRef<(() => void) | null>(null)
    // Always-current refs so the async init callback can read them without deps
    const worldRef = useRef(world)
    worldRef.current = world
    const mapModeRef = useRef(mapMode)
    mapModeRef.current = mapMode

    // Drawing state
    const drawingRef = useRef<{
        tool: DrawingTool
        points: L.LatLng[]
        previewLayer: L.Layer | null
        startLatLng: L.LatLng | null
    }>({ tool: null, points: [], previewLayer: null, startLatLng: null })

    // ── Init Leaflet ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return

        let destroyed = false

        import('leaflet').then(async mod => {
            if (destroyed || mapRef.current || !containerRef.current) return

            const L = mod.default ?? mod

            function updateSpotHeights() {
                const map = mapRef.current
                if (!map) return
                if (spotHeightGroupRef.current) {
                    map.removeLayer(spotHeightGroupRef.current)
                    spotHeightGroupRef.current = null
                }
                if (spotHeightsDataRef.current.length === 0) return
                let bounds: L.LatLngBounds
                try { bounds = map.getBounds() } catch { return }
                const inBounds = spotHeightsDataRef.current.filter(p => bounds.contains(p.latlng))
                if (inBounds.length === 0) return
                inBounds.sort((a, b) => b.elev - a.elev)
                const zoom = map.getZoom()
                const cap = Math.max(5, Math.min(100, Math.round(5 * Math.pow(2, zoom + 3))))
                const MIN_PX = 40
                const MIN_PX_SAME_ELEV = 100
                const selected: typeof inBounds = []
                for (const point of inBounds) {
                    if (selected.length >= cap) break
                    const pt = map.latLngToContainerPoint(point.latlng)
                    let tooClose = false
                    for (const s of selected) {
                        const sp = map.latLngToContainerPoint(s.latlng)
                        const dx = pt.x - sp.x, dy = pt.y - sp.y
                        const threshold = s.elev === point.elev ? MIN_PX_SAME_ELEV : MIN_PX
                        if (dx * dx + dy * dy < threshold * threshold) { tooClose = true; break }
                    }
                    if (!tooClose) selected.push(point)
                }
                const group = L.layerGroup()
                for (const p of selected) {
                    const html = `<div style="position:relative;pointer-events:none;"><div style="width:3px;height:3px;background:#5a4838;border-radius:50%;"></div><span style="position:absolute;top:-8px;left:5px;font-size:9px;color:#5a4838;white-space:nowrap;font-family:sans-serif;line-height:1;">${p.elev}</span></div>`
                    L.marker(p.latlng, { icon: L.divIcon({ className: '', html, iconAnchor: [1, 2] }), interactive: false }).addTo(group)
                }
                group.addTo(map)
                spotHeightGroupRef.current = group
            }
            updateSpotHeightsRef.current = updateSpotHeights

            delete (L.Icon.Default.prototype as any)._getIconUrl
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            })

            const map = L.map(containerRef.current, {
                crs: L.CRS.Simple,
                minZoom: -6,
                maxZoom: 4,
                zoomControl: true,
                attributionControl: false,
            })

            mapRef.current = map

            // Terrain image pane sits below vector overlays
            const tPane = map.createPane('terrainPane')
            tPane.style.zIndex = '350'
            tPane.style.pointerEvents = 'none'

            // Toggle detail group visibility on zoom
            map.on('zoomend', () => {
                if (mapModeRef.current === 'sat') return
                const cached = geoJsonCacheRef.current.get(`${worldRef.current?.name ?? ''}-${mapModeRef.current}`)
                if (!cached) return
                const show = map.getZoom() >= DETAIL_MIN_ZOOM
                if (show && !map.hasLayer(cached.detail)) cached.detail.addTo(map)
                else if (!show && map.hasLayer(cached.detail)) map.removeLayer(cached.detail)
                updateSpotHeights()
            })
            map.on('moveend', () => {
                if (mapModeRef.current === 'sat') return
                updateSpotHeights()
            })

            const w = worldRef.current
            if (w) {
                await applyContent(L, map, w, mapModeRef.current)
            } else {
                map.setView([0, 0], 0)
            }
        })

        return () => {
            destroyed = true
            mapRef.current?.remove()
            mapRef.current = null
        }
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    // ── Swap content when world or mode changes ──────────────────────────────
    useEffect(() => {
        const map = mapRef.current
        if (!map) return  // init callback handles the first load
        import('leaflet').then(async mod => {
            await applyContent(mod.default ?? mod, map, world, mapMode)
        })
    }, [world, mapMode])  // eslint-disable-line react-hooks/exhaustive-deps

    async function applyContent(
        L: typeof import('leaflet'),
        map: L.Map,
        w: MapWorld | null,
        mode: MapMode,
    ) {
        // Clear sat overlays
        satOverlaysRef.current.forEach(o => map.removeLayer(o))
        satOverlaysRef.current = []
        // Hide all cached GeoJSON groups (don't destroy — keep for re-use)
        geoJsonCacheRef.current.forEach(c => {
            if (map.hasLayer(c.all)) map.removeLayer(c.all)
            if (map.hasLayer(c.detail)) map.removeLayer(c.detail)
        })

        // Remove spot height layer (raw data stays cached per world)
        if (spotHeightGroupRef.current) {
            map.removeLayer(spotHeightGroupRef.current)
            spotHeightGroupRef.current = null
        }

        if (!w) return

        spotHeightsDataRef.current = spotHeightsCacheRef.current.get(w.name) ?? []

        if (mode === 'sat') {
            // GRAD Meh: sat/{col}/{row}.png, row 0 = northernmost
            const { worldSize, satTiles: n, name } = w
            const tileM = worldSize / n
            for (let col = 0; col < n; col++) {
                for (let row = 0; row < n; row++) {
                    const southLat = worldSize - (row + 1) * tileM
                    const northLat = worldSize - row * tileM
                    const bounds: L.LatLngBoundsLiteral = [[southLat, col * tileM], [northLat, (col + 1) * tileM]]
                    const overlay = L.imageOverlay(`/maps/${name}/sat/${col}/${row}.png`, bounds)
                    overlay.addTo(map)
                    satOverlaysRef.current.push(overlay)
                }
            }
        } else {
            // mode === 'map' (simplified topo) or 'terrain' (coloured DEM) — cached per world+mode
            const cacheKey = `${w.name}-${mode}`
            let cached = geoJsonCacheRef.current.get(cacheKey)
            if (!cached) {
                const renderer = L.canvas()
                const all = L.featureGroup()
                const detail = L.featureGroup()

                // Base layer
                if (mode === 'terrain') {
                    if (w.hasTerrain) {
                        L.imageOverlay(
                            `/maps/${w.name}/terrain.png`,
                            [[0, 0], [w.worldSize, w.worldSize]],
                            { pane: 'terrainPane', interactive: false },
                        ).addTo(all)
                    } else {
                        L.rectangle(
                            [[0, 0], [w.worldSize, w.worldSize]],
                            Object.assign({ color: 'transparent', weight: 0, fillColor: '#5e7048', fillOpacity: 1, interactive: false }, { renderer }),
                        ).addTo(all)
                    }
                } else {
                    // map mode: coastline.png shows real land/ocean shape; fallback to solid rect
                    if (w.hasCoastline) {
                        L.imageOverlay(
                            `/maps/${w.name}/coastline.png`,
                            [[0, 0], [w.worldSize, w.worldSize]],
                            { pane: 'terrainPane', interactive: false },
                        ).addTo(all)
                    } else {
                        L.rectangle(
                            [[0, 0], [w.worldSize, w.worldSize]],
                            Object.assign({ color: '#8aaa78', weight: 1.5, fillColor: '#f5f0e8', fillOpacity: 1, interactive: false }, { renderer }),
                        ).addTo(all)
                    }
                }

                // Contour lines
                if (w.hasContours) {
                    const contourData = await fetchGzJson(`/maps/${w.name}/contours.geojson.gz`)
                    if (contourData) {
                        L.geoJSON(contourData as GeoJSON.FeatureCollection, Object.assign({} as L.GeoJSONOptions, {
                            renderer,
                            style: (feature: unknown) => {
                                const major = (feature as GeoJSON.Feature)?.properties?.major as boolean
                                return mode === 'terrain'
                                    ? { color: '#8a7055', weight: major ? 1.2 : 0.5, opacity: major ? 0.75 : 0.45, fill: false }
                                    : { color: '#b08040', weight: major ? 1.0 : 0.4, opacity: major ? 0.9 : 0.6, fill: false }
                            },
                        })).addTo(all)
                    }
                }

                const newSpotHeights: Array<{ latlng: L.LatLng; elev: number }> = []

                await Promise.all(GEO_LAYERS.map(async ({ path, style, detail: isDetail, labelStyle, spotHeight }) => {
                    const data = await fetchGzJson(`/maps/${w.name}/geojson/${path}.geojson.gz`)
                    if (!data) return

                    if (spotHeight) {
                        // Use Leaflet's own GeoJSON parser to collect latlng+elev without adding visible markers
                        L.geoJSON(data as GeoJSON.FeatureCollection, {
                            pointToLayer: (feature: unknown, latlng: L.LatLng) => {
                                const elev = Math.round((feature as GeoJSON.Feature)?.properties?.elevation ?? 0)
                                if (elev > 0) newSpotHeights.push({ latlng, elev })
                                return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 })
                            },
                        })
                        return
                    }

                    const target = isDetail ? detail : all
                    const ls = labelStyle
                    L.geoJSON(
                        data as GeoJSON.FeatureCollection,
                        Object.assign({} as L.GeoJSONOptions, {
                            renderer,
                            style: style as L.PathOptions,
                            pointToLayer: (feature: unknown, latlng: L.LatLng) => {
                                if (ls) {
                                    const name = (feature as GeoJSON.Feature)?.properties?.name ?? ''
                                    if (!name) return L.circleMarker(latlng, { renderer, radius: 0, opacity: 0, fillOpacity: 0 })
                                    const shadow = `0 0 3px ${ls.outlineColor ?? '#fff'},0 0 3px ${ls.outlineColor ?? '#fff'}`
                                    const html = `<span style="color:${ls.color};font-size:${ls.fontSize}px;font-weight:${ls.fontWeight ?? 500};text-shadow:${shadow};white-space:nowrap;pointer-events:none;font-family:sans-serif;">${name}</span>`
                                    const icon = L.divIcon({ className: '', html, iconAnchor: [0, ls.fontSize / 2] })
                                    return L.marker(latlng, { icon, interactive: false })
                                }
                                return L.circleMarker(latlng, Object.assign({ renderer, radius: 2 }, style as L.CircleMarkerOptions))
                            },
                        }),
                    ).addTo(target)
                }))

                spotHeightsCacheRef.current.set(w.name, newSpotHeights)
                spotHeightsDataRef.current = newSpotHeights
                cached = { all, detail }
                geoJsonCacheRef.current.set(cacheKey, cached)
            }
            cached.all.addTo(map)
            if (map.getZoom() >= DETAIL_MIN_ZOOM) cached.detail.addTo(map)
            updateSpotHeightsRef.current?.()
        }

        // Only re-fit when the world changes, not on mode toggle
        if (w.name !== lastFitWorldRef.current) {
            map.fitBounds([[0, 0], [w.worldSize, w.worldSize]])
            lastFitWorldRef.current = w.name
        }
    }

    // ── Render annotations ───────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        import('leaflet').then(mod => {
            const L = mod.default ?? mod

            const currentIds = new Set(annotations.map(a => a.id))
            const layerById = new Map(layers.map(l => [l.id, l]))

            // Remove stale
            annotationLayersRef.current.forEach((leafletLayer, id) => {
                if (!currentIds.has(id)) {
                    map.removeLayer(leafletLayer)
                    annotationLayersRef.current.delete(id)
                }
            })

            for (const ann of annotations) {
                const layer = layerById.get(ann.layerId)
                const visible = layer?.visible !== false
                const opts = pathOptions(ann, layer)
                const existing = annotationLayersRef.current.get(ann.id)

                if (existing) {
                    // Update visibility
                    if (visible && !map.hasLayer(existing)) map.addLayer(existing)
                    if (!visible && map.hasLayer(existing)) map.removeLayer(existing)
                    // Update style for path types
                    if ('setStyle' in existing) (existing as L.Path).setStyle(opts)
                    continue
                }

                // Create new
                let leafletLayer: L.Layer | null = null
                const geo = ann.geometry

                switch (ann.type) {
                    case 'polyline': {
                        const latlngs = geo.map(([lat, lng]) => L.latLng(lat, lng))
                        leafletLayer = L.polyline(latlngs, opts)
                        break
                    }
                    case 'polygon': {
                        const latlngs = geo.map(([lat, lng]) => L.latLng(lat, lng))
                        leafletLayer = L.polygon(latlngs, opts)
                        break
                    }
                    case 'rectangle': {
                        const [[swLat, swLng], [neLat, neLng]] = geo
                        leafletLayer = L.rectangle([[swLat, swLng], [neLat, neLng]], opts)
                        break
                    }
                    case 'circle': {
                        const [[lat, lng]] = geo
                        leafletLayer = L.circle([lat, lng], { ...opts, radius: ann.properties.radius ?? 100 })
                        break
                    }
                    case 'marker': {
                        const [[lat, lng]] = geo
                        leafletLayer = L.marker([lat, lng])
                        if (ann.properties.label) (leafletLayer as L.Marker).bindTooltip(ann.properties.label, { permanent: true, direction: 'top' })
                        break
                    }
                    case 'text': {
                        const [[lat, lng]] = geo
                        const icon = L.divIcon({
                            className: '',
                            html: `<div style="color:${opts.color};font-size:${ann.properties.fontSize ?? 14}px;font-weight:600;white-space:nowrap;text-shadow:0 1px 3px #000;">${ann.properties.label ?? ''}</div>`,
                            iconAnchor: [0, 0],
                        })
                        leafletLayer = L.marker([lat, lng], { icon })
                        break
                    }
                }

                if (!leafletLayer) continue

                if (canEdit) {
                    leafletLayer.on('contextmenu', (e: L.LeafletMouseEvent) => {
                        L.DomEvent.stopPropagation(e)
                        onAnnotationRemove(ann.id)
                    })
                }

                if (visible) leafletLayer.addTo(map)
                annotationLayersRef.current.set(ann.id, leafletLayer)
            }
        })
    }, [annotations, layers, canEdit, onAnnotationRemove])

    // ── Peer cursors ─────────────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        import('leaflet').then(mod => {
            const L = mod.default ?? mod

            const currentNames = new Set(peers.map(p => p.name))

            peerMarkersRef.current.forEach((marker, name) => {
                if (!currentNames.has(name)) {
                    map.removeLayer(marker)
                    peerMarkersRef.current.delete(name)
                }
            })

            for (const peer of peers) {
                if (!peer.cursor) {
                    const existing = peerMarkersRef.current.get(peer.name)
                    if (existing) {
                        map.removeLayer(existing)
                        peerMarkersRef.current.delete(peer.name)
                    }
                    continue
                }

                const [lat, lng] = peer.cursor
                const html = `
                    <div style="position:relative;pointer-events:none;">
                        <div style="width:10px;height:10px;background:${peer.color};border:2px solid #fff;border-radius:50%;"></div>
                        <div style="position:absolute;top:-20px;left:12px;background:${peer.color};color:#fff;font-size:11px;padding:1px 5px;border-radius:3px;white-space:nowrap;">${peer.name}</div>
                    </div>`

                const icon = L.divIcon({ className: '', html, iconAnchor: [5, 5] })
                const existing = peerMarkersRef.current.get(peer.name)
                if (existing) {
                    (existing as L.Marker).setLatLng([lat, lng])
                } else {
                    const marker = L.marker([lat, lng], { icon, interactive: false, zIndexOffset: 1000 })
                    marker.addTo(map)
                    peerMarkersRef.current.set(peer.name, marker)
                }
            }
        })
    }, [peers])

    // ── Drawing tools ────────────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current
        if (!map || !canEdit) return

        let L: typeof import('leaflet')

        const onMouseMove = (e: L.LeafletMouseEvent) => {
            onCursorMove([e.latlng.lat, e.latlng.lng])
            updatePreview(e.latlng)
        }
        const onMouseOut = () => onCursorMove(null)

        const onMapClick = (e: L.LeafletMouseEvent) => {
            const ds = drawingRef.current
            if (!ds.tool) return

            switch (ds.tool) {
                case 'marker':
                case 'text': {
                    const label = ds.tool === 'text' ? window.prompt('Label:') ?? '' : ''
                    onAnnotationAdd(ds.tool, [[e.latlng.lat, e.latlng.lng]], { color: activeColor, label })
                    onToolDone()
                    break
                }
                case 'circle': {
                    if (!ds.startLatLng) {
                        ds.startLatLng = e.latlng
                    } else {
                        const radius = ds.startLatLng.distanceTo(e.latlng)
                        onAnnotationAdd('circle', [[ds.startLatLng.lat, ds.startLatLng.lng]], { color: activeColor, radius })
                        clearPreview()
                        ds.startLatLng = null
                        onToolDone()
                    }
                    break
                }
                case 'polyline':
                case 'polygon': {
                    ds.points.push(e.latlng)
                    break
                }
                case 'rectangle': {
                    if (!ds.startLatLng) {
                        ds.startLatLng = e.latlng
                    }
                    break
                }
            }
        }

        const onMapDblClick = (e: L.LeafletMouseEvent) => {
            const ds = drawingRef.current
            if (ds.tool === 'polyline' && ds.points.length >= 2) {
                onAnnotationAdd('polyline', ds.points.map(p => [p.lat, p.lng]), { color: activeColor })
                clearPreview()
                ds.points = []
                onToolDone()
            } else if (ds.tool === 'polygon' && ds.points.length >= 3) {
                onAnnotationAdd('polygon', ds.points.map(p => [p.lat, p.lng]), { color: activeColor })
                clearPreview()
                ds.points = []
                onToolDone()
            }
        }

        const onMouseDownForRect = (e: L.LeafletMouseEvent) => {
            const ds = drawingRef.current
            if (ds.tool === 'rectangle' && ds.startLatLng) {
                const sw = L.latLng(Math.min(ds.startLatLng.lat, e.latlng.lat), Math.min(ds.startLatLng.lng, e.latlng.lng))
                const ne = L.latLng(Math.max(ds.startLatLng.lat, e.latlng.lat), Math.max(ds.startLatLng.lng, e.latlng.lng))
                onAnnotationAdd('rectangle', [[sw.lat, sw.lng], [ne.lat, ne.lng]], { color: activeColor })
                clearPreview()
                ds.startLatLng = null
                onToolDone()
            }
        }

        const m = map // capture non-null for closures

        function clearPreview() {
            const ds = drawingRef.current
            if (ds.previewLayer) {
                m.removeLayer(ds.previewLayer)
                ds.previewLayer = null
            }
        }

        function updatePreview(latlng: L.LatLng) {
            const ds = drawingRef.current
            if (!ds.tool) return
            clearPreview()

            const opts = { color: activeColor, weight: 2, fillColor: activeColor, fillOpacity: 0.15, dashArray: '5,5', interactive: false }

            if ((ds.tool === 'polyline' || ds.tool === 'polygon') && ds.points.length > 0) {
                const pts = [...ds.points, latlng]
                ds.previewLayer = ds.tool === 'polyline'
                    ? L.polyline(pts, opts).addTo(m)
                    : L.polygon(pts, opts).addTo(m)
            } else if (ds.tool === 'rectangle' && ds.startLatLng) {
                const start = ds.startLatLng
                const bounds: [[number, number], [number, number]] = [
                    [Math.min(start.lat, latlng.lat), Math.min(start.lng, latlng.lng)],
                    [Math.max(start.lat, latlng.lat), Math.max(start.lng, latlng.lng)],
                ]
                ds.previewLayer = L.rectangle(bounds, opts).addTo(m)
            } else if (ds.tool === 'circle' && ds.startLatLng) {
                const radius = ds.startLatLng.distanceTo(latlng)
                ds.previewLayer = L.circle(ds.startLatLng, { ...opts, radius }).addTo(m)
            }
        }

        import('leaflet').then(mod => {
            L = mod.default ?? mod
            map.on('click', onMapClick)
            map.on('dblclick', onMapDblClick)
            map.on('mousemove', onMouseMove)
            map.on('mouseout', onMouseOut)
            // Second click for rectangle finishes it
            map.on('click', onMouseDownForRect)
        })

        return () => {
            map.off('click', onMapClick)
            map.off('dblclick', onMapDblClick)
            map.off('mousemove', onMouseMove)
            map.off('mouseout', onMouseOut)
            map.off('click', onMouseDownForRect)
        }
    }, [canEdit, activeColor, onAnnotationAdd, onCursorMove, onToolDone])

    // Sync active tool into drawing ref
    useEffect(() => {
        const ds = drawingRef.current
        if (ds.tool !== activeTool) {
            // Reset state when tool changes
            ds.points = []
            ds.startLatLng = null
            if (ds.previewLayer && mapRef.current) {
                mapRef.current.removeLayer(ds.previewLayer)
                ds.previewLayer = null
            }
        }
        ds.tool = activeTool
        // Toggle dragging based on tool
        if (mapRef.current) {
            if (activeTool) {
                mapRef.current.dragging.disable()
                mapRef.current.doubleClickZoom.disable()
            } else {
                mapRef.current.dragging.enable()
                mapRef.current.doubleClickZoom.enable()
            }
        }
    }, [activeTool])

    const bg = mapMode === 'sat' ? '#1a1a1a'
             : mapMode === 'terrain' ? outsideBg(world?.colorOutside)
             : '#b0d8e8'  // map mode: light blue ocean

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', background: bg, cursor: activeTool ? 'crosshair' : undefined }}
        />
    )
}
