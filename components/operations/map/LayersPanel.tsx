'use client'

import { useState } from 'react'
import type { MapLayer, DrawingTool } from './types'
import type { MapYjsActions } from './useMapYjs'

interface Props {
    layers: MapLayer[]
    activeLayerId: string | null
    activeTool: DrawingTool
    activeColor: string
    canEdit: boolean
    actions: MapYjsActions
    onLayerSelect: (id: string) => void
    onToolChange: (tool: DrawingTool) => void
    onColorChange: (color: string) => void
}

const TOOLS: { id: DrawingTool; label: string; icon: string }[] = [
    { id: 'polyline',  label: 'Line',      icon: '╱' },
    { id: 'polygon',   label: 'Polygon',   icon: '⬡' },
    { id: 'rectangle', label: 'Rectangle', icon: '▭' },
    { id: 'circle',    label: 'Circle',    icon: '◯' },
    { id: 'marker',    label: 'Marker',    icon: '📍' },
    { id: 'text',      label: 'Text',      icon: 'T' },
]

const PRESET_COLORS = ['#db001d', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#ffffff']

export default function LayersPanel({
    layers,
    activeLayerId,
    activeTool,
    activeColor,
    canEdit,
    actions,
    onLayerSelect,
    onToolChange,
    onColorChange,
}: Props) {
    const [newLayerName, setNewLayerName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')

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
        }}>

            {/* Drawing tools */}
            {canEdit && (
                <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
                            {activeTool === 'polyline' || activeTool === 'polygon'
                                ? 'Click to add points · Double-click to finish'
                                : activeTool === 'rectangle' || activeTool === 'circle'
                                ? 'Click start · Click end'
                                : 'Click to place'}
                        </div>
                    )}
                    {/* Color picker */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        {PRESET_COLORS.map(c => (
                            <div
                                key={c}
                                onClick={() => onColorChange(c)}
                                style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 3,
                                    background: c,
                                    cursor: 'pointer',
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 10px',
                            background: activeLayerId === layer.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                            cursor: canEdit ? 'pointer' : 'default',
                            borderLeft: activeLayerId === layer.id ? `2px solid ${layer.color}` : '2px solid transparent',
                        }}
                    >
                        {/* Visibility toggle */}
                        <button
                            onClick={e => { e.stopPropagation(); canEdit && actions.updateLayer(layer.id, { visible: !layer.visible }) }}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: layer.visible ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                                cursor: canEdit ? 'pointer' : 'default',
                                padding: 0,
                                fontSize: 14,
                                lineHeight: 1,
                                flexShrink: 0,
                            }}
                            title={layer.visible ? 'Hide layer' : 'Show layer'}
                        >
                            {layer.visible ? '●' : '○'}
                        </button>

                        {/* Color swatch */}
                        <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: layer.color,
                            flexShrink: 0,
                        }} />

                        {/* Name (editable) */}
                        {editingId === layer.id ? (
                            <input
                                autoFocus
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onBlur={() => commitEdit(layer.id)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(layer.id); if (e.key === 'Escape') setEditingId(null) }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                    flex: 1,
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: '#fff',
                                    borderRadius: 3,
                                    padding: '1px 4px',
                                    fontSize: 12,
                                }}
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

                        {/* Delete */}
                        {canEdit && (
                            <button
                                onClick={e => { e.stopPropagation(); actions.removeLayer(layer.id) }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.3)',
                                    cursor: 'pointer',
                                    padding: 0,
                                    fontSize: 13,
                                    lineHeight: 1,
                                    flexShrink: 0,
                                }}
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
                <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 6 }}>
                    <input
                        value={newLayerName}
                        onChange={e => setNewLayerName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddLayer()}
                        placeholder="New layer…"
                        style={{
                            flex: 1,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#eee',
                            borderRadius: 4,
                            padding: '4px 7px',
                            fontSize: 12,
                        }}
                    />
                    <button
                        onClick={handleAddLayer}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#eee',
                            borderRadius: 4,
                            cursor: 'pointer',
                            padding: '4px 8px',
                            fontSize: 13,
                        }}
                    >
                        +
                    </button>
                </div>
            )}
        </div>
    )
}
