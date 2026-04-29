'use client'

import { useState } from 'react'
import type { MapLayer, DrawingTool, A3ToolProps } from './types'
import { A3_ICON_TYPES, METIS_ICONS, A3_MARKER_COLORS } from './types'
import type { MapYjsActions } from './useMapYjs'

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
const textInput: React.CSSProperties = {
    flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
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
        : activeTool === 'a3icon' || activeTool === 'a3metis' || activeTool === 'marker' ? 'Click map to place'
        : 'Click to place'

    return (
        <div style={{
            width: 220,
            background: 'rgba(15,15,15,0.95)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            fontSize: 13,
            color: '#eee',
            overflowY: 'auto',
        }}>

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
                        </div>
                    )}

                    {/* ── METIS properties ───────────────────────────────── */}
                    {activeTool === 'a3metis' && (
                        <div style={{ marginTop: 6 }}>
                            {/* Side */}
                            <div style={row}>
                                <span style={label}>Side</span>
                                <div style={{ display: 'flex', gap: 3 }}>
                                    {SIDES.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => onA3PropsChange({ sideId: s.id as 'blu' | 'red' | 'grn' | 'unk' })}
                                            style={{
                                                fontSize: 9, padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
                                                background: activeA3Props.sideId === s.id ? s.color : 'rgba(255,255,255,0.05)',
                                                border: `1px solid ${activeA3Props.sideId === s.id ? s.color : 'rgba(255,255,255,0.12)'}`,
                                                color: '#fff',
                                            }}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Dashed */}
                            <div style={row}>
                                <span style={label}>Dashed</span>
                                <input type="checkbox" checked={activeA3Props.dashed}
                                    onChange={e => onA3PropsChange({ dashed: e.target.checked })} />
                            </div>
                            {/* Icon picker */}
                            <div style={{ marginBottom: 6 }}>
                                <div style={{ ...label, marginBottom: 4 }}>Icon</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {METIS_ICONS.map(ic => (
                                        <button
                                            key={ic.index}
                                            onClick={() => onA3PropsChange({ icon: ic.index })}
                                            style={{
                                                fontSize: 9, padding: '2px 4px', borderRadius: 3, cursor: 'pointer',
                                                background: activeA3Props.icon === ic.index ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                                                border: `1px solid ${activeA3Props.icon === ic.index ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                                color: activeA3Props.icon === ic.index ? '#fff' : 'rgba(255,255,255,0.6)',
                                            }}
                                        >
                                            {ic.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Mod1, Mod2, Size */}
                            <div style={row}>
                                <span style={label}>Mod1</span>
                                <input type="number" min={0} max={20} style={numInput}
                                    value={activeA3Props.mod1}
                                    onChange={e => onA3PropsChange({ mod1: Number(e.target.value) })} />
                                <span style={{ ...label, width: 32 }}>Mod2</span>
                                <input type="number" min={0} max={20} style={numInput}
                                    value={activeA3Props.mod2}
                                    onChange={e => onA3PropsChange({ mod2: Number(e.target.value) })} />
                            </div>
                            <div style={row}>
                                <span style={label}>Size</span>
                                <input type="number" min={0} max={20} style={numInput}
                                    value={activeA3Props.size}
                                    onChange={e => onA3PropsChange({ size: Number(e.target.value) })} />
                                <span style={{ ...label, width: 32 }}>Scale</span>
                                <input type="number" min={0.1} max={10} step={0.1} style={numInput}
                                    value={activeA3Props.metisScale}
                                    onChange={e => onA3PropsChange({ metisScale: Number(e.target.value) })} />
                            </div>
                            {/* Designation */}
                            <div style={row}>
                                <span style={label}>Label</span>
                                <input type="text" style={textInput}
                                    value={activeA3Props.designation}
                                    placeholder="Unit designation…"
                                    onChange={e => onA3PropsChange({ designation: e.target.value })} />
                            </div>
                        </div>
                    )}
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
        </div>
    )
}
