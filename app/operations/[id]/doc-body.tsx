'use client'

import { useEffect, useState } from 'react'
import { generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'

const extensions = [
    StarterKit,
    Underline,
    Image,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight,
]

export default function DocBody({ content }: { content: any }) {
    const [html, setHtml] = useState<string | null>(null)

    useEffect(() => {
        if (!content) return
        try {
            setHtml(generateHTML(content, extensions))
        } catch {
            setHtml(null)
        }
    }, [content])

    if (!html) return (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(237,237,237,0.15)', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontStyle: 'italic' }}>
            No document body yet
        </div>
    )

    return (
        <div
            className='op-doc'
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
                border: '1px solid rgba(219,0,29,0.12)',
                background: 'rgba(255,255,255,0.01)',
                padding: '40px 48px',
            }}
        />
    )
}
