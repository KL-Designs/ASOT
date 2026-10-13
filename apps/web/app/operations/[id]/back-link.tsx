'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * The orders page's way back.
 *
 * Where "back" goes depends on how the reader arrived: from the J2 dashboard,
 * from the mission editor's Preview button, or from anywhere else. The first is
 * resolved on the server and passed in. The second is read here, off
 * `?from=editor`, rather than threaded through every theme as another prop —
 * a mission maker checking their work was being dropped on the operations
 * board and had to find their way into the editor again.
 */
export default function BackLink({ operationId, fromJ2, fallbackLabel = '← Back', style }: {
    operationId: string
    fromJ2: boolean
    /** What the link says when it leads to the operations board. */
    fallbackLabel?: string
    style?: CSSProperties
}) {
    const fromEditor = useSearchParams().get('from') === 'editor'

    const href = fromEditor ? `/operations/${operationId}/edit` : fromJ2 ? '/dashboard/j2' : '/operations'
    const label = fromEditor ? '← Editor' : fromJ2 ? '← J2 Operations' : fallbackLabel

    return <Link href={href as Route} style={style}>{label}</Link>
}
