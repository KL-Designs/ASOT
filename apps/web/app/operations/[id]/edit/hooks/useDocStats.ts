'use client'

import { useEffect, useState } from 'react'
import type * as Y from 'yjs'
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror'
import { docStats, type DocStats } from '@/lib/operations/doc-stats'

export function useDocStats(ydoc: Y.Doc | null, activePage: string): DocStats {
    const [stats, setStats] = useState<DocStats>({ words: 0, sections: 0 })

    useEffect(() => {
        if (!ydoc) return
        const frag = ydoc.getXmlFragment(activePage)

        const recompute = () => {
            // Y.XmlFragment#toJSON() serialises to an XML *string*, not a node
            // tree — docStats needs the ProseMirror-shaped { type, content, text }
            // tree that y-prosemirror's own (de)serialiser produces, so we reuse
            // that instead of frag.toJSON().
            try { setStats(docStats(yXmlFragmentToProsemirrorJSON(frag))) }
            catch { setStats({ words: 0, sections: 0 }) }
        }

        recompute()
        frag.observeDeep(recompute)
        return () => frag.unobserveDeep(recompute)
    }, [ydoc, activePage])

    return stats
}
