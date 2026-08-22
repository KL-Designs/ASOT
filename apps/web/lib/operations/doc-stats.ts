export interface DocStats {
    words: number
    sections: number
}

interface PmNode {
    type?: string
    text?: string
    content?: PmNode[]
}

/**
 * Word and section counts over a ProseMirror JSON document.
 *
 * Deliberately takes plain JSON rather than a TipTap Editor: the status bar
 * gets its document from the Y.Doc, and keeping this free of editor types is
 * what lets it be unit tested under the node-environment vitest runner.
 */
export function docStats(doc: unknown): DocStats {
    let words = 0
    let sections = 0

    const walk = (node: PmNode | null | undefined): void => {
        if (!node || typeof node !== 'object') return
        if (node.type === 'heading') sections++
        if (typeof node.text === 'string') {
            const trimmed = node.text.trim()
            if (trimmed) words += trimmed.split(/\s+/).length
        }
        node.content?.forEach(walk)
    }

    walk(doc as PmNode)
    return { words, sections }
}
