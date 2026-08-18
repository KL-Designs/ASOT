'use client'

import { useEffect, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'

/**
 * The status bar's "n editing" comes from the awareness protocol
 * `CollabEditor` already maintains for its collaborative cursors, so this
 * reads it rather than opening a second channel.
 */
export function usePresence(provider: HocuspocusProvider | null): number {
    const [count, setCount] = useState(0)

    useEffect(() => {
        if (!provider) return
        const awareness = provider.awareness
        if (!awareness) return

        const update = () => setCount(awareness.getStates().size)
        update()
        awareness.on('change', update)
        return () => awareness.off('change', update)
    }, [provider])

    return count
}
