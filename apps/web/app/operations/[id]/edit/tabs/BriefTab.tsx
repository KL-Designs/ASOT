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
}

/**
 * Documents rail + collaborative editor. `CollabEditor` (imported here as
 * `OperationEditor`, matching the name page.tsx used before this split)
 * already renders `PageSidebar` internally as its own documents rail — see
 * the design doc's non-goal on not rewriting `CollabEditor.tsx` beyond the
 * one permitted `onProviderReady` prop, so that internal structure is
 * untouched.
 *
 * The old panel's `loaded ? <OperationEditor/> : <skeleton/>` branch is
 * dropped: page.tsx already returns its own full-page loading state before
 * `EditorShell` (and therefore this tab) ever mounts, so `loaded` was always
 * `true` by the time that skeleton could render — dead code, not a moved
 * capability.
 */
export default function BriefTab({
    opID, initialContent, themeColor, title, department, date, loreDate,
    onMetaChange, metaHandleRef, onSaveStatusChange, onProviderReady,
}: Props) {
    return (
        <div style={{ width: '100%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)' }}>
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
            />
        </div>
    )
}
