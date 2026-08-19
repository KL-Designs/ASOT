'use client'

import MapSection from '@/components/operations/map/MapSection'
import type { MapWorld } from '@/components/operations/map/types'

interface Props {
    operationId: string
    canEdit: boolean
    world: MapWorld | null
}

/**
 * Embeds the same `MapSection` the standalone `/operations/[id]/map` route
 * renders (that route is unchanged and stays as the fullscreen entry point —
 * see the design doc's non-goal on it). `MapSection` owns its own Y.js state
 * via `useMapYjs`, which is why EditorShell keeps this tab mounted with
 * `display: none` rather than unmounting it on tab switch.
 */
export default function MapTab({ operationId, canEdit, world }: Props) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <MapSection operationId={operationId} canEdit={canEdit} world={world} />
            </div>
        </div>
    )
}
