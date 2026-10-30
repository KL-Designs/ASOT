'use client'

import { useState } from 'react'
import type { MapAnnotation, AnnotationProperties } from './types'
import { A3_ICON_TYPES, A3_MARKER_COLORS } from './types'
import { MetisFilterDefs, MetisForm, MetisSymbol } from './Metis'
import { readMetis, writeMetis } from '@/lib/operations/metis'
import type { MapYjsActions } from './useMapYjs'

// ── Shared constants ──────────────────────────────────────────────────────────

const ICON_GROUPS = ['Generic', 'Shape', 'BLUFOR', 'OPFOR', 'IND', 'CIV'] as const
const PRESET_COLORS = ['#db001d', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#ffffff']
// ── Shared style shortcuts ────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
    fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontWeight: 600,
}
const divider: React.CSSProperties = {
    width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', flexShrink: 0, margin: '0 2px',
}
const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
    color: '#ddd', borderRadius: 3, padding: '3px 5px', fontSize: 11, boxSizing: 'border-box',
}
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
    annotation: MapAnnotation
    actions: MapYjsActions
    onClose: () => void
}

export default function AnnotationEditor({ annotation: ann, actions, onClose }: Props) {
    const [iconGroup, setIconGroup] = useState<typeof ICON_GROUPS[number]>('Generic')

    const upd = (props: Partial<AnnotationProperties>) =>
        actions.updateAnnotation(ann.id, { properties: props })

    const handleDelete = () => { actions.removeAnnotation(ann.id); onClose() }

    return (
        <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, width: 'calc(100% - 24px)', maxWidth: 960,
            background: 'rgba(10,10,10,0.97)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column',
            pointerEvents: 'all',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
            }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                    Editing: {ann.type === 'a3metis' ? 'METIS Marker' : ann.type === 'a3icon' ? 'A3 Icon' : ann.type}
                </span>
                {ann.type === 'a3metis' && ann.properties.a3Designation && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' }}>
                        {ann.properties.a3Designation}
                    </span>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={handleDelete} style={{
                    background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)',
                    color: '#e74c3c', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}>Delete</button>
                <button onClick={onClose} style={{
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px',
                }}>×</button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', overflow: 'hidden', padding: '10px 6px' }}>

                {/* ── A3 METIS ───────────────────────────────────────────────── */}
                {ann.type === 'a3metis' && <><MetisFilterDefs />
                    <div style={{ padding: '0 10px', flexShrink: 0 }}>
                        <div style={sectionLabel}>Preview</div>
                        <MetisSymbol marker={readMetis(ann.properties)} size={64} />
                    </div>

                    <div style={divider} />

                    {/* A marker placed before the Metis rebuild is read through
                        its translation and written back in the mod's own ids
                        the first time anything on it is changed. */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <MetisForm wide value={readMetis(ann.properties)} onChange={marker => upd(writeMetis(marker))} />
                    </div>
                </>}

                {/* ── A3 ICON ────────────────────────────────────────────────── */}
                {ann.type === 'a3icon' && <>

                    {/* Preview */}
                    <div style={{ padding: '0 10px', minWidth: 80, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <div style={sectionLabel}>Preview</div>
                        <img
                            src={`/markers/icons/${ann.properties.a3MarkerType ?? 'hd_dot'}.png`}
                            width={40} height={40}
                            style={{
                                imageRendering: 'pixelated',
                                filter: `drop-shadow(0 0 6px ${A3_MARKER_COLORS.find(c => c.key === ann.properties.a3MarkerColor)?.hex ?? '#fff'})`,
                            }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3' }}
                        />
                    </div>

                    <div style={divider} />

                    {/* Icon picker */}
                    <div style={{ padding: '0 10px', minWidth: 200, flexShrink: 0 }}>
                        <div style={sectionLabel}>Icon</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
                            {ICON_GROUPS.map(g => (
                                <button key={g} onClick={() => setIconGroup(g)}
                                    style={{
                                        fontSize: 9, padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
                                        background: iconGroup === g ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        color: iconGroup === g ? '#fff' : 'rgba(255,255,255,0.5)',
                                    }}>
                                    {g}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxHeight: 130, overflowY: 'auto' }}>
                            {A3_ICON_TYPES.filter(t => t.group === iconGroup).map(t => {
                                const selected = ann.properties.a3MarkerType === t.key
                                return (
                                    <button key={t.key} title={t.key} onClick={() => upd({ a3MarkerType: t.key })}
                                        style={{
                                            fontSize: 9, padding: '2px 4px', borderRadius: 3, cursor: 'pointer',
                                            background: selected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${selected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                            color: selected ? '#fff' : 'rgba(255,255,255,0.6)',
                                            display: 'flex', alignItems: 'center', gap: 3,
                                        }}>
                                        <img src={`/markers/icons/${t.key}.png`} alt="" width={12} height={12}
                                            style={{ imageRendering: 'pixelated', opacity: 0.9 }}
                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                        {t.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div style={divider} />

                    {/* Color */}
                    <div style={{ padding: '0 10px', minWidth: 110, flexShrink: 0 }}>
                        <div style={sectionLabel}>Color</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {A3_MARKER_COLORS.map(c => (
                                <div key={c.key} title={c.label} onClick={() => upd({ a3MarkerColor: c.key })}
                                    style={{
                                        width: 16, height: 16, borderRadius: 3, background: c.hex, cursor: 'pointer',
                                        border: ann.properties.a3MarkerColor === c.key ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                    }} />
                            ))}
                        </div>
                    </div>

                    <div style={divider} />

                    {/* Dir + Scale */}
                    <div style={{ padding: '0 10px', minWidth: 120, flexShrink: 0 }}>
                        <div style={sectionLabel}>Transform</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Direction (°)</div>
                                <input type="number" min={0} max={360} step={5}
                                    value={ann.properties.a3MarkerDir ?? 0}
                                    onChange={e => upd({ a3MarkerDir: Number(e.target.value) })}
                                    style={{ ...inp, width: 70 }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Scale</div>
                                <input type="number" min={0.1} max={10} step={0.1}
                                    value={ann.properties.a3MarkerScale ?? 1}
                                    onChange={e => upd({ a3MarkerScale: Number(e.target.value) })}
                                    style={{ ...inp, width: 70 }} />
                            </div>
                        </div>
                    </div>

                    <div style={divider} />

                    {/* Label */}
                    <div style={{ padding: '0 10px', flex: 1, minWidth: 100 }}>
                        <div style={sectionLabel}>Label</div>
                        <input type="text" style={inp} placeholder="Label…"
                            value={ann.properties.label ?? ''}
                            onChange={e => upd({ label: e.target.value })} />
                    </div>
                </>}

                {/* ── SIMPLE TYPES (line, polygon, circle, marker, text) ─────── */}
                {ann.type !== 'a3icon' && ann.type !== 'a3metis' && <>
                    {/* Color */}
                    <div style={{ padding: '0 10px', minWidth: 160 }}>
                        <div style={sectionLabel}>Color</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                            {PRESET_COLORS.map(c => (
                                <div key={c} onClick={() => upd({ color: c, fillColor: c })}
                                    style={{
                                        width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer',
                                        border: ann.properties.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                                    }} />
                            ))}
                            <input type="color" value={ann.properties.color}
                                onChange={e => upd({ color: e.target.value, fillColor: e.target.value })}
                                style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                        </div>
                    </div>

                    {(ann.type === 'marker' || ann.type === 'text') && <>
                        <div style={divider} />
                        <div style={{ padding: '0 10px', flex: 1, minWidth: 160 }}>
                            <div style={sectionLabel}>Label</div>
                            <input type="text" style={inp} placeholder="Label…"
                                value={ann.properties.label ?? ''}
                                onChange={e => upd({ label: e.target.value })} />
                        </div>
                    </>}

                    {ann.type === 'text' && <>
                        <div style={divider} />
                        <div style={{ padding: '0 10px', minWidth: 100 }}>
                            <div style={sectionLabel}>Font Size</div>
                            <input type="number" min={8} max={48} style={{ ...inp, width: 70 }}
                                value={ann.properties.fontSize ?? 14}
                                onChange={e => upd({ fontSize: Number(e.target.value) })} />
                        </div>
                    </>}

                    {(ann.type === 'polyline' || ann.type === 'polygon' || ann.type === 'rectangle' || ann.type === 'circle') && <>
                        <div style={divider} />
                        <div style={{ padding: '0 10px', minWidth: 100 }}>
                            <div style={sectionLabel}>Weight</div>
                            <input type="number" min={1} max={10} style={{ ...inp, width: 70 }}
                                value={ann.properties.weight ?? 2}
                                onChange={e => upd({ weight: Number(e.target.value) })} />
                        </div>
                    </>}
                </>}

            </div>
        </div>
    )
}
