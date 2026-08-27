import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'

/**
 * The schema-defining half of the operation editor's extension list.
 *
 * Split out of CollabEditor so anything that needs to *produce* content for
 * that editor can build the same schema, rather than a lookalike that drifts.
 * A node or mark this list doesn't know about is silently dropped when the
 * document loads, which fails quietly and looks like data loss — so the mock
 * document generator's tests validate against this exact list.
 *
 * What is deliberately NOT here:
 *
 * - `ResizableImage` — schema-defining, but it carries a React node view, and
 *   moving that would drag the whole view layer into every consumer. Nothing
 *   that generates content needs the `image` node, and a schema missing a node
 *   the content never uses is harmless: the real editor still parses
 *   everything this list produces.
 * - `Placeholder`, `GlobalDragHandle`, `Collaboration`, the cursor plugin —
 *   none define nodes or marks. They are per-instance behaviour and stay with
 *   the editor that mounts them.
 *
 * Returns a fresh array per call rather than a shared const: these were
 * `.configure()`d inline per editor before, and every section mounts its own
 * editor. Handing the same objects to all of them is a behaviour change nobody
 * asked for.
 */
export const FontSize = Extension.create({
    name: 'fontSize',
    addGlobalAttributes() {
        return [{
            types: ['textStyle'],
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: (el: HTMLElement) => el.style.fontSize || null,
                    renderHTML: (attrs: Record<string, any>) =>
                        attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
                },
            },
        }]
    },
    addCommands() {
        return {
            setFontSize: (size: string) => ({ chain }: any) =>
                chain().setMark('textStyle', { fontSize: size }).run(),
            unsetFontSize: () => ({ chain }: any) =>
                chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        } as any
    },
})

export function contentExtensions() {
    return [
        StarterKit.configure({ undoRedo: false }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Highlight.configure({ multicolor: false }),
        Underline,
        TextStyle,
        FontSize,
        Link.configure({
            openOnClick: false,
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        }),
    ]
}
