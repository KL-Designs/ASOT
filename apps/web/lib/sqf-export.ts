import type { MapAnnotation, MapLayer } from '@/components/operations/map/types'
import { metisCreateSqf, readMetis } from '@/lib/operations/metis'

/**
 * A plan drawn on the operation map, as SQF that redraws it in game.
 *
 * Three kinds of annotation have an in-game equivalent and are exported:
 * vanilla icon markers, polylines, and Metis markers. The rest (polygons,
 * rectangles, circles, plain markers, text) are planning aids on the site
 * only.
 *
 * Only what is on a **visible** layer is exported, so turning layers off is
 * how a mission maker chooses which part of the plan goes into the game.
 *
 * The Metis markers are written as one `mts_markers_fnc_createMarker` call
 * each, built by `lib/operations/metis.ts` from the mod's own parameter
 * format. They used to be exported from hand-written lists that did not match
 * the mod, with the HQ and task-force flags in the slot the mod reads as
 * reinforced and reduced — so a plan arrived in game as different units.
 *
 * Running the script again replaces what the last run drew: it keeps the names
 * of what it created in `gtd_map_allMarkers` / `gtd_map_allMetisMarkers` and
 * deletes those first.
 */

// Arma 3 uses [x, y] = [lng, lat] in CRS.Simple
function toArma(lat: number, lng: number): [number, number] {
    return [parseFloat(lng.toFixed(2)), parseFloat(lat.toFixed(2))]
}

/** A string literal SQF cannot be broken out of: quotes are doubled. */
const sqfString = (value: string) => `"${value.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`

export function buildSqf(annotations: MapAnnotation[], layers: MapLayer[]): string {
    const layerById = new Map(layers.map(l => [l.id, l]))

    const icons: string[] = []
    const poly: string[] = []
    const metis: string[] = []
    let counter = 0

    for (const ann of annotations) {
        const layer = layerById.get(ann.layerId)
        if (layer && !layer.visible) continue

        const id = String(++counter)

        if (ann.type === 'a3icon') {
            const [lat, lng] = ann.geometry[0]
            const [x, y] = toArma(lat, lng)
            const markerType = ann.properties.a3MarkerType ?? 'hd_dot'
            const color = ann.properties.a3MarkerColor ?? 'ColorBlack'
            const text = ann.properties.label ?? ''
            const dir = Number(ann.properties.a3MarkerDir ?? 0) || 0
            const scale = Number(ann.properties.a3MarkerScale ?? 1) || 1
            icons.push(`["${id}",${x},${y},${sqfString(markerType)},${sqfString(color)},${sqfString(text)},${dir},${scale}]`)

        } else if (ann.type === 'a3metis') {
            const [lat, lng] = ann.geometry[0]
            const [x, y] = toArma(lat, lng)
            // A marker placed before the Metis rebuild is translated by
            // `readMetis`, so it exports as the unit it was drawn as.
            metis.push(`gtd_map_allMetisMarkers pushBack (${metisCreateSqf(readMetis(ann.properties), x, y)});`)

        } else if (ann.type === 'polyline') {
            // Flatten to [x1,y1,x2,y2,...] for SQF polyline format
            const flat = ann.geometry.flatMap(([lat, lng]) => toArma(lat, lng))
            const color = a3ColorFromHex(layer?.color ?? ann.properties.color)
            poly.push(`["${id}",[${flat.join(',')}],"${color}"]`)
        }
    }

    const iconsArr = icons.length ? `[${icons.join(',\n    ')}]` : '[]'
    const polyArr = poly.length ? `[${poly.join(',\n    ')}]` : '[]'

    return `private _data = [${iconsArr},${polyArr}];

_data params ['_icons', '_poly'];

if (!isNil 'gtd_map_allMarkers') then {
  { deleteMarker _x; } forEach gtd_map_allMarkers;
};
if (!isNil 'gtd_map_allMetisMarkers') then {
  { [_x] call mts_markers_fnc_deleteMarker } forEach gtd_map_allMetisMarkers;
};
gtd_map_allMarkers = [];
gtd_map_allMetisMarkers = [];

{
  _x params ['_id', '_ix', '_iy', '_itype', '_icolor', '_itext', '_idir', ['_iscale', 1]];
  private _m = createMarker [format ['_USER_DEFINED #%1/profiteers_i%2/0', clientOwner, _id], [_ix, _iy], 0];
  _m setMarkerShape 'ICON';
  _m setMarkerDir _idir;
  _m setMarkerColor _icolor;
  _m setMarkerText _itext;
  _m setMarkerType _itype;
  _m setMarkerSize [_iscale, _iscale];
  gtd_map_allMarkers pushBack _m;
} forEach _icons;

{
  _x params ['_id', '_points', '_color'];
  _points params ['_px', '_py'];
  private _m = createMarker [format ['_USER_DEFINED #%1/profiteers_p%2/0', clientOwner, _id], [_px, _py], 0];
  _m setMarkerShape 'polyline';
  _m setMarkerPolyline _points;
  _m setMarkerColor _color;
  gtd_map_allMarkers pushBack _m;
} forEach _poly;

// Metis markers (Metis Marker mod, mts_markers_fnc_createMarker)
${metis.join('\n')}

publicVariable 'gtd_map_allMarkers';
publicVariable 'gtd_map_allMetisMarkers';
`
}

// Best-effort mapping from hex color to nearest Arma 3 color string
function a3ColorFromHex(hex: string): string {
    const map: [string, [number, number, number]][] = [
        ['ColorBlack',  [0,   0,   0]],
        ['ColorWhite',  [255, 255, 255]],
        ['ColorRed',    [255, 0,   0]],
        ['ColorBlue',   [0,   0,   255]],
        ['ColorGreen',  [0,   128, 0]],
        ['ColorYellow', [255, 255, 0]],
        ['ColorOrange', [255, 165, 0]],
        ['ColorPink',   [255, 105, 180]],
        ['ColorWest',   [0,   77,  153]],
        ['ColorEast',   [153, 0,   0]],
        ['ColorGUER',   [0,   77,  0]],
        ['ColorCIV',    [102, 0,   153]],
    ]
    const r = parseInt(hex.slice(1, 3), 16) || 0
    const g = parseInt(hex.slice(3, 5), 16) || 0
    const b = parseInt(hex.slice(5, 7), 16) || 0
    let best = 'ColorBlack', bestDist = Infinity
    for (const [name, [cr, cg, cb]] of map) {
        const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
        if (d < bestDist) { bestDist = d; best = name }
    }
    return best
}

export function downloadSqf(content: string, filename = 'init.sqf') {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}
