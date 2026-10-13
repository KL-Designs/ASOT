'use client'

import React from 'react'
import {
    METIS_CONDITIONS, METIS_DASHABLE, METIS_DIRECTIONS, METIS_ECHELONS, METIS_ICONS, METIS_IDENTITIES,
    METIS_MOD1, METIS_MOD2, METIS_TEXT_MAX, DEFAULT_METIS, metisBearing, metisLayers, metisText,
    type MetisIdentity, type MetisMarker,
} from '@/lib/operations/metis'

/**
 * Everything the map draws or edits a Metis marker with.
 *
 * There used to be three copies of this — the tool panel, the annotation
 * editor and the map's own marker icon each composited the symbol and listed
 * the options their own way, from lists that had drifted from the mod. Now the
 * lists, the texture order and the stored format all come from
 * `lib/operations/metis.ts`, and these are the only pieces that turn them into
 * pixels and controls.
 */

const BASE = '/markers/metis'

/** The textures are 214×264; containers keep that ratio so the layers register. */
export const METIS_ASPECT = 264 / 214

const IDENTITY_COLOUR: Record<MetisIdentity, string> = { blu: '#3d9be9', red: '#e9503d', neu: '#5fbf5f', unk: '#d9c03a' }

/**
 * The tint filters the textures are drawn through: they are black-on-clear in
 * the mod, coloured in game by the frame's marker colour. Mount once per page
 * that shows a symbol.
 */
export function MetisFilterDefs() {
    return (
        <svg width={0} height={0} style={{ position: 'absolute', overflow: 'hidden' }} aria-hidden='true'>
            <defs>
                <filter id='metis-tint-blu'><feColorMatrix type='matrix' values='0.502 0 0 0 0  0.878 0 0 0 0  1.000 0 0 0 0  0 0 0 1 0' /></filter>
                <filter id='metis-tint-red'><feColorMatrix type='matrix' values='1.000 0 0 0 0  0.502 0 0 0 0  0.502 0 0 0 0  0 0 0 1 0' /></filter>
                <filter id='metis-tint-neu'><feColorMatrix type='matrix' values='0.667 0 0 0 0  1.000 0 0 0 0  0.667 0 0 0 0  0 0 0 1 0' /></filter>
                <filter id='metis-tint-unk'><feColorMatrix type='matrix' values='1.000 0 0 0 0  1.000 0 0 0 0  0.502 0 0 0 0  0 0 0 1 0' /></filter>
            </defs>
        </svg>
    )
}

const layer: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' }

/** A marker's symbol, as React. */
export function MetisSymbol({ marker, size = 48 }: { marker: MetisMarker; size?: number }) {
    const bearing = metisBearing(marker.direction)
    const condition = METIS_CONDITIONS[marker.condition]?.colour
    return (
        <div style={{ position: 'relative', width: size, height: Math.round(size * METIS_ASPECT), flexShrink: 0 }}>
            <div style={{ ...layer, filter: `url(#metis-tint-${marker.identity})` }}>
                {metisLayers(marker).map(path => <img key={path} src={`${BASE}/${path}.png`} alt='' style={layer} />)}
            </div>
            {bearing !== null && (
                <span
                    aria-hidden='true'
                    style={{
                        position: 'absolute', left: '50%', bottom: -2, fontSize: Math.max(9, size * 0.3), lineHeight: 1,
                        transform: `translateX(-50%) rotate(${bearing}deg)`, color: IDENTITY_COLOUR[marker.identity],
                    }}
                >
                    ↑
                </span>
            )}
            {condition && <span aria-hidden='true' style={{ position: 'absolute', left: '22%', right: '22%', bottom: '8%', height: 3, background: condition }} />}
        </div>
    )
}

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * The same symbol as an HTML string, for a Leaflet `divIcon`, with its texts
 * where the mod puts them: designation bottom left, higher formation bottom
 * right, additional information to the right. Every text is escaped — they are
 * typed by whoever placed the marker and this goes in through `innerHTML`.
 */
export function metisDivHtml(marker: MetisMarker, width: number, selected = false): { html: string; width: number; height: number } {
    const height = Math.round(width * METIS_ASPECT)
    const img = (path: string) => `<img src="${BASE}/${path}.png" alt="" style="position:absolute;inset:0;width:100%;height:100%;" />`
    const bearing = metisBearing(marker.direction)
    const condition = METIS_CONDITIONS[marker.condition]?.colour
    const text = 'font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000,0 0 3px #000;white-space:nowrap;position:absolute;'

    const html = `<div style="position:relative;width:${width}px;height:${height}px;pointer-events:none;">
        ${selected ? '<div style="position:absolute;inset:-5px;border:2px solid #fff;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,0.25),0 0 10px rgba(255,255,255,0.6);"></div>' : ''}
        <div style="position:absolute;inset:0;filter:url(#metis-tint-${marker.identity});">${metisLayers(marker).map(img).join('')}</div>
        ${condition ? `<div style="position:absolute;left:22%;right:22%;bottom:8%;height:3px;background:${condition};"></div>` : ''}
        ${bearing !== null ? `<div style="position:absolute;left:50%;top:100%;font-size:14px;line-height:1;color:${IDENTITY_COLOUR[marker.identity]};text-shadow:0 0 3px #000;transform:translateX(-50%) rotate(${bearing}deg);">↑</div>` : ''}
        ${marker.designation ? `<span style="${text}right:100%;bottom:6%;margin-right:2px;">${escapeHtml(marker.designation)}</span>` : ''}
        ${marker.higherFormation ? `<span style="${text}left:100%;bottom:6%;margin-left:2px;">${escapeHtml(marker.higherFormation)}</span>` : ''}
        ${marker.additionalInfo ? `<span style="${text}left:100%;top:38%;margin-left:2px;">${escapeHtml(marker.additionalInfo)}</span>` : ''}
    </div>`
    return { html, width, height }
}

/* ── The form ───────────────────────────────────────────────────────────── */

const label: React.CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 5 }
const field: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: '#ddd',
    borderRadius: 3, padding: '4px 6px', fontSize: 11, minWidth: 0,
}
const check: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.7)' }
const cell = (on: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '4px 2px',
    background: on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 3, cursor: 'pointer', color: 'inherit',
})

/**
 * Every option the mod has for a marker, as one form.
 *
 * `wide` lays the sections side by side for the annotation editor's bar; the
 * default stacks them for the tool panel. The option lists are the mod's, in
 * the mod's order — an option's position is its id in game.
 */
export function MetisForm({ value, onChange, wide = false }: {
    value: MetisMarker
    onChange: (next: MetisMarker) => void
    wide?: boolean
}) {
    const set = (patch: Partial<MetisMarker>) => onChange({ ...value, ...patch })
    const section: React.CSSProperties = wide ? { flex: '1 1 190px', minWidth: 170, padding: '0 10px' } : { marginBottom: 10 }

    return (
        <div style={wide ? { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' } : undefined}>
            <div style={section}>
                <div style={label}>Identity</div>
                <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                    {METIS_IDENTITIES.map(identity => {
                        const on = value.identity === identity.id
                        return (
                            <button
                                key={identity.id}
                                type='button'
                                title={identity.label}
                                aria-pressed={on}
                                onClick={() => set({ identity: identity.id, dashed: value.dashed && METIS_DASHABLE.includes(identity.id) })}
                                style={{ ...cell(on), flex: 1, borderColor: on ? IDENTITY_COLOUR[identity.id] : 'rgba(255,255,255,0.1)' }}
                            >
                                <MetisSymbol marker={{ ...DEFAULT_METIS, identity: identity.id }} size={30} />
                                <span style={{ fontSize: 7.5 }}>{identity.label}</span>
                            </button>
                        )
                    })}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {/* The mod has no dashed neutral frame, so the option is not offered for it. */}
                    <label style={{ ...check, opacity: METIS_DASHABLE.includes(value.identity) ? 1 : 0.4 }}>
                        <input type='checkbox' checked={value.dashed} disabled={!METIS_DASHABLE.includes(value.identity)} onChange={e => set({ dashed: e.target.checked })} />
                        Suspected
                    </label>
                    <label style={check}>
                        <input type='checkbox' checked={value.hq} onChange={e => set({ hq: e.target.checked })} />
                        Headquarters
                    </label>
                </div>
            </div>

            <div style={{ ...section, ...(wide ? { flex: '2 1 300px' } : {}) }}>
                <div style={label}>Unit type</div>
                <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(46px, 1fr))' : 'repeat(4, 1fr)', gap: 3, maxHeight: wide ? 150 : 260, overflowY: 'auto' }}>
                    {METIS_ICONS.map((icon, id) => {
                        const on = value.icon === id
                        return (
                            <button key={icon.key} type='button' title={icon.label} aria-pressed={on} onClick={() => set({ icon: id })} style={cell(on)}>
                                <MetisSymbol marker={{ ...DEFAULT_METIS, identity: value.identity, icon: id }} size={wide ? 26 : 32} />
                                {!wide && (
                                    <span style={{ fontSize: 7, lineHeight: 1.1, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: on ? 1 : 0.55 }}>
                                        {icon.label}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div style={section}>
                <div style={label}>Modifiers</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <select aria-label='Modifier 1 (top)' style={field} value={value.mod1} onChange={e => set({ mod1: Number(e.target.value) })}>
                        {METIS_MOD1.map((m, id) => <option key={m.key} value={id}>{id === 0 ? 'Top: none' : `Top: ${m.label}`}</option>)}
                    </select>
                    <select aria-label='Modifier 2 (bottom)' style={field} value={value.mod2} onChange={e => set({ mod2: Number(e.target.value) })}>
                        {METIS_MOD2.map((m, id) => <option key={m.key} value={id}>{id === 0 ? 'Bottom: none' : `Bottom: ${m.label}`}</option>)}
                    </select>
                </div>

                <div style={{ ...label, marginTop: 10 }}>Echelon</div>
                <select aria-label='Echelon' style={field} value={value.echelon} onChange={e => set({ echelon: Number(e.target.value) })}>
                    {METIS_ECHELONS.map((e, id) => <option key={e.key} value={id}>{e.symbol ? `${e.label} (${e.symbol})` : e.label}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <label style={check}><input type='checkbox' checked={value.reinforced} onChange={e => set({ reinforced: e.target.checked })} />Reinforced</label>
                    <label style={check}><input type='checkbox' checked={value.reduced} onChange={e => set({ reduced: e.target.checked })} />Reduced</label>
                </div>
            </div>

            <div style={section}>
                <div style={label}>Text</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Six of the mod's characters; anything it cannot draw is dropped as it is typed. */}
                    <input aria-label='Unique designation' style={field} placeholder={`Designation (max ${METIS_TEXT_MAX})`} maxLength={METIS_TEXT_MAX}
                        value={value.designation} onChange={e => set({ designation: metisText(e.target.value) })} />
                    <input aria-label='Higher formation' style={field} placeholder={`Higher formation (max ${METIS_TEXT_MAX})`} maxLength={METIS_TEXT_MAX}
                        value={value.higherFormation} onChange={e => set({ higherFormation: metisText(e.target.value) })} />
                    <input aria-label='Additional information' style={field} placeholder='Additional information' maxLength={60}
                        value={value.additionalInfo} onChange={e => set({ additionalInfo: e.target.value.replace(/["\r\n]/g, ' ') })} />
                </div>
            </div>

            <div style={section}>
                <div style={label}>Status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <select aria-label='Operational condition' style={field} value={value.condition} onChange={e => set({ condition: Number(e.target.value) as MetisMarker['condition'] })}>
                        {METIS_CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <select aria-label='Direction of movement' style={field} value={value.direction} onChange={e => set({ direction: e.target.value as MetisMarker['direction'] })}>
                        <option value=''>Not moving</option>
                        {METIS_DIRECTIONS.map(d => <option key={d} value={d}>Moving {d}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                        Size
                        <input type='range' min={0.5} max={3} step={0.1} value={value.scale} onChange={e => set({ scale: Number(e.target.value) })} style={{ flex: 1 }} />
                        {value.scale.toFixed(1)}
                    </label>
                </div>
            </div>
        </div>
    )
}
