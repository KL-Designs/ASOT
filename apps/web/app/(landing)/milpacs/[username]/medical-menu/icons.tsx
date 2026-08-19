import React from 'react'
import type { ToolId } from './actions'

/* Toolbar glyphs. Stroked rather than filled so one `currentColor` carries the
   active state without a second copy of each icon. */

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const Triage = () => <svg viewBox='0 0 24 24' {...P}><path d='M7 3h10v18l-5-3-5 3z' /><path d='M12 8v6M9 11h6' /></svg>
const Examine = () => <svg viewBox='0 0 24 24' {...P}><circle cx='11' cy='11' r='7' /><path d='M16.5 16.5 21 21' /><path d='M11 8v6M8 11h6' /></svg>
const Bandage = () => <svg viewBox='0 0 24 24' {...P}><rect x='2.5' y='8' width='19' height='8' rx='4' transform='rotate(-38 12 12)' /><path d='M10 10.5l3.5 3.5M13 9l1.5 1.5M9 12.5l1.5 1.5' /></svg>
const Medication = () => <svg viewBox='0 0 24 24' {...P}><rect x='6' y='7' width='12' height='14' rx='2' /><path d='M9 4h6v3H9z' /><path d='M12 11v6M9 14h6' /></svg>
const Airway = () => <svg viewBox='0 0 24 24' {...P}><circle cx='12' cy='6' r='3' /><path d='M12 9v6M8.5 12h7M9 21l1.5-6M15 21l-1.5-6' /></svg>
const Advanced = () => <svg viewBox='0 0 24 24' {...P}><path d='M2 12h4l2-6 4 12 2.5-8 1.8 4H22' /></svg>
const Splint = () => <svg viewBox='0 0 24 24' {...P}><path d='M5 19 19 5' /><path d='M4 6l3-3 3 3-3 3z' /><path d='M14 18l3-3 3 3-3 3z' /></svg>
const Drag = () => <svg viewBox='0 0 24 24' {...P}><circle cx='9' cy='4.5' r='2' /><path d='M9 7l-2 5 3 3 1 6M9 12l-4 2M12 10l4 2' /><path d='M17 20h4' /></svg>
const Transfer = () => <svg viewBox='0 0 24 24' {...P}><circle cx='7' cy='7' r='2.6' /><circle cx='17' cy='7' r='2.6' /><path d='M3 19c0-3 2-5 4-5s4 2 4 5M13 19c0-3 2-5 4-5s4 2 4 5' /></svg>

export const TOOL_ICONS: Record<ToolId, () => React.JSX.Element> = {
    triage: Triage,
    examine: Examine,
    bandage: Bandage,
    medication: Medication,
    airway: Airway,
    advanced: Advanced,
    splint: Splint,
    drag: Drag,
    transfer: Transfer,
}
