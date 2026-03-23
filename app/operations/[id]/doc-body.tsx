'use client'

import { useEffect, useState } from 'react'
import { generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'

const extensions = [
    StarterKit,
    Underline,
    Image,
    Link.configure({ HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight,
]

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

export default function DocBody({ content, themeColor = '#db001d' }: { content: any, themeColor?: string }) {
    const [html, setHtml] = useState<string | null>(null)

    useEffect(() => {
        if (!content) return
        try {
            setHtml(generateHTML(content, extensions))
        } catch {
            setHtml(null)
        }
    }, [content])

    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const themeCSS = `
        .op-doc h1 { border-left-color: ${c(0.75)}; background: ${c(0.045)}; }
        .op-doc h2 { color: ${c(0.88)}; }
        .op-doc h2::before { color: ${c(0.65)}; }
        .op-doc ul li::marker { color: ${c(0.55)}; }
        .op-doc ol li::marker { color: ${c(0.55)}; }
        .op-doc blockquote { border-left-color: ${c(0.5)}; background: ${c(0.04)}; }
        .op-doc hr { border-top-color: ${c(0.18)}; }
        .op-doc mark { background: ${c(0.22)}; }
        .op-doc a { color: ${c(0.9)}; }
    `

    if (!html) return (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(237,237,237,0.15)', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontStyle: 'italic' }}>
            No document body yet
        </div>
    )

    return (
        <>
            <style>{themeCSS}</style>
            <div
                className='op-doc'
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </>
    )
}
