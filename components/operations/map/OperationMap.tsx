'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { MapLayer, MapAnnotation, MapPresenceUser, DrawingTool, AnnotationProperties, MapWorld } from './types'

// Leaflet loaded client-side only via dynamic import inside effects

const DEFAULT_PROPS: AnnotationProperties = {
    color: '#db001d',
    weight: 2,
    fillColor: '#db001d',
    fillOpacity: 0.2,
}

interface Props {
    world: MapWorld | null
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
    const annotationLayersRef = useRef<Map<string, L.Layer>>(new Map())
    const peerMarkersRef = useRef<Map<string, L.Marker>>(new Map())
    // Always-current world ref so the init callback can read it without a dep
    const worldRef = useRef(world)
    worldRef.current = world

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

        import('leaflet').then(mod => {
            if (destroyed || mapRef.current || !containerRef.current) return

            const L = mod.default ?? mod

            // Fix default marker icon paths broken by webpack
            delete (L.Icon.Default.prototype as any)._getIconUrl
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            })

            const map = L.map(containerRef.current, {
                crs: L.CRS.Simple,
                // minZoom must be negative: at zoom 0, 1 world-unit = 1px.
                // A 30 720 m world needs ~zoom -5 to fit a ~1 200 px viewport.
                minZoom: -6,
                maxZoom: 4,
                zoomControl: true,
                attributionControl: false,
            })

            mapRef.current = map

            // Apply world immediately if it was already set before the map was ready
            const w = worldRef.current
            if (w) {
                applySatOverlays(L, map, w)
            } else {
                map.setView([0, 0], 0)
            }
        })

        return () => {
            destroyed = true
            mapRef.current?.remove()
            mapRef.current = null
        }
    }, [])

    // ── Sat image overlays — swap when world changes ─────────────────────────
    useEffect(() => {
        const map = mapRef.current
        if (!map) return  // map not ready yet; init callback will handle it

        import('leaflet').then(mod => {
            applySatOverlays(mod.default ?? mod, map, world)
        })
    }, [world])

    function applySatOverlays(L: typeof import('leaflet'), map: L.Map, w: typeof world) {
        satOverlaysRef.current.forEach(o => map.removeLayer(o))
        satOverlaysRef.current = []

        if (!w) return

        const { worldSize, satTiles: n, name } = w
        const tileM = worldSize / n

        // GRAD Meh exports sat/{col}/{row}.png where row 0 = northernmost.
        // In Leaflet CRS.Simple lat increases upward, so row 0 → highest lat.
        for (let col = 0; col < n; col++) {
            for (let row = 0; row < n; row++) {
                const southLat = worldSize - (row + 1) * tileM
                const northLat = worldSize - row * tileM
                const westLng  = col * tileM
                const eastLng  = (col + 1) * tileM
                const bounds: L.LatLngBoundsLiteral = [[southLat, westLng], [northLat, eastLng]]
                const overlay = L.imageOverlay(`/maps/${name}/sat/${col}/${row}.png`, bounds)
                overlay.addTo(map)
                satOverlaysRef.current.push(overlay)
            }
        }

        map.fitBounds([[0, 0], [worldSize, worldSize]])
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

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', background: '#1a1a1a', cursor: activeTool ? 'crosshair' : undefined }}
        />
    )
}
