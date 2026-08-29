'use client'

import dynamic from 'next/dynamic'
import type { HocuspocusProvider } from '@hocuspocus/provider'

const OperationEditor = dynamic(() => import('@/components/editor/CollabEditor'), { ssr: false })

interface Props {
    opID: string
    initialContent: any
    themeColor: string
    title: string
    department: string
    date: string
    loreDate: string
    onMetaChange: (fields: Record<string, string>) => void
    metaHandleRef: React.MutableRefObject<{ set: (key: string, value: string) => void } | null>
    onSaveStatusChange: (status: 'saved' | 'saving' | 'unsaved') => void
    /** Wired to `usePresence`/`useDocStats` in page.tsx for the status bar —
     * see the ruling on CollabEditor's one permitted new prop. */
    onProviderReady: (provider: HocuspocusProvider) => void
    /**
     * `operations.zeus`. Without it the Zeus Notes pages are not listed in the
     * rail and cannot be opened — they are ordinary documents in every other
     * respect, and this is the only thing that separates them.
     */
    canZeus?: boolean
}

/**
 * Documents rail + collaborative editor. `CollabEditor` (imported here as
 * `OperationEditor`, matching the name page.tsx used before this split)
 * already renders `PageSidebar` internally as its own documents rail.
 *
 * No padding/max-width wrapper here (unlike the old card-based design):
 * the documents rail must sit flush against the shell's own left edge, full
 * height, with no gap above or beside it (visual-fixes spec §1) — a padded,
 * centred wrapper around the whole thing would reintroduce exactly that
 * gap. `CollabEditor` now owns its own layout: the rail renders flush left,
 * and its own content column applies the padding/max-width centering
 * (spec §2) to just the document body, not the rail.
 *
 * The old panel's `loaded ? <OperationEditor/> : <skeleton/>` branch is
 * dropped: page.tsx already returns its own full-page loading state before
 * `EditorShell` (and therefore this tab) ever mounts, so `loaded` was always
 * `true` by the time that skeleton could render — dead code, not a moved
 * capability.
 */
export default function BriefTab({
    opID, initialContent, themeColor, title, department, date, loreDate,
    onMetaChange, metaHandleRef, onSaveStatusChange, onProviderReady, canZeus = false,
}: Props) {
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <OperationEditor
                documentId={opID}
                uploadUrl='/api/operations/upload'
                defaultSectionTitle='Situation'
                initialContent={initialContent}
                themeColor={themeColor}
                initialMeta={{ title, department, date, loreDate }}
                onMetaChange={onMetaChange}
                metaHandleRef={metaHandleRef}
                onSaveStatusChange={onSaveStatusChange}
                onProviderReady={onProviderReady}
                allowedTypes={canZeus ? undefined : ['orders', 'staff_orders', 'separator']}
                hiddenTypes={canZeus ? undefined : ['zeus']}
            />
        </div>
    )
}
