'use client'

import { useState, useEffect } from 'react'
import ms from 'milsymbol'
import type { MapLayer, DrawingTool, A3ToolProps, A3SideId } from './types'
import { A3_ICON_TYPES, METIS_ICONS, METIS_ECHELONS, METIS_HQTF, METIS_MOB, A3_MARKER_COLORS } from './types'
import type { MapYjsActions } from './useMapYjs'

// Correct milsymbol letter-SIDC components for each METIS icon index
const METIS_MIL_MAP: Record<number, { dim: string; fn: string }> = {
    0:  { dim: 'G', fn: 'UCI'   },   // Infantry
    1:  { dim: 'G', fn: 'UCIM'  },   // Mech. Inf. (mechanized)
    2:  { dim: 'G', fn: 'UCIMR' },   // Motor Inf. (motorized)
    3:  { dim: 'G', fn: 'UCA'   },   // Armor
    4:  { dim: 'G', fn: 'UCAT'  },   // Anti-Tank
    5:  { dim: 'G', fn: 'UCF'   },   // Artillery
    6:  { dim: 'G', fn: 'UCD'   },   // Air Defense
    7:  { dim: 'A', fn: 'MFH'   },   // Helicopter (rotary wing)
    8:  { dim: 'A', fn: 'MFF'   },   // Fixed Wing
    9:  { dim: 'S', fn: 'C'     },   // Naval (surface combatant)
    10: { dim: 'G', fn: 'US'    },   // Support
    11: { dim: 'G', fn: 'USM'   },   // Medical
    12: { dim: 'G', fn: 'UCR'   },   // Recon
    13: { dim: 'G', fn: 'UCE'   },   // Engineer
    14: { dim: 'G', fn: 'USS'   },   // Signal
    15: { dim: 'G', fn: 'UCFM'  },   // Mortar
    16: { dim: 'G', fn: 'USF'   },   // Spec. Ops.
    17: { dim: 'G', fn: 'USMP'  },   // Mil. Police
    37: { dim: 'G', fn: ''      },   // Unknown / Generic unit
}

// index 10 = mod11 (HQ/TF/feint char), index 11 = echelon char
function buildSidc(dim: string, fn: string, sideId: string, dashed: boolean, echelonChar: string, mod11 = '-', assumedFriend = false): string {
    const affil: Record<string, string> = { blu: assumedFriend ? 'G' : 'F', red: 'H', grn: 'N', unk: 'U' }
    const a = affil[sideId] ?? 'F'
    const status = dashed ? 'A' : 'P'
    const base = `S${a}${dim}${status}${fn}`.padEnd(15, '-')
    return (base.slice(0, 10) + mod11 + echelonChar + base.slice(12)).slice(0, 15)
}

// Mobility SIDC: 'M' at index 10, mobChar at index 11
function buildSidcMob(dim: string, fn: string, sideId: string, mobChar: string): string {
    const affil: Record<string, string> = { blu: 'F', red: 'H', grn: 'N', unk: 'U' }
    const a = affil[sideId] ?? 'F'
    const base = `S${a}${dim}P${fn}`.padEnd(15, '-')
    if (!mobChar) return base.slice(0, 15)
    return (base.slice(0, 10) + 'M' + mobChar + base.slice(12)).slice(0, 15)
}

function buildMetisSvg(icon: number, sideId: string, size: number): string {
    const { dim, fn } = METIS_MIL_MAP[icon] ?? { dim: 'G', fn: 'UC' }
    try { return new ms.Symbol(buildSidc(dim, fn, sideId, false, '-', '-'), { size }).asSVG() } catch { return '' }
}

function buildMetisSvgFull(props: A3ToolProps, size: number): string {
    const { dim, fn } = METIS_MIL_MAP[props.icon] ?? { dim: 'G', fn: 'UC' }
    const echelonChar = METIS_ECHELONS.find(e => e.size === props.size)?.milChar ?? '-'
    const mod11 = METIS_HQTF.find(h => h.index === props.hqTf)?.mod11 ?? '-'
    const sidc = buildSidc(dim, fn, props.sideId, props.dashed, echelonChar, mod11, props.assumedFriend)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { return new ms.Symbol(sidc, { size, reinforced: props.reinforced ? 1 : 0, reduced: props.reduced ? 1 : 0 } as any).asSVG() } catch { return '' }
}

// Render a symbol with only the mobility modifier (infantry base)
function buildMob1Svg(mobChar: string, sideId: string, size: number): string {
    const sidc = buildSidcMob('G', 'UCI', sideId, mobChar)
    try { return new ms.Symbol(sidc, { size }).asSVG() } catch { return '' }
}

// Render using a specific letter SIDC (for mod2 items); replace affiliation char
function buildMod2Svg(letterSidc: string | null, sideId: string, size: number): string {
    const affil: Record<string, string> = { blu: 'F', red: 'H', grn: 'N', unk: 'U' }
    const a = affil[sideId] ?? 'F'
    const sidc = letterSidc
        ? letterSidc[0] + a + letterSidc.slice(2)
        : buildSidc('G', 'UCI', sideId, false, '-', '-')
    try { return new ms.Symbol(sidc, { size }).asSVG() } catch { return '' }
}

const METIS_MOD2 = [
    { index: 0, label: 'None',    letterSidc: null as string | null },
    { index: 1, label: 'Airborne', letterSidc: 'SFGPUCIA------' },
    { index: 2, label: 'Mountain', letterSidc: 'SFGPUCIO------' },
    { index: 3, label: 'Arctic',   letterSidc: 'SFGPUCIC------' },
]

interface Props {
    layers: MapLayer[]
    activeLayerId: string | null
    activeTool: DrawingTool
    activeColor: string
    activeA3Props: A3ToolProps
    canEdit: boolean
    actions: MapYjsActions
    onLayerSelect: (id: string) => void
    onToolChange: (tool: DrawingTool) => void
    onColorChange: (color: string) => void
    onA3PropsChange: (patch: Partial<A3ToolProps>) => void
}

const TOOLS: { id: DrawingTool; label: string; icon: string }[] = [
    { id: 'polyline',  label: 'Line',      icon: '╱'  },
    { id: 'polygon',   label: 'Polygon',   icon: '⬡'  },
    { id: 'rectangle', label: 'Rectangle', icon: '▭'  },
    { id: 'circle',    label: 'Circle',    icon: '◯'  },
    { id: 'marker',    label: 'Marker',    icon: '📍' },
    { id: 'text',      label: 'Text',      icon: 'T'  },
    { id: 'a3icon',    label: 'A3 Icon',   icon: '★'  },
    { id: 'a3metis',   label: 'METIS',     icon: '⬟'  },
]

const PRESET_COLORS = ['#db001d', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#ffffff']

const ICON_GROUPS = ['Generic', 'Shape', 'BLUFOR', 'OPFOR', 'IND', 'CIV'] as const

const SIDES: { id: string; label: string; color: string }[] = [
    { id: 'blu', label: 'BLUFOR', color: '#0055aa' },
    { id: 'red', label: 'OPFOR',  color: '#aa0000' },
    { id: 'grn', label: 'IND',    color: '#007700' },
    { id: 'unk', label: 'UNK',    color: '#888800' },
]

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }
const label: React.CSSProperties = { fontSize: 10, color: 'rgba(255,255,255,0.45)', width: 52, flexShrink: 0 }
const numInput: React.CSSProperties = {
    width: 52, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#eee', borderRadius: 3, padding: '2px 5px', fontSize: 11,
}


export default function LayersPanel({
    layers,
    activeLayerId,
    activeTool,
    activeColor,
    activeA3Props,
    canEdit,
    actions,
    onLayerSelect,
    onToolChange,
    onColorChange,
    onA3PropsChange,
}: Props) {
    const [newLayerName, setNewLayerName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')
    const [iconGroup, setIconGroup] = useState<typeof ICON_GROUPS[number]>('Generic')
    const [activeTab, setActiveTab] = useState<'layers' | 'presets'>('layers')
    const [presets, setPresets] = useState<import('./types').MapMarkerPreset[]>([])
    const [presetsLoading, setPresetsLoading] = useState(false)
    const [savePresetName, setSavePresetName] = useState('')
    const [showSavePreset, setShowSavePreset] = useState(false)

    // Fetch presets when tab opens
    useEffect(() => {
        if (activeTab !== 'presets') return
        setPresetsLoading(true)
        fetch('/api/map-presets')
            .then(r => r.json())
            .then(d => setPresets(d.presets ?? []))
            .catch(() => {})
            .finally(() => setPresetsLoading(false))
    }, [activeTab])

    function savePreset(type: 'a3icon' | 'a3metis') {
        const name = savePresetName.trim() || (type === 'a3icon' ? 'A3 Icon' : 'METIS Marker')
        fetch('/api/map-presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, a3Props: activeA3Props }),
        })
            .then(r => r.json())
            .then(d => {
                if (d.preset) setPresets(prev => [d.preset, ...prev])
                setSavePresetName('')
                setShowSavePreset(false)
            })
            .catch(() => {})
    }

    function deletePreset(id: string) {
        fetch(`/api/map-presets/${id}`, { method: 'DELETE' })
            .then(() => setPresets(prev => prev.filter(p => p._id !== id)))
            .catch(() => {})
    }

    function handleAddLayer() {
        const name = newLayerName.trim() || `Layer ${layers.length + 1}`
        const id = actions.addLayer(name, activeColor)
        setNewLayerName('')
        if (id) onLayerSelect(id)
    }

    function startEditing(layer: MapLayer) {
        setEditingId(layer.id)
        setEditingName(layer.name)
    }

    function commitEdit(id: string) {
        if (editingName.trim()) actions.updateLayer(id, { name: editingName.trim() })
        setEditingId(null)
    }

    const toolInstruction =
        activeTool === 'polyline' || activeTool === 'polygon' ? 'Click to add points · Double-click to finish'
        : activeTool === 'rectangle' || activeTool === 'circle' ? 'Click start · Click end'
        : activeTool === 'a3icon' || activeTool === 'a3metis' ? 'Drag preview onto map to place'
        : activeTool === 'marker' ? 'Click map to place'
        : 'Click to place'

    return (
        <div style={{
            width: 260,
            background: 'rgba(15,15,15,0.95)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            fontSize: 13,
            color: '#eee',
            overflowY: 'auto',
        }}>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                {(['layers', 'presets'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer',
                            background: activeTab === tab ? 'rgba(255,255,255,0.06)' : 'transparent',
                            color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.4)',
                            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                            borderBottom: activeTab === tab ? '2px solid rgba(255,255,255,0.5)' : '2px solid transparent',
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* ── PRESETS TAB ──────────────────────────────────────────── */}
            {activeTab === 'presets' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                        Marker Presets
                    </div>
                    {presetsLoading && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>}
                    {!presetsLoading && presets.length === 0 && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                            No presets yet. Configure an A3 Icon or METIS marker in the Layers tab, then save it as a preset.
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {presets.map(preset => {
                            const svgHtml = preset.type === 'a3metis' && preset.a3Props
                                ? (() => {
                                    try {
                                        const p = preset.a3Props as A3ToolProps
                                        return buildMetisSvgFull({ ...p, sideId: p.sideId ?? 'blu', icon: p.icon ?? 0, size: p.size ?? 0, hqTf: p.hqTf ?? 0, dashed: p.dashed ?? false, designation: p.designation ?? '', metisScale: p.metisScale ?? 1, assumedFriend: p.assumedFriend ?? false, reinforced: p.reinforced ?? false, reduced: p.reduced ?? false, mod1: p.mod1 ?? 0, mod2: p.mod2 ?? 0, markerType: p.markerType ?? 'hd_dot', markerColor: p.markerColor ?? 'ColorBlack', markerDir: p.markerDir ?? 0, markerScale: p.markerScale ?? 1, higherFormation: p.higherFormation ?? '', additionalInfo: p.additionalInfo ?? '' }, 28)
                                    } catch { return '' }
                                })()
                                : null
                            return (
                                <div
                                    key={preset._id}
                                    draggable
                                    onDragStart={e => {
                                        e.dataTransfer.setData('map-marker-type', preset.type)
                                        e.dataTransfer.setData('map-preset-id', preset._id)
                                        const p = preset.a3Props as Partial<A3ToolProps>
                                        onA3PropsChange(p)
                                        const svg = e.currentTarget.querySelector('svg')
                                        const img = e.currentTarget.querySelector('img')
                                        if (svg) e.dataTransfer.setDragImage(svg, 14, 14)
                                        else if (img) e.dataTransfer.setDragImage(img, 10, 10)
                                    }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 8px', borderRadius: 4, cursor: 'grab',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                    }}
                                >
                                    <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: preset.type === 'a3metis' ? '#fff' : 'transparent', borderRadius: 3 }}>
                                        {svgHtml
                                            ? <span dangerouslySetInnerHTML={{ __html: svgHtml }} style={{ lineHeight: 0 }} />
                                            : <img src={`/markers/icons/${(preset.a3Props as any).markerType ?? 'hd_dot'}.png`} width={20} height={20} style={{ imageRendering: 'pixelated' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                        }
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.name}</div>
                                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{preset.type === 'a3metis' ? 'METIS' : 'A3 Icon'}</div>
                                    </div>
                                    <button
                                        onClick={() => deletePreset(preset._id)}
                                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                                        title="Delete preset"
                                    >×</button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── LAYERS TAB ───────────────────────────────────────────── */}
            {activeTab === 'layers' && <>

            {/* Drawing tools */}
            {canEdit && (
                <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                        Draw
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {TOOLS.map(t => (
                            <button
                                key={t.id}
                                title={t.label}
                                onClick={() => onToolChange(activeTool === t.id ? null : t.id)}
                                style={{
                                    width: 36,
                                    height: 36,
                                    border: `1px solid ${activeTool === t.id ? activeColor : 'rgba(255,255,255,0.15)'}`,
                                    background: activeTool === t.id ? `${activeColor}22` : 'rgba(255,255,255,0.04)',
                                    color: activeTool === t.id ? activeColor : '#ccc',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {t.icon}
                            </button>
                        ))}
                    </div>

                    {activeTool && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                            {toolInstruction}
                        </div>
                    )}

                    {/* Color picker — shown for non-A3 tools */}
                    {activeTool !== 'a3icon' && activeTool !== 'a3metis' && (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            {PRESET_COLORS.map(c => (
                                <div
                                    key={c}
                                    onClick={() => onColorChange(c)}
                                    style={{
                                        width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer',
                                        border: activeColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                        flexShrink: 0,
                                    }}
                                />
                            ))}
                            <input
                                type="color"
                                value={activeColor}
                                onChange={e => onColorChange(e.target.value)}
                                style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                                title="Custom color"
                            />
                        </div>
                    )}

                    {/* ── A3 Icon properties ─────────────────────────────── */}
                    {activeTool === 'a3icon' && (
                        <div style={{ marginTop: 6 }}>
                            {/* Group tabs */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
                                {ICON_GROUPS.map(g => (
                                    <button
                                        key={g}
                                        onClick={() => setIconGroup(g)}
                                        style={{
                                            fontSize: 9, padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
                                            background: iconGroup === g ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            color: iconGroup === g ? '#fff' : 'rgba(255,255,255,0.5)',
                                        }}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                            {/* Icon grid */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8, maxHeight: 120, overflowY: 'auto' }}>
                                {A3_ICON_TYPES.filter(t => t.group === iconGroup).map(t => (
                                    <button
                                        key={t.key}
                                        title={t.key}
                                        onClick={() => onA3PropsChange({ markerType: t.key })}
                                        style={{
                                            fontSize: 9, padding: '2px 4px', borderRadius: 3, cursor: 'pointer',
                                            background: activeA3Props.markerType === t.key ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${activeA3Props.markerType === t.key ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                            color: activeA3Props.markerType === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
                                            display: 'flex', alignItems: 'center', gap: 3,
                                        }}
                                    >
                                        <img
                                            src={`/markers/icons/${t.key}.png`}
                                            alt=""
                                            width={14} height={14}
                                            style={{ imageRendering: 'pixelated', opacity: 0.9 }}
                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                        />
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            {/* A3 color */}
                            <div style={row}>
                                <span style={label}>Color</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {A3_MARKER_COLORS.map(c => (
                                        <div
                                            key={c.key}
                                            title={c.label}
                                            onClick={() => onA3PropsChange({ markerColor: c.key })}
                                            style={{
                                                width: 14, height: 14, borderRadius: 2,
                                                background: c.hex, cursor: 'pointer',
                                                border: activeA3Props.markerColor === c.key ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            {/* Dir + Scale */}
                            <div style={row}>
                                <span style={label}>Dir</span>
                                <input type="number" min={0} max={360} step={5} style={numInput}
                                    value={activeA3Props.markerDir}
                                    onChange={e => onA3PropsChange({ markerDir: Number(e.target.value) })} />
                                <span style={{ ...label, width: 32 }}>Scale</span>
                                <input type="number" min={0.1} max={10} step={0.1} style={numInput}
                                    value={activeA3Props.markerScale}
                                    onChange={e => onA3PropsChange({ markerScale: Number(e.target.value) })} />
                            </div>
                            {/* Draggable preview + save preset */}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                                <div
                                    draggable
                                    onDragStart={e => {
                                        e.dataTransfer.setData('map-marker-type', 'a3icon')
                                        const img = e.currentTarget.querySelector('img')
                                        if (img) e.dataTransfer.setDragImage(img, 10, 10)
                                    }}
                                    title="Drag onto map to place"
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 36, height: 36, borderRadius: 4, cursor: 'grab',
                                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                                        flexShrink: 0,
                                    }}
                                >
                                    <img src={`/markers/icons/${activeA3Props.markerType}.png`} width={20} height={20}
                                        style={{ imageRendering: 'pixelated' }}
                                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                </div>
                                {showSavePreset
                                    ? <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                        <input
                                            autoFocus
                                            value={savePresetName}
                                            onChange={e => setSavePresetName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') savePreset('a3icon'); if (e.key === 'Escape') setShowSavePreset(false) }}
                                            placeholder="Preset name…"
                                            style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: '#ddd', borderRadius: 3, padding: '3px 5px', fontSize: 11 }}
                                        />
                                        <button onClick={() => savePreset('a3icon')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#eee', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', fontSize: 10 }}>Save</button>
                                    </div>
                                    : <button onClick={() => setShowSavePreset(true)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 3, cursor: 'pointer', padding: '4px 6px', fontSize: 10 }}>Save as Preset</button>
                                }
                            </div>
                        </div>
                    )}

                    {/* ── METIS properties ───────────────────────────────── */}
                    {activeTool === 'a3metis' && (() => {
                        const previewSvg = buildMetisSvgFull(activeA3Props, 56)

                        const selectedMob = METIS_MOB.find(m => m.index === activeA3Props.mod1)
                        const selectedMod2 = METIS_MOD2.find(m => m.index === activeA3Props.mod2)

                        const mobPreviewSvg = buildMob1Svg(selectedMob?.mobChar ?? '', activeA3Props.sideId, 24)
                        const mod2PreviewSvg = buildMod2Svg(selectedMod2?.letterSidc ?? null, activeA3Props.sideId, 24)

                        const divider = <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />
                        const frow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }
                        const flabel: React.CSSProperties = { fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 76, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }
                        const fsel: React.CSSProperties = {
                            flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                            color: '#ddd', borderRadius: 3, padding: '3px 4px', fontSize: 11, cursor: 'pointer',
                        }
                        const finp: React.CSSProperties = {
                            flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                            color: '#ddd', borderRadius: 3, padding: '3px 5px', fontSize: 11,
                        }
                        const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)' }

                        return (
                            <div style={{ marginTop: 6 }}>
                                {/* Live symbol preview — drag onto map to place */}
                                <div
                                    draggable
                                    onDragStart={e => {
                                        e.dataTransfer.setData('map-marker-type', 'a3metis')
                                        const svg = e.currentTarget.querySelector('svg')
                                        if (svg) e.dataTransfer.setDragImage(svg, 14, 14)
                                    }}
                                    title="Drag onto map to place"
                                    style={{
                                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                                        padding: '14px 0', marginBottom: 10,
                                        backgroundColor: '#fff',
                                        backgroundImage: 'linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)',
                                        backgroundSize: '10px 10px',
                                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4,
                                        cursor: 'grab',
                                    }}>
                                    {previewSvg
                                        ? <span dangerouslySetInnerHTML={{ __html: previewSvg }} />
                                        : <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }} />
                                    }
                                </div>

                                {/* Identity */}
                                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>Identity</div>
                                <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                                    {SIDES.map(s => {
                                        const a = ({ blu: 'F', red: 'H', grn: 'N', unk: 'U' } as Record<string, string>)[s.id] ?? 'F'
                                        let svgHtml = ''
                                        try { svgHtml = new ms.Symbol(`S${a}GP----------`, { size: 28 }).asSVG() } catch { /* noop */ }
                                        const sel = activeA3Props.sideId === s.id
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => onA3PropsChange({ sideId: s.id as A3SideId })}
                                                title={s.label}
                                                style={{
                                                    flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    padding: 0, borderRadius: 3, cursor: 'pointer',
                                                    background: sel ? `${s.color}28` : 'rgba(255,255,255,0.03)',
                                                    border: `2px solid ${sel ? s.color : 'rgba(255,255,255,0.10)'}`,
                                                }}
                                            >
                                                <span dangerouslySetInnerHTML={{ __html: svgHtml }} style={{ lineHeight: 0, pointerEvents: 'none' }} />
                                            </button>
                                        )
                                    })}
                                </div>
                                <label style={{ ...chk, marginBottom: 8 }}>
                                    <input type="checkbox" checked={activeA3Props.assumedFriend} onChange={e => onA3PropsChange({ assumedFriend: e.target.checked })} />
                                    Assumed Friend
                                </label>

                                {/* Icon grid */}
                                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>Unit Type</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginBottom: 6 }}>
                                    {METIS_ICONS.map(ic => {
                                        const svgHtml = buildMetisSvg(ic.index, activeA3Props.sideId, 24)
                                        const sel = activeA3Props.icon === ic.index
                                        return (
                                            <button
                                                key={ic.index}
                                                onClick={() => onA3PropsChange({ icon: ic.index })}
                                                title={ic.label}
                                                style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    justifyContent: 'center', gap: 2, padding: '5px 2px',
                                                    background: sel ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${sel ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                                    borderRadius: 3, cursor: 'pointer',
                                                }}
                                            >
                                                {svgHtml && <span dangerouslySetInnerHTML={{ __html: svgHtml }} style={{ lineHeight: 0 }} />}
                                                <span style={{ fontSize: 7, color: sel ? '#fff' : 'rgba(255,255,255,0.5)', lineHeight: 1, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {ic.label}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>

                                {divider}

                                {/* Echelon */}
                                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>Echelon</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, marginBottom: 6 }}>
                                    {METIS_ECHELONS.map(e => {
                                        const sel = activeA3Props.size === e.size
                                        return (
                                            <button
                                                key={e.size}
                                                onClick={() => onA3PropsChange({ size: e.size })}
                                                title={e.label}
                                                style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    justifyContent: 'center', gap: 2, padding: '5px 2px',
                                                    background: sel ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${sel ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                                    borderRadius: 3, cursor: 'pointer',
                                                }}
                                            >
                                                <span style={{ fontSize: 12, fontFamily: 'monospace', color: sel ? '#fff' : 'rgba(255,255,255,0.65)', lineHeight: 1 }}>
                                                    {e.nato}
                                                </span>
                                                <span style={{ fontSize: 7, color: sel ? '#fff' : 'rgba(255,255,255,0.45)', lineHeight: 1 }}>
                                                    {e.label.slice(0, 5)}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                                <div style={{ display: 'flex', gap: 14, marginBottom: 4 }}>
                                    <label style={chk}>
                                        <input type="checkbox" checked={activeA3Props.reinforced} onChange={e => onA3PropsChange({ reinforced: e.target.checked })} />
                                        Reinforced
                                    </label>
                                    <label style={chk}>
                                        <input type="checkbox" checked={activeA3Props.reduced} onChange={e => onA3PropsChange({ reduced: e.target.checked })} />
                                        Reduced
                                    </label>
                                </div>

                                {divider}

                                {/* Modifier 1 */}
                                <div style={frow}>
                                    <span style={flabel}>Modifier 1</span>
                                    {mobPreviewSvg
                                        ? <span dangerouslySetInnerHTML={{ __html: mobPreviewSvg }} style={{ lineHeight: 0, flexShrink: 0 }} />
                                        : <div style={{ width: 24, flexShrink: 0 }} />
                                    }
                                    <select value={activeA3Props.mod1} onChange={e => onA3PropsChange({ mod1: Number(e.target.value) })} style={fsel}>
                                        {METIS_MOB.map(m => <option key={m.index} value={m.index}>{m.label}</option>)}
                                    </select>
                                </div>

                                {/* Modifier 2 */}
                                <div style={frow}>
                                    <span style={flabel}>Modifier 2</span>
                                    {mod2PreviewSvg
                                        ? <span dangerouslySetInnerHTML={{ __html: mod2PreviewSvg }} style={{ lineHeight: 0, flexShrink: 0 }} />
                                        : <div style={{ width: 24, flexShrink: 0 }} />
                                    }
                                    <select value={activeA3Props.mod2} onChange={e => onA3PropsChange({ mod2: Number(e.target.value) })} style={fsel}>
                                        {METIS_MOD2.map(m => <option key={m.index} value={m.index}>{m.label}</option>)}
                                    </select>
                                </div>

                                {divider}

                                {/* HQ / TF */}
                                <div style={frow}>
                                    <span style={flabel}>HQ / TF</span>
                                    <select value={activeA3Props.hqTf} onChange={e => onA3PropsChange({ hqTf: Number(e.target.value) })} style={fsel}>
                                        {METIS_HQTF.map(h => <option key={h.index} value={h.index}>{h.label}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: 14, marginBottom: 4 }}>
                                    <label style={chk}>
                                        <input
                                            type="checkbox"
                                            checked={[1, 2, 5, 6].includes(activeA3Props.hqTf)}
                                            onChange={e => {
                                                const isHQ = e.target.checked
                                                const isTF = [3, 4, 5, 6].includes(activeA3Props.hqTf)
                                                onA3PropsChange({ hqTf: isHQ && isTF ? 5 : isHQ ? 1 : isTF ? 3 : 0 })
                                            }}
                                        />
                                        Headquarters
                                    </label>
                                    <label style={chk}>
                                        <input type="checkbox" checked={activeA3Props.dashed} onChange={e => onA3PropsChange({ dashed: e.target.checked })} />
                                        Anticipated
                                    </label>
                                </div>

                                {divider}

                                {/* Text fields */}
                                <div style={frow}>
                                    <span style={flabel}>Designation</span>
                                    <input type="text" style={finp}
                                        value={activeA3Props.designation}
                                        placeholder="1, ALPHA…"
                                        onChange={e => onA3PropsChange({ designation: e.target.value })} />
                                </div>
                                <div style={frow}>
                                    <span style={flabel}>Higher Form.</span>
                                    <input type="text" style={finp}
                                        value={activeA3Props.higherFormation}
                                        placeholder="Parent unit…"
                                        onChange={e => onA3PropsChange({ higherFormation: e.target.value })} />
                                </div>
                                <div style={frow}>
                                    <span style={flabel}>Add. Info</span>
                                    <input type="text" style={finp}
                                        value={activeA3Props.additionalInfo}
                                        placeholder="Additional info…"
                                        onChange={e => onA3PropsChange({ additionalInfo: e.target.value })} />
                                </div>

                                {divider}

                                {/* Scale */}
                                <div style={{ ...frow, gap: 6 }}>
                                    <span style={flabel}>Scale</span>
                                    <input
                                        type="range" min={0.5} max={3} step={0.1}
                                        value={activeA3Props.metisScale}
                                        onChange={e => onA3PropsChange({ metisScale: Number(e.target.value) })}
                                        style={{ flex: 1 }}
                                    />
                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', minWidth: 26, textAlign: 'right' }}>
                                        {activeA3Props.metisScale.toFixed(1)}
                                    </span>
                                </div>

                                {divider}

                                {/* Save as Preset */}
                                {showSavePreset
                                    ? <div style={{ display: 'flex', gap: 4 }}>
                                        <input
                                            autoFocus
                                            value={savePresetName}
                                            onChange={e => setSavePresetName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') savePreset('a3metis'); if (e.key === 'Escape') setShowSavePreset(false) }}
                                            placeholder="Preset name…"
                                            style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: '#ddd', borderRadius: 3, padding: '3px 5px', fontSize: 11 }}
                                        />
                                        <button onClick={() => savePreset('a3metis')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#eee', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', fontSize: 10 }}>Save</button>
                                    </div>
                                    : <button onClick={() => setShowSavePreset(true)} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 3, cursor: 'pointer', padding: '5px 6px', fontSize: 10 }}>Save as Preset</button>
                                }
                            </div>
                        )
                    })()}
                </div>
            )}

            {/* Layers list */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', padding: '0 10px 6px' }}>
                    Layers
                </div>
                {layers.length === 0 && (
                    <div style={{ padding: '4px 10px', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        No layers yet
                    </div>
                )}
                {[...layers].sort((a, b) => a.order - b.order).map(layer => (
                    <div
                        key={layer.id}
                        onClick={() => canEdit && onLayerSelect(layer.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                            background: activeLayerId === layer.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                            cursor: canEdit ? 'pointer' : 'default',
                            borderLeft: activeLayerId === layer.id ? `2px solid ${layer.color}` : '2px solid transparent',
                        }}
                    >
                        <button
                            onClick={e => { e.stopPropagation(); canEdit && actions.updateLayer(layer.id, { visible: !layer.visible }) }}
                            style={{ background: 'none', border: 'none', color: layer.visible ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)', cursor: canEdit ? 'pointer' : 'default', padding: 0, fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                            title={layer.visible ? 'Hide layer' : 'Show layer'}
                        >
                            {layer.visible ? '●' : '○'}
                        </button>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: layer.color, flexShrink: 0 }} />
                        {editingId === layer.id ? (
                            <input
                                autoFocus
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onBlur={() => commitEdit(layer.id)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(layer.id); if (e.key === 'Escape') setEditingId(null) }}
                                onClick={e => e.stopPropagation()}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 3, padding: '1px 4px', fontSize: 12 }}
                            />
                        ) : (
                            <span
                                onDoubleClick={e => { e.stopPropagation(); canEdit && startEditing(layer) }}
                                style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
                                title={layer.name}
                            >
                                {layer.name}
                            </span>
                        )}
                        {canEdit && (
                            <button
                                onClick={e => { e.stopPropagation(); actions.removeLayer(layer.id) }}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, flexShrink: 0 }}
                                title="Delete layer"
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Add layer */}
            {canEdit && (
                <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 6, flexShrink: 0 }}>
                    <input
                        value={newLayerName}
                        onChange={e => setNewLayerName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddLayer()}
                        placeholder="New layer…"
                        style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#eee', borderRadius: 4, padding: '4px 7px', fontSize: 12 }}
                    />
                    <button
                        onClick={handleAddLayer}
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#eee', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', fontSize: 13 }}
                    >
                        +
                    </button>
                </div>
            )}

            </> /* end layers tab */}
        </div>
    )
}
