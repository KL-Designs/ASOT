import type { MapAnnotation, MapLayer } from '@/components/operations/map/types'

// Arma 3 uses [x, y] = [lng, lat] in CRS.Simple
function toArma(lat: number, lng: number): [number, number] {
    return [parseFloat(lng.toFixed(2)), parseFloat(lat.toFixed(2))]
}

let _idCounter = 1

function nextId() {
    return String(_idCounter++)
}

export function buildSqf(annotations: MapAnnotation[], layers: MapLayer[]): string {
    _idCounter = 1

    const layerById = new Map(layers.map(l => [l.id, l]))

    const icons: string[] = []
    const poly: string[] = []
    const metis: string[] = []

    for (const ann of annotations) {
        const layer = layerById.get(ann.layerId)
        if (layer && !layer.visible) continue

        const id = nextId()

        if (ann.type === 'a3icon') {
            const [lat, lng] = ann.geometry[0]
            const [x, y] = toArma(lat, lng)
            const markerType = ann.properties.a3MarkerType ?? 'hd_dot'
            const color = ann.properties.a3MarkerColor ?? 'ColorBlack'
            const text = ann.properties.label ?? ''
            const dir = ann.properties.a3MarkerDir ?? 0
            const scale = ann.properties.a3MarkerScale ?? 1
            icons.push(`["${id}",${x},${y},"${markerType}","${color}","${text}",${dir},${scale}]`)

        } else if (ann.type === 'a3metis') {
            const [lat, lng] = ann.geometry[0]
            const [x, y] = toArma(lat, lng)
            const side = ann.properties.a3SideId ?? 'blu'
            const dashed = ann.properties.a3Dashed ? 'true' : 'false'
            const icon = ann.properties.a3Icon ?? 0
            const mod1 = ann.properties.a3Mod1 ?? 0
            const mod2 = ann.properties.a3Mod2 ?? 0
            const size = ann.properties.a3Size ?? 0
            // hqTf: 1,2 → HQ; 3,4 → TF; 5,6 → HQ+TF; 7 → feint only
            const hqTf = ann.properties.a3HqTf ?? 0
            const isHQ = [1, 2, 5, 6].includes(hqTf) ? 'true' : 'false'
            const isTF = [3, 4, 5, 6].includes(hqTf) ? 'true' : 'false'
            const designation = ann.properties.a3Designation ?? ''
            const scale = ann.properties.a3MetisScale ?? 1
            metis.push(`["${id}",${x},${y},"${side}",${dashed},${icon},${mod1},${mod2},${size},${isHQ},${isTF},"${designation}",${scale}]`)

        } else if (ann.type === 'polyline') {
            // Flatten to [x1,y1,x2,y2,...] for SQF polyline format
            const flat = ann.geometry.flatMap(([lat, lng]) => {
                const [x, y] = toArma(lat, lng)
                return [x, y]
            })
            const layer = layerById.get(ann.layerId)
            const color = a3ColorFromHex(layer?.color ?? ann.properties.color)
            poly.push(`["${id}",[${flat.join(',')}],"${color}"]`)
        }
        // Other annotation types (polygon, rectangle, circle, marker, text) are planning tools only — not exported
    }

    const iconsArr = icons.length ? `[${icons.join(',\n    ')}]` : '[]'
    const polyArr = poly.length ? `[${poly.join(',\n    ')}]` : '[]'
    const metisArr = metis.length ? `[${metis.join(',\n    ')}]` : '[]'

    return `private _data = [${iconsArr},${polyArr},${metisArr}];

_data params ['_icons', '_poly', '_metis'];

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

{
  _x params ['_id', '_mx', '_my', '_sideid', '_dashed', '_icon', '_mod1', '_mod2', '_size', '_isHQ', '_isTF', '_designation', ['_scale', 1]];
  private _m = [[_mx,_my], 0, true, [[_sideid, _dashed], [_icon, _mod1, _mod2], [_size, _isHQ, _isTF], [], _designation], _scale * 1.3] call mts_markers_fnc_createMarker;
  gtd_map_allMetisMarkers pushBack _m;
} forEach _metis;

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
