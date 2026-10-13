/**
 * Layers on the operation map: overlays, the layers inside them, and who sees
 * which.
 *
 * Three things the flat list of layers could not do:
 *
 *  1. **Layers within a layer.** An overlay — "HQ orders", "1-1 Alpha" — can
 *     hold sub-layers (logistics, indirect fire, recon) that are switched on
 *     and off on their own. Hiding the overlay hides everything in it.
 *  2. **Copying an overlay.** A callsign copies HQ's orders onto an overlay of
 *     its own and edits the copy, leaving HQ's untouched.
 *  3. **Choosing what you look at.** Which overlays are shown is each viewer's
 *     own choice. It used to be one switch stored in the shared document, so
 *     one person hiding a layer hid it for everybody — and a member who could
 *     not edit the map could not choose at all.
 *
 * Pure and import-free: the tree, the visibility rule and the copy are all
 * functions of plain data, tested without Yjs or a map.
 */

export interface LayerNode {
    id: string
    name: string
    color: string
    /** The shared default: what somebody who has not chosen sees. */
    visible: boolean
    order: number
    /** The overlay this layer sits inside, or null for an overlay itself. */
    parentId?: string | null
}

export interface LayerTreeNode<T extends LayerNode = LayerNode> {
    layer: T
    children: T[]
}

/**
 * The layers as overlays with their sub-layers, in order.
 *
 * One level deep, deliberately: an overlay and the layers in it. A layer whose
 * parent no longer exists — or is itself a sub-layer — is shown as an overlay
 * rather than lost, since a layer nobody can see in the list is a layer nobody
 * can delete.
 */
export function layerTree<T extends LayerNode>(layers: readonly T[]): LayerTreeNode<T>[] {
    const sorted = [...layers].sort((a, b) => a.order - b.order)
    const top = new Set(sorted.filter(l => !l.parentId).map(l => l.id))
    const isChild = (l: T) => !!l.parentId && top.has(l.parentId)

    return sorted
        .filter(l => !isChild(l))
        .map(layer => ({ layer, children: sorted.filter(l => isChild(l) && l.parentId === layer.id) }))
}

/** An overlay and everything in it. */
export function withDescendants(layers: readonly LayerNode[], id: string): string[] {
    const out = [id]
    for (let i = 0; i < out.length; i++) {
        for (const layer of layers) {
            if (layer.parentId === out[i] && !out.includes(layer.id)) out.push(layer.id)
        }
    }
    return out
}

/**
 * A viewer's own choices: layer id → shown or hidden. A layer that is not in
 * here follows the shared default.
 */
export type LayerChoices = Record<string, boolean>

/** Is this layer switched on for this viewer, ignoring its parent? */
export function chosenVisible(layer: LayerNode, choices: LayerChoices): boolean {
    return choices[layer.id] ?? layer.visible
}

/**
 * The layers as this viewer sees them: `visible` is true only when the layer
 * and the overlay it sits in are both switched on. The map, the layer list and
 * the SQF export all read this, so "what I can see" and "what gets exported"
 * are the same thing.
 */
export function resolveVisibility<T extends LayerNode>(layers: readonly T[], choices: LayerChoices): T[] {
    const byId = new Map(layers.map(l => [l.id, l]))
    return layers.map(layer => {
        const parent = layer.parentId ? byId.get(layer.parentId) : undefined
        const visible = chosenVisible(layer, choices) && (!parent || chosenVisible(parent, choices))
        return { ...layer, visible }
    })
}

/** Drop choices for layers that no longer exist, so the stored set cannot grow forever. */
export function pruneChoices(choices: LayerChoices, layers: readonly LayerNode[]): LayerChoices {
    const live = new Set(layers.map(l => l.id))
    return Object.fromEntries(Object.entries(choices).filter(([id]) => live.has(id)))
}

export interface CopyableAnnotation {
    id: string
    layerId: string
}

export interface OverlayCopy<L extends LayerNode, A extends CopyableAnnotation> {
    /** The new layers, the overlay first. */
    layers: L[]
    annotations: A[]
}

/**
 * A copy of an overlay: the layer, its sub-layers, and everything drawn on
 * them, under new ids.
 *
 * Copying a sub-layer on its own gives a new sub-layer beside it, in the same
 * overlay. The copy is switched on and placed after the last existing layer.
 * Nothing in the original is touched — that is the point: a callsign edits its
 * copy of HQ's orders, not HQ's orders.
 */
export function copyOverlay<L extends LayerNode, A extends CopyableAnnotation>(
    layers: readonly L[],
    annotations: readonly A[],
    sourceId: string,
    name: string,
    newId: () => string,
): OverlayCopy<L, A> | null {
    const source = layers.find(l => l.id === sourceId)
    if (!source) return null

    const ids = withDescendants(layers, sourceId)
    const mapping = new Map(ids.map(id => [id, newId()]))
    const nextOrder = Math.max(-1, ...layers.map(l => l.order)) + 1

    const copied = ids.map((id, i) => {
        const original = layers.find(l => l.id === id) as L
        const isRoot = id === sourceId
        return {
            ...original,
            id: mapping.get(id) as string,
            name: isRoot ? name : original.name,
            visible: true,
            order: nextOrder + i,
            // The root keeps its own parent (a copied sub-layer stays in its
            // overlay); everything under it points at the new copies.
            parentId: isRoot ? (original.parentId ?? null) : mapping.get(original.parentId as string) ?? null,
        }
    })

    return {
        layers: copied,
        annotations: annotations
            .filter(a => mapping.has(a.layerId))
            .map(a => ({ ...a, id: newId(), layerId: mapping.get(a.layerId) as string })),
    }
}
