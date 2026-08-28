import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
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
 * "Anything that needs to produce content" now includes anything that needs to
 * *render* it: `app/operations/[id]/doc-body.tsx` builds the read view's HTML
 * from this list. It used to keep a hand-written lookalike, and the lookalike
 * was missing `TextStyle`/`FontSize` — so any section whose author had touched
 * a font size threw on load and showed "No document body yet" over content that
 * was sitting in the database the whole time.
 *
 * What is deliberately NOT here:
 *
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

/**
 * The image node's schema, without the React node view that draws it.
 *
 * Split from `ResizableImage` (CollabEditor.tsx) for the reason the list above
 * exists: the attributes are schema, and every consumer needs them to parse a
 * document containing an image, but only the editor needs the resize handles.
 * `ResizableImage` is now this plus `addNodeView()`.
 */
export const ContentImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: (el: HTMLElement) => {
                    const w = el.getAttribute('width') || el.style.width
                    return w ? (parseInt(w, 10) || null) : null
                },
                renderHTML: (attrs: Record<string, any>) =>
                    attrs.width ? { style: `width:${attrs.width}px`, width: attrs.width } : {},
            },
            align: {
                default: 'center',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-align') || 'center',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-align': attrs.align || 'center' }),
            },
            position: {
                default: 'break',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-position') || 'break',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-position': attrs.position || 'break' }),
            },
            borderStyle: {
                default: 'none',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-border-style') || 'none',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-border-style': attrs.borderStyle || 'none' }),
            },
            borderColor: {
                default: '#ffffff',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-border-color') || '#ffffff',
                renderHTML: (attrs: Record<string, any>) => ({ 'data-border-color': attrs.borderColor || '#ffffff' }),
            },
            borderWidth: {
                default: 2,
                parseHTML: (el: HTMLElement) => parseInt(el.getAttribute('data-border-width') || '2'),
                renderHTML: (attrs: Record<string, any>) => ({ 'data-border-width': String(attrs.borderWidth ?? 2) }),
            },
        }
    },
})

export function contentExtensions() {
    return [
        StarterKit.configure({ undoRedo: false }),
        ContentImage,
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
