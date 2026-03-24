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

export default function DocBody({ content, themeColor = '#db001d', pageTheme = 'modern' }: { content: any, themeColor?: string, pageTheme?: 'modern' | 'oldfashioned' | 'scifi' }) {
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

    let themeCSS = ''
    if (!pageTheme || pageTheme === 'modern') {
        themeCSS = `
        .op-doc { font-family: inherit; color: rgba(237,237,237,0.78); line-height: 1.7; }
        .op-doc p { margin: 0.7em 0; }
        .op-doc h1 { border-left: 3px solid ${c(0.75)}; background: ${c(0.045)}; padding: 8px 14px; font-size: 1.05rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(237,237,237,0.9); margin: 1.4em 0 0.6em; }
        .op-doc h2 { font-size: 0.85rem; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: ${c(0.88)}; margin: 1.2em 0 0.5em; }
        .op-doc h2::before { content: '// '; color: ${c(0.65)}; }
        .op-doc h3 { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(237,237,237,0.55); margin: 1em 0 0.4em; }
        .op-doc ul, .op-doc ol { padding-left: 1.4em; margin: 0.6em 0; }
        .op-doc ul li::marker { color: ${c(0.55)}; }
        .op-doc ol li::marker { color: ${c(0.55)}; }
        .op-doc blockquote { border-left: 3px solid ${c(0.5)}; background: ${c(0.04)}; padding: 10px 16px; margin: 0.8em 0; color: rgba(237,237,237,0.55); font-style: italic; }
        .op-doc hr { border: none; border-top: 1px solid ${c(0.18)}; margin: 1.4em 0; }
        .op-doc mark { background: ${c(0.22)}; color: rgba(237,237,237,0.9); padding: 1px 3px; }
        .op-doc a { color: ${c(0.9)}; text-decoration: underline; text-underline-offset: 2px; }
        .op-doc img { max-width: 100%; border: 1px solid rgba(255,255,255,0.08); }
        .op-doc strong { color: rgba(237,237,237,0.95); font-weight: 700; }
        .op-doc code { font-family: "Courier New", monospace; font-size: 0.85em; background: rgba(255,255,255,0.06); padding: 1px 5px; }
    `
    } else if (pageTheme === 'oldfashioned') {
        themeCSS = `
        .op-doc { font-family: Georgia, "Times New Roman", serif; color: #2a1a08; line-height: 1.85; font-size: 0.98rem; }
        .op-doc p { margin: 0.75em 0; }
        .op-doc h1 { border-left: 4px solid ${c(1)}; background: rgba(180,130,60,0.12); padding: 8px 14px; font-size: 1.15rem; font-weight: 700; font-style: italic; color: #3d2b1a; margin: 1.4em 0 0.6em; letter-spacing: 0.02em; }
        .op-doc h2 { font-size: 1rem; font-weight: 700; letter-spacing: 0.04em; color: ${c(1)}; border-bottom: 1px solid rgba(90,55,20,0.25); padding-bottom: 3px; margin: 1.2em 0 0.5em; }
        .op-doc h3 { font-size: 0.9rem; font-weight: 700; color: #6b4226; margin: 1em 0 0.4em; }
        .op-doc ul, .op-doc ol { padding-left: 1.6em; margin: 0.6em 0; }
        .op-doc ul li::marker { color: #8b5e3c; }
        .op-doc ol li::marker { color: #8b5e3c; font-style: italic; }
        .op-doc blockquote { border-left: 4px solid ${c(0.7)}; background: rgba(180,130,60,0.08); padding: 10px 16px; margin: 0.8em 0; color: #5a3820; font-style: italic; }
        .op-doc hr { border: none; border-top: 2px solid rgba(90,55,20,0.25); margin: 1.4em 0; }
        .op-doc mark { background: rgba(180,130,60,0.28); color: #3d2b1a; padding: 1px 3px; }
        .op-doc a { color: ${c(1)}; text-decoration: underline; }
        .op-doc img { max-width: 100%; border: 2px solid rgba(90,55,20,0.3); }
        .op-doc strong { color: #1a0f00; font-weight: 700; }
        .op-doc code { font-family: "Courier New", monospace; font-size: 0.85em; background: rgba(90,55,20,0.1); padding: 1px 5px; border: 1px solid rgba(90,55,20,0.2); }
    `
    } else if (pageTheme === 'scifi') {
        themeCSS = `
        .op-doc { font-family: "Courier New", Courier, monospace; color: #9fc8d8; line-height: 1.75; font-size: 0.9rem; }
        .op-doc p { margin: 0.7em 0; }
        .op-doc h1 { border-left: 2px solid ${c(1)}; background: ${c(0.07)}; padding: 8px 14px; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: ${c(1)}; text-shadow: 0 0 10px ${c(0.6)}, 0 0 20px ${c(0.3)}; margin: 1.4em 0 0.6em; box-shadow: inset 0 0 20px ${c(0.04)}, 0 0 8px ${c(0.1)}; }
        .op-doc h2 { font-size: 0.82rem; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: ${c(0.9)}; text-shadow: 0 0 8px ${c(0.5)}; margin: 1.2em 0 0.5em; }
        .op-doc h2::before { content: '> '; color: ${c(0.5)}; }
        .op-doc h3 { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(160,200,220,0.6); margin: 1em 0 0.4em; }
        .op-doc ul, .op-doc ol { padding-left: 1.4em; margin: 0.6em 0; }
        .op-doc ul li::marker { color: ${c(0.7)}; content: '▸ '; }
        .op-doc ol li::marker { color: ${c(0.7)}; }
        .op-doc blockquote { border-left: 2px solid ${c(0.6)}; background: ${c(0.05)}; padding: 10px 16px; margin: 0.8em 0; color: rgba(160,200,220,0.65); box-shadow: inset 0 0 16px ${c(0.04)}; }
        .op-doc hr { border: none; border-top: 1px solid ${c(0.25)}; box-shadow: 0 0 6px ${c(0.2)}; margin: 1.4em 0; }
        .op-doc mark { background: ${c(0.2)}; color: #d0ecf8; padding: 1px 4px; box-shadow: 0 0 4px ${c(0.3)}; }
        .op-doc a { color: ${c(1)}; text-shadow: 0 0 4px ${c(0.5)}; text-decoration: underline; }
        .op-doc img { max-width: 100%; border: 1px solid ${c(0.35)}; box-shadow: 0 0 12px ${c(0.15)}; }
        .op-doc strong { color: #d0ecf8; font-weight: 700; text-shadow: 0 0 4px ${c(0.2)}; }
        .op-doc code { font-family: "Courier New", monospace; font-size: 0.88em; background: ${c(0.1)}; padding: 1px 5px; border: 1px solid ${c(0.25)}; color: ${c(1)}; }
    `
    }

    if (!html) return (
        <div style={{
            textAlign: 'center', padding: '60px 0',
            color: pageTheme === 'oldfashioned' ? 'rgba(60,35,10,0.3)' : 'rgba(237,237,237,0.15)',
            fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontStyle: 'italic'
        }}>
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
