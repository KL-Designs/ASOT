'use client'

import { useState } from 'react'
import ms from 'milsymbol'
import type { MapAnnotation, A3SideId, AnnotationProperties } from './types'
import { A3_ICON_TYPES, METIS_ICONS, METIS_ECHELONS, METIS_HQTF, METIS_MOB, A3_MARKER_COLORS } from './types'
import type { MapYjsActions } from './useMapYjs'

// ── Shared constants ──────────────────────────────────────────────────────────

const ICON_GROUPS = ['Generic', 'Shape', 'BLUFOR', 'OPFOR', 'IND', 'CIV'] as const
const SIDES = [
    { id: 'blu', label: 'BLUFOR', color: '#0055aa' },
    { id: 'red', label: 'OPFOR',  color: '#aa0000' },
    { id: 'grn', label: 'IND',    color: '#007700' },
    { id: 'unk', label: 'UNK',    color: '#888800' },
] as const
const PRESET_COLORS = ['#db001d', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#ffffff']
const METIS_MOD2 = [
    { index: 0, label: 'None'     },
    { index: 1, label: 'Airborne' },
    { index: 2, label: 'Mountain' },
    { index: 3, label: 'Arctic'   },
]

// ── milsymbol helpers ─────────────────────────────────────────────────────────

const METIS_MIL_MAP: Record<number, { dim: string; fn: string }> = {
    0:  { dim: 'G', fn: 'UCI'   },
    1:  { dim: 'G', fn: 'UCIM'  },
    2:  { dim: 'G', fn: 'UCIMR' },
    3:  { dim: 'G', fn: 'UCA'   },
    4:  { dim: 'G', fn: 'UCAT'  },
    5:  { dim: 'G', fn: 'UCF'   },
    6:  { dim: 'G', fn: 'UCD'   },
    7:  { dim: 'A', fn: 'MFH'   },
    8:  { dim: 'A', fn: 'MFF'   },
    9:  { dim: 'S', fn: 'C'     },
    10: { dim: 'G', fn: 'US'    },
    11: { dim: 'G', fn: 'USM'   },
    12: { dim: 'G', fn: 'UCR'   },
    13: { dim: 'G', fn: 'UCE'   },
    14: { dim: 'G', fn: 'USS'   },
    15: { dim: 'G', fn: 'UCFM'  },
    16: { dim: 'G', fn: 'USF'   },
    17: { dim: 'G', fn: 'USMP'  },
    37: { dim: 'G', fn: ''      },
}

function buildSidc(dim: string, fn: string, sideId: string, dashed: boolean, echelonChar: string, mod11 = '-', assumedFriend = false): string {
    const affil: Record<string, string> = { blu: assumedFriend ? 'G' : 'F', red: 'H', grn: 'N', unk: 'U' }
    const a = affil[sideId] ?? 'F'
    const status = dashed ? 'A' : 'P'
    const base = `S${a}${dim}${status}${fn}`.padEnd(15, '-')
    return (base.slice(0, 10) + mod11 + echelonChar + base.slice(12)).slice(0, 15)
}

function iconSvg(iconIndex: number, sideId: string, size: number): string {
    const { dim, fn } = METIS_MIL_MAP[iconIndex] ?? { dim: 'G', fn: '' }
    try { return new ms.Symbol(buildSidc(dim, fn, sideId, false, '-', '-'), { size }).asSVG() } catch { return '' }
}

function fullMetisSvg(ann: MapAnnotation, size: number): string {
    const p = ann.properties
    const { dim, fn } = METIS_MIL_MAP[p.a3Icon ?? 0] ?? { dim: 'G', fn: '' }
    const echelonChar = METIS_ECHELONS.find(e => e.size === (p.a3Size ?? 0))?.milChar ?? '-'
    const mod11 = METIS_HQTF.find(h => h.index === (p.a3HqTf ?? 0))?.mod11 ?? '-'
    const sidc = buildSidc(dim, fn, p.a3SideId ?? 'blu', p.a3Dashed ?? false, echelonChar, mod11, p.a3AssumedFriend ?? false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { return new ms.Symbol(sidc, { size, reinforced: p.a3Reinforced ? 1 : 0, reduced: p.a3Reduced ? 1 : 0 } as any).asSVG() } catch { return '' }
}

// ── Shared style shortcuts ────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
    fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontWeight: 600,
}
const divider: React.CSSProperties = {
    width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', flexShrink: 0, margin: '0 2px',
}
const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }
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
                {ann.type === 'a3metis' && <>

                    {/* Preview + Identity */}
                    <div style={{ padding: '0 10px', minWidth: 140, flexShrink: 0 }}>
                        <div style={sectionLabel}>Identity</div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, background: '#fff', borderRadius: 4, padding: 6 }}>
                            <span dangerouslySetInnerHTML={{ __html: fullMetisSvg(ann, 48) }} style={{ lineHeight: 0 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                            {SIDES.map(s => (
                                <button key={s.id} onClick={() => upd({ a3SideId: s.id as A3SideId })} title={s.label}
                                    style={{
                                        flex: 1, padding: '3px 0', borderRadius: 3, cursor: 'pointer', fontSize: 8, fontWeight: 700,
                                        letterSpacing: '0.04em', textTransform: 'uppercase',
                                        background: ann.properties.a3SideId === s.id ? `${s.color}28` : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${ann.properties.a3SideId === s.id ? s.color : 'rgba(255,255,255,0.1)'}`,
                                        color: ann.properties.a3SideId === s.id ? '#fff' : 'rgba(255,255,255,0.45)',
                                    }}>
                                    {s.id.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        <label style={chk}>
                            <input type="checkbox" checked={ann.properties.a3AssumedFriend ?? false}
                                onChange={e => upd({ a3AssumedFriend: e.target.checked })} />
                            Assumed Friend
                        </label>
                        <label style={chk}>
                            <input type="checkbox" checked={ann.properties.a3Dashed ?? false}
                                onChange={e => upd({ a3Dashed: e.target.checked })} />
                            Anticipated
                        </label>
                    </div>

                    <div style={divider} />

                    {/* Unit Type grid */}
                    <div style={{ padding: '0 10px', minWidth: 180, flexShrink: 0 }}>
                        <div style={sectionLabel}>Unit Type</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                            {METIS_ICONS.map(ic => {
                                const svg = iconSvg(ic.index, ann.properties.a3SideId ?? 'blu', 22)
                                const selected = ann.properties.a3Icon === ic.index
                                return (
                                    <button key={ic.index} onClick={() => upd({ a3Icon: ic.index })} title={ic.label}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            gap: 2, padding: '4px 2px',
                                            background: selected ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${selected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                                            borderRadius: 3, cursor: 'pointer',
                                        }}>
                                        {svg && <span dangerouslySetInnerHTML={{ __html: svg }} style={{ lineHeight: 0 }} />}
                                        <span style={{ fontSize: 6.5, color: selected ? '#fff' : 'rgba(255,255,255,0.45)', lineHeight: 1, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {ic.label}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div style={divider} />

                    {/* Echelon + Status */}
                    <div style={{ padding: '0 10px', minWidth: 160, flexShrink: 0 }}>
                        <div style={sectionLabel}>Echelon</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, marginBottom: 8 }}>
                            {METIS_ECHELONS.map(e => {
                                const selected = ann.properties.a3Size === e.size
                                return (
                                    <button key={e.size} onClick={() => upd({ a3Size: e.size })} title={e.label}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                                            justifyContent: 'center', gap: 1, padding: '4px 1px',
                                            background: selected ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${selected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                                            borderRadius: 3, cursor: 'pointer',
                                        }}>
                                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: selected ? '#fff' : 'rgba(255,255,255,0.6)', lineHeight: 1 }}>{e.nato}</span>
                                        <span style={{ fontSize: 6, color: selected ? '#fff' : 'rgba(255,255,255,0.4)', lineHeight: 1 }}>{e.label.slice(0, 4)}</span>
                                    </button>
                                )
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                            <label style={chk}>
                                <input type="checkbox" checked={ann.properties.a3Reinforced ?? false}
                                    onChange={e => upd({ a3Reinforced: e.target.checked })} />
                                Reinforced
                            </label>
                            <label style={chk}>
                                <input type="checkbox" checked={ann.properties.a3Reduced ?? false}
                                    onChange={e => upd({ a3Reduced: e.target.checked })} />
                                Reduced
                            </label>
                        </div>
                        <div style={sectionLabel}>HQ / TF</div>
                        <select value={ann.properties.a3HqTf ?? 0} onChange={e => upd({ a3HqTf: Number(e.target.value) })} style={sel}>
                            {METIS_HQTF.map(h => <option key={h.index} value={h.index}>{h.label}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                            <label style={chk}>
                                <input type="checkbox"
                                    checked={[1, 2, 5, 6].includes(ann.properties.a3HqTf ?? 0)}
                                    onChange={e => {
                                        const isHQ = e.target.checked
                                        const isTF = [3, 4, 5, 6].includes(ann.properties.a3HqTf ?? 0)
                                        upd({ a3HqTf: isHQ && isTF ? 5 : isHQ ? 1 : isTF ? 3 : 0 })
                                    }} />
                                HQ
                            </label>
                        </div>
                    </div>

                    <div style={divider} />

                    {/* Modifiers */}
                    <div style={{ padding: '0 10px', minWidth: 140, flexShrink: 0 }}>
                        <div style={sectionLabel}>Modifier 1</div>
                        <select value={ann.properties.a3Mod1 ?? 0} onChange={e => upd({ a3Mod1: Number(e.target.value) })} style={{ ...sel, marginBottom: 10 }}>
                            {METIS_MOB.map(m => <option key={m.index} value={m.index}>{m.label}</option>)}
                        </select>
                        <div style={sectionLabel}>Modifier 2</div>
                        <select value={ann.properties.a3Mod2 ?? 0} onChange={e => upd({ a3Mod2: Number(e.target.value) })} style={sel}>
                            {METIS_MOD2.map(m => <option key={m.index} value={m.index}>{m.label}</option>)}
                        </select>
                    </div>

                    <div style={divider} />

                    {/* Text + Scale */}
                    <div style={{ padding: '0 10px', flex: 1, minWidth: 140 }}>
                        <div style={sectionLabel}>Text</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Designation</div>
                                <input type="text" style={inp} placeholder="1, ALPHA…"
                                    value={ann.properties.a3Designation ?? ''}
                                    onChange={e => upd({ a3Designation: e.target.value })} />
                            </div>
                            <div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Higher Formation</div>
                                <input type="text" style={inp} placeholder="Parent unit…"
                                    value={ann.properties.a3HigherFormation ?? ''}
                                    onChange={e => upd({ a3HigherFormation: e.target.value })} />
                            </div>
                            <div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Additional Info</div>
                                <input type="text" style={inp}
                                    value={ann.properties.a3AdditionalInfo ?? ''}
                                    onChange={e => upd({ a3AdditionalInfo: e.target.value })} />
                            </div>
                            <div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Scale <span style={{ color: 'rgba(255,255,255,0.25)' }}>{(ann.properties.a3MetisScale ?? 1).toFixed(1)}×</span></div>
                                <input type="range" min={0.5} max={3} step={0.1}
                                    value={ann.properties.a3MetisScale ?? 1}
                                    onChange={e => upd({ a3MetisScale: Number(e.target.value) })}
                                    style={{ width: '100%' }} />
                            </div>
                        </div>
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
