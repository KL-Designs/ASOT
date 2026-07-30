'use client'

/**
 * CameraOverlay — SVG overlays for the style-picker previews.
 * The actual composited images served from the API already have the PNG overlay baked in.
 * These SVG overlays are used for the camera style grid previews only.
 *
 * Dynamic values (battery, coordinates, timestamps, etc.) are randomised on each mount
 * so that preview thumbnails look varied.
 */

import React, { useState } from 'react'

interface OverlayProps {
    style?: React.CSSProperties
    className?: string
}

// ── Random value helpers ──────────────────────────────────────────────────────

function ri(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function rf(min: number, max: number, dp = 4) { return (Math.random() * (max - min) + min).toFixed(dp) }
function pad(n: number, len = 2) { return String(n).padStart(len, '0') }

function generateRandValues() {
    const battPct   = ri(15, 98)
    const battBars  = battPct > 70 ? '▮▮▮▮' : battPct > 40 ? '▮▮▮▯' : battPct > 15 ? '▮▮▯▯' : '▮▯▯▯'
    const battColor = battPct > 40 ? 'rgba(0,200,80,0.75)' : battPct > 15 ? 'rgba(255,180,0,0.8)' : 'rgba(220,0,0,0.85)'
    const lat       = -(ri(25, 34) + parseFloat(rf(0, 0.9999)))
    const lon       = ri(130, 149) + parseFloat(rf(0, 0.9999))
    const latStr    = `${Math.abs(lat).toFixed(4)}°S`
    const lonStr    = `${lon.toFixed(4)}°E`
    const alt       = ri(38, 165)
    const hdg       = ri(0, 359)
    const spd       = ri(0, 45)
    const recH      = '00'
    const recM      = pad(ri(0, 59))
    const recS      = pad(ri(0, 59))
    const recStr    = `${recH}:${recM}:${recS}`
    const rngM      = ri(180, 1800)
    const elev      = ri(-5, 12)
    const isoVals   = [100, 200, 400, 800, 1600] as const
    const apertureVals = ['f/1.8', 'f/2.8', 'f/4.0', 'f/5.6'] as const
    const shutterVals  = ['1/125', '1/250', '1/500', '1/1000'] as const
    const aperture  = apertureVals[ri(0, 3)]
    const shutter   = shutterVals[ri(0, 3)]
    const iso       = isoVals[ri(0, 4)]
    const camNum    = ri(1, 16)
    const siteId    = `SITE-${String.fromCharCode(65 + ri(0, 5))}`
    const focalLen  = [35, 50, 85, 105, 135, 200][ri(0, 5)]
    const gridE     = pad(ri(0, 99999), 5)
    const gridN     = pad(ri(0, 99999), 5)
    const gridRef   = `${String.fromCharCode(65 + ri(0, 9))}${String.fromCharCode(65 + ri(0, 9))} ${gridE} ${gridN}`
    const pastMs    = Date.now() - ri(300000, 86400000)
    const ts        = new Date(pastMs).toISOString().replace('T', ' ').slice(0, 19)
    const timeOnly  = new Date(pastMs).toTimeString().slice(0, 8)
    const dateOnly  = new Date(pastMs).toISOString().slice(0, 10)
    return {
        battPct, battBars, battColor,
        latStr, lonStr, lat: lat.toFixed(4), lon: lon.toFixed(4),
        alt, hdg, spd, recStr,
        rngM, elev, aperture, shutter, iso, focalLen,
        camNum, siteId, gridRef,
        ts, timeOnly, dateOnly,
    }
}

function useRandValues() {
    const [r] = useState(generateRandValues)
    return r
}

// ── DSLR ──────────────────────────────────────────────────────────────────────

export function DslrOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            {/* Corner focus brackets */}
            <g stroke='rgba(255,255,255,0.55)' strokeWidth='0.5' fill='none'>
                <path d='M4,10 L4,4 L10,4' />
                <path d='M90,4 L96,4 L96,10' />
                <path d='M4,90 L4,96 L10,96' />
                <path d='M90,96 L96,96 L96,90' />
            </g>
            {/* Centre focus point */}
            <g stroke='rgba(255,255,255,0.4)' strokeWidth='0.4' fill='none'>
                <rect x='47' y='47' width='6' height='6' />
                <line x1='50' y1='44' x2='50' y2='46' />
                <line x1='50' y1='54' x2='50' y2='56' />
                <line x1='44' y1='50' x2='46' y2='50' />
                <line x1='54' y1='50' x2='56' y2='50' />
            </g>
            {/* Bottom info bar */}
            <rect x='0' y='94' width='100' height='6' fill='rgba(0,0,0,0.35)' />
            <text x='3' y='98.5' fontSize='3.2' fill='rgba(255,255,255,0.65)' fontFamily='monospace'>
                {r.aperture}  {r.shutter}  ISO {r.iso}  {r.focalLen}mm
            </text>
            <text x='97' y='98.5' textAnchor='end' fontSize='3' fill='rgba(255,255,255,0.5)' fontFamily='monospace'>
                {r.ts.slice(11)}
            </text>
            {/* Battery top-right */}
            <g fill='none' stroke='rgba(255,255,255,0.5)' strokeWidth='0.35' transform='translate(93.5,3)'>
                <rect x='-4' y='-1.8' width='5' height='3.2' rx='0.3' />
                <rect x='1' y='-0.7' width='0.9' height='1.4' fill='rgba(255,255,255,0.5)' stroke='none' />
                <rect x='-3.7' y='-1.5' width={5 * r.battPct / 100 * 0.73} height='2.6' fill={r.battColor} stroke='none' />
            </g>
            <text x='91.5' y='5' textAnchor='end' fontSize='2.5' fill='rgba(255,255,255,0.45)' fontFamily='monospace'>{r.battPct}%</text>
        </svg>
    )
}

// ── HELMET CAM ────────────────────────────────────────────────────────────────

export function HelmetCamOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            <defs>
                <radialGradient id='hcVig' cx='50%' cy='50%' r='60%'>
                    <stop offset='60%' stopColor='black' stopOpacity='0' />
                    <stop offset='100%' stopColor='black' stopOpacity='0.45' />
                </radialGradient>
            </defs>
            <rect width='100' height='100' fill='url(#hcVig)' />
            {/* REC indicator */}
            <circle cx='94' cy='5' r='2' fill='rgba(220,0,0,0.9)' />
            <text x='90.5' y='5.5' textAnchor='end' fontSize='3' fill='rgba(255,255,255,0.8)' fontFamily='monospace'>REC {r.recStr}</text>
            {/* Timestamp */}
            <text x='3' y='6' fontSize='3' fill='rgba(255,255,255,0.7)' fontFamily='monospace'>{r.ts}</text>
            {/* GPS bottom-left */}
            <text x='3' y='96' fontSize='2.8' fill='rgba(255,255,255,0.55)' fontFamily='monospace'>{r.latStr}  {r.lonStr}</text>
            {/* Battery bottom-right */}
            <g fill='none' stroke='rgba(255,255,255,0.6)' strokeWidth='0.4' transform='translate(94,93)'>
                <rect x='-4' y='-2' width='5' height='3.5' rx='0.3' />
                <rect x='1' y='-0.8' width='1' height='1.6' fill='rgba(255,255,255,0.6)' stroke='none' />
                <rect x='-3.6' y='-1.6' width={5 * r.battPct / 100 * 0.72} height='2.7' fill={r.battColor} stroke='none' />
            </g>
        </svg>
    )
}

// ── BODYCAM ───────────────────────────────────────────────────────────────────

export function BodcamOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            <rect x='0.5' y='0.5' width='99' height='99' fill='none' stroke='rgba(255,255,255,0.2)' strokeWidth='1' />
            {/* Top bar */}
            <rect x='0' y='0' width='100' height='7' fill='rgba(0,0,0,0.45)' />
            <circle cx='5' cy='3.5' r='1.8' fill='rgba(220,0,0,0.9)' />
            <text x='9' y='5.2' fontSize='3.5' fill='rgba(255,255,255,0.85)' fontFamily='monospace'>RECORDING  {r.recStr}</text>
            <text x='97' y='5.2' textAnchor='end' fontSize='3.5' fill='rgba(255,255,255,0.6)' fontFamily='monospace'>{r.ts}</text>
            {/* Bottom bar */}
            <rect x='0' y='93' width='100' height='7' fill='rgba(0,0,0,0.45)' />
            <text x='3' y='97.5' fontSize='3' fill='rgba(255,255,255,0.5)' fontFamily='monospace'>CAM-{pad(r.camNum)}  GPS: {r.latStr} {r.lonStr}</text>
            {/* Battery */}
            <text x='97' y='97.5' textAnchor='end' fontSize='3' fill={r.battColor} fontFamily='monospace'>BAT {r.battBars}</text>
        </svg>
    )
}

// ── DRONE / UAV ───────────────────────────────────────────────────────────────

export function DroneUavOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            {/* Corner HUD brackets */}
            <g stroke='rgba(0,220,180,0.7)' strokeWidth='0.6' fill='none'>
                <path d='M2,10 L2,2 L10,2' />
                <path d='M88,2 L98,2 L98,10' />
                <path d='M2,90 L2,98 L10,98' />
                <path d='M88,98 L98,98 L98,90' />
            </g>
            {/* Crosshair */}
            <g stroke='rgba(0,220,180,0.5)' strokeWidth='0.4' fill='none'>
                <circle cx='50' cy='50' r='3' />
                <line x1='50' y1='44' x2='50' y2='47' />
                <line x1='50' y1='53' x2='50' y2='56' />
                <line x1='44' y1='50' x2='47' y2='50' />
                <line x1='53' y1='50' x2='56' y2='50' />
            </g>
            {/* Top bar */}
            <rect x='0' y='0' width='100' height='8' fill='rgba(0,0,0,0.5)' />
            <text x='3' y='5.5' fontSize='3.2' fill='rgba(0,220,180,0.9)' fontFamily='monospace'>UAV ◈ LIVE  {r.ts}</text>
            <text x='97' y='5.5' textAnchor='end' fontSize='3.2' fill={r.battColor} fontFamily='monospace'>BAT {r.battBars}</text>
            {/* Bottom bar */}
            <rect x='0' y='92' width='100' height='8' fill='rgba(0,0,0,0.5)' />
            <text x='3' y='97.2' fontSize='3.2' fill='rgba(0,220,180,0.8)' fontFamily='monospace'>ALT {r.alt}m  SPD {r.spd}kts  HDG {pad(r.hdg, 3)}°</text>
            <text x='97' y='97.2' textAnchor='end' fontSize='3.2' fill='rgba(0,220,180,0.8)' fontFamily='monospace'>{r.latStr}  {r.lonStr}</text>
        </svg>
    )
}

// ── CCTV ──────────────────────────────────────────────────────────────────────

export function CctvOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            <rect x='0.3' y='0.3' width='99.4' height='99.4' fill='none' stroke='rgba(255,255,255,0.1)' strokeWidth='0.6' />
            {/* Top bar */}
            <rect x='0' y='0' width='100' height='7.5' fill='rgba(0,0,0,0.6)' />
            <circle cx='4' cy='3.8' r='1.8' fill='rgba(220,0,0,0.9)' />
            <text x='8' y='5.3' fontSize='3.5' fill='rgba(255,255,255,0.85)' fontFamily='monospace'>CAM {pad(r.camNum)}  REC {r.recStr}</text>
            <text x='97' y='5.3' textAnchor='end' fontSize='3.5' fill='rgba(255,255,255,0.65)' fontFamily='monospace'>{r.dateOnly}</text>
            {/* Bottom bar */}
            <rect x='0' y='92.5' width='100' height='7.5' fill='rgba(0,0,0,0.6)' />
            <text x='3' y='97.5' fontSize='3.5' fill='rgba(255,255,255,0.65)' fontFamily='monospace'>{r.siteId}  CH{pad(r.camNum)}  {r.timeOnly}</text>
            {/* Corner camera icon */}
            <g fill='rgba(255,255,255,0.35)' transform='translate(92,1.5)'>
                <rect x='0' y='1' width='5' height='3.5' rx='0.5' />
                <polygon points='5,1.8 7.5,0.5 7.5,5 5,3.7' />
            </g>
        </svg>
    )
}

// ── LONG-RANGE / TELEPHOTO ────────────────────────────────────────────────────

export function LongRangeOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            {/* Scope reticle */}
            <g stroke='rgba(255,60,60,0.65)' strokeWidth='0.5' fill='none'>
                <circle cx='50' cy='50' r='20' />
                <line x1='50' y1='28' x2='50' y2='46' />
                <line x1='50' y1='54' x2='50' y2='72' />
                <line x1='28' y1='50' x2='46' y2='50' />
                <line x1='54' y1='50' x2='72' y2='50' />
                {[-12, -8, -4, 4, 8, 12].map(d => (
                    <circle key={d} cx={50 + d} cy='50' r='0.6' fill='rgba(255,60,60,0.65)' stroke='none' />
                ))}
                <line x1='40' y1='74' x2='60' y2='74' />
                {[40, 45, 50, 55, 60].map((x, i) => (
                    <line key={x} x1={x} y1={74} x2={x} y2={i === 2 ? 71 : 72.5} />
                ))}
            </g>
            {/* Info panel bottom-right */}
            <rect x='68' y='88' width='30' height='11' fill='rgba(0,0,0,0.55)' />
            <text x='70' y='92.5' fontSize='2.8' fill='rgba(255,60,60,0.85)' fontFamily='monospace'>RNG: {r.rngM}m</text>
            <text x='70' y='97' fontSize='2.8' fill='rgba(255,60,60,0.7)' fontFamily='monospace'>ELEV: {r.elev > 0 ? '+' : ''}{r.elev}°</text>
            {/* Grid ref top-left */}
            <rect x='0' y='0' width='100' height='6.5' fill='rgba(0,0,0,0.5)' />
            <text x='3' y='4.8' fontSize='2.8' fill='rgba(255,60,60,0.75)' fontFamily='monospace'>GRID: {r.gridRef}</text>
            <text x='97' y='4.8' textAnchor='end' fontSize='2.8' fill='rgba(255,60,60,0.6)' fontFamily='monospace'>{r.ts.slice(11)}</text>
        </svg>
    )
}

// ── SATELLITE / ISR ───────────────────────────────────────────────────────────

export function SatelliteIsrOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            {/* Subtle grid */}
            <g stroke='rgba(255,255,255,0.08)' strokeWidth='0.3' fill='none'>
                {[10,20,30,40,50,60,70,80,90].map(v => (
                    <React.Fragment key={v}>
                        <line x1={v} y1='0' x2={v} y2='100' />
                        <line x1='0' y1={v} x2='100' y2={v} />
                    </React.Fragment>
                ))}
            </g>
            {/* Top bar */}
            <rect x='0' y='0' width='100' height='6.5' fill='rgba(0,0,0,0.6)' />
            <text x='50' y='4.7' textAnchor='middle' fontSize='3.5' fill='rgba(255,255,255,0.75)' fontFamily='monospace' letterSpacing='0.15em'>UNCLASSIFIED</text>
            {/* Bottom bar */}
            <rect x='0' y='93.5' width='100' height='6.5' fill='rgba(0,0,0,0.6)' />
            <text x='3' y='97.8' fontSize='2.8' fill='rgba(255,255,255,0.6)' fontFamily='monospace'>
                {r.latStr}  {r.lonStr}  ALT: {r.alt * 4}m  {r.dateOnly}
            </text>
            {/* Corner brackets */}
            <g stroke='rgba(255,255,255,0.3)' strokeWidth='0.5' fill='none'>
                <path d='M3,10 L3,3 L10,3' />
                <path d='M87,3 L97,3 L97,10' />
                <path d='M3,90 L3,97 L10,97' />
                <path d='M87,97 L97,97 L97,90' />
            </g>
        </svg>
    )
}

// ── THERMAL ───────────────────────────────────────────────────────────────────

export function ThermalOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    const hotTemp  = ri(34, 38)
    const coldTemp = ri(-2, 8)
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            {/* Top info bar */}
            <rect x='0' y='0' width='100' height='7' fill='rgba(0,0,0,0.55)' />
            <text x='3' y='5' fontSize='3.5' fill='rgba(255,160,0,0.9)' fontFamily='monospace'>THERMAL  FLIR  WHT-HOT</text>
            <text x='97' y='5' textAnchor='end' fontSize='3.5' fill='rgba(255,160,0,0.75)' fontFamily='monospace'>{r.timeOnly}</text>
            {/* Temperature scale right side */}
            <defs>
                <linearGradient id='thermalScale' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='white' />
                    <stop offset='30%' stopColor='rgb(255,120,0)' />
                    <stop offset='60%' stopColor='rgb(100,0,100)' />
                    <stop offset='100%' stopColor='rgb(0,0,60)' />
                </linearGradient>
            </defs>
            <rect x='96' y='15' width='3' height='60' fill='url(#thermalScale)' />
            <text x='94.5' y='17' textAnchor='end' fontSize='2.6' fill='rgba(255,255,255,0.7)' fontFamily='monospace'>{hotTemp}°C</text>
            <text x='94.5' y='76' textAnchor='end' fontSize='2.6' fill='rgba(255,255,255,0.7)' fontFamily='monospace'>{coldTemp}°C</text>
            {/* Bottom bar */}
            <rect x='0' y='93' width='100' height='7' fill='rgba(0,0,0,0.55)' />
            <text x='3' y='97.5' fontSize='3' fill='rgba(255,160,0,0.7)' fontFamily='monospace'>SENS: HIGH  {r.dateOnly}  {r.timeOnly}</text>
        </svg>
    )
}

// ── NIGHT VISION ──────────────────────────────────────────────────────────────

export function NightVisionOverlay({ style, className }: OverlayProps) {
    const r = useRandValues()
    return (
        <svg className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} viewBox='0 0 100 100' preserveAspectRatio='none'>
            <defs>
                <radialGradient id='nvVig' cx='50%' cy='50%' r='52%'>
                    <stop offset='72%' stopColor='black' stopOpacity='0' />
                    <stop offset='95%' stopColor='black' stopOpacity='0.8' />
                    <stop offset='100%' stopColor='black' stopOpacity='1' />
                </radialGradient>
                <radialGradient id='nvInner' cx='50%' cy='50%' r='50%'>
                    <stop offset='0%' stopColor='rgba(0,40,0,0)' />
                    <stop offset='70%' stopColor='rgba(0,40,0,0)' />
                    <stop offset='100%' stopColor='rgba(0,40,0,0.15)' />
                </radialGradient>
            </defs>
            <rect width='100' height='100' fill='url(#nvVig)' />
            <rect width='100' height='100' fill='url(#nvInner)' />
            {/* Crosshair */}
            <g stroke='rgba(0,200,0,0.4)' strokeWidth='0.4' fill='none'>
                <circle cx='50' cy='50' r='1.5' />
                <line x1='50' y1='46' x2='50' y2='48.3' />
                <line x1='50' y1='51.7' x2='50' y2='54' />
                <line x1='46' y1='50' x2='48.3' y2='50' />
                <line x1='51.7' y1='50' x2='54' y2='50' />
            </g>
            {/* NV indicator top-left */}
            <text x='12' y='12' textAnchor='middle' fontSize='3.5' fill='rgba(0,200,0,0.7)' fontFamily='monospace'>NV·GEN3</text>
            {/* Battery + time bottom */}
            <text x='7' y='90' fontSize='3' fill={r.battColor} fontFamily='monospace'>PWR {r.battBars} {r.battPct}%</text>
            <text x='93' y='90' textAnchor='end' fontSize='3' fill='rgba(0,200,0,0.6)' fontFamily='monospace'>{r.timeOnly}</text>
        </svg>
    )
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const OVERLAY_MAP: Record<AiCameraStyle, React.ComponentType<OverlayProps>> = {
    dslr:          DslrOverlay,
    helmet_cam:    HelmetCamOverlay,
    bodycam:       BodcamOverlay,
    drone_uav:     DroneUavOverlay,
    cctv:          CctvOverlay,
    long_range:    LongRangeOverlay,
    satellite_isr: SatelliteIsrOverlay,
    thermal:       ThermalOverlay,
    night_vision:  NightVisionOverlay,
}

export default function CameraOverlay({
    cameraStyle,
    style,
    className,
}: {
    cameraStyle: AiCameraStyle
    style?: React.CSSProperties
    className?: string
}) {
    const Component = OVERLAY_MAP[cameraStyle]
    if (!Component) return null
    return <Component style={style} className={className} />
}
