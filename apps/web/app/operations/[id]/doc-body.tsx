'use client'

import { useEffect, useState } from 'react'
import { generateHTML } from '@tiptap/core'
import { contentExtensions } from '@/components/editor/content-extensions'

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

/**
 * Renders a section's stored ProseMirror JSON as HTML.
 *
 * The schema comes from `contentExtensions()` — the editor's own — and that is
 * not a tidy-up. This file used to keep a hand-written list beside it, and the
 * list was missing `TextStyle`/`FontSize`. ProseMirror refuses to parse a
 * document carrying a mark its schema has never heard of, so the moment an
 * author set a font size anywhere in a section, the whole section threw on load
 * and the reader was told there was no document body — over 40kB of orders
 * sitting in the database. Two lists describing one document format will always
 * end up describing two.
 */
export default function DocBody({ content, themeColor = '#db001d', pageTheme = 'modern' }: { content: any, themeColor?: string, pageTheme?: 'modern' | 'oldfashioned' | 'scifi' | 'coldwar' }) {
    const [html, setHtml] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        if (!content) { setHtml(null); setFailed(false); return }
        try {
            setHtml(generateHTML(content, contentExtensions()))
            setFailed(false)
        } catch (err) {
            // Loudly. The silent version of this catch is what let a schema
            // mismatch read as an empty section for as long as it did.
            console.error('[DocBody] could not render section content', err)
            setHtml(null)
            setFailed(true)
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
        .op-doc { font-family: "Courier New", Courier, monospace; color: #b89a50; line-height: 1.85; font-size: 0.92rem; }
        .op-doc p { color: #b89a50; margin: 0.75em 0; }
        .op-doc li { color: #b89a50; }
        .op-doc h1 { font-family: "Courier New", Courier, monospace; border-left: 3px solid ${c(0.8)}; background: rgba(160,120,50,0.1); padding: 8px 14px; font-size: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #d4b870; margin: 1.4em 0 0.6em; }
        .op-doc h2 { font-family: "Courier New", Courier, monospace; font-size: 0.88rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${c(0.9)}; border-bottom: 1px solid rgba(160,120,50,0.2); padding-bottom: 3px; margin: 1.2em 0 0.5em; }
        .op-doc h2::before { content: '// '; color: rgba(160,120,50,0.5); }
        .op-doc h3 { font-family: "Courier New", Courier, monospace; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(180,145,60,0.65); margin: 1em 0 0.4em; }
        .op-doc ul, .op-doc ol { padding-left: 1.6em; margin: 0.6em 0; }
        .op-doc ul li::marker { color: rgba(160,120,50,0.6); }
        .op-doc ol li::marker { color: rgba(160,120,50,0.6); }
        .op-doc blockquote { border-left: 3px solid ${c(0.5)}; background: rgba(160,120,50,0.06); padding: 10px 16px; margin: 0.8em 0; color: rgba(180,145,60,0.65); }
        .op-doc hr { border: none; border-top: 1px solid rgba(160,120,50,0.25); margin: 1.4em 0; }
        .op-doc mark { background: rgba(160,120,50,0.22); color: #d4b870; padding: 1px 3px; }
        .op-doc a { color: ${c(0.9)}; text-decoration: underline; }
        .op-doc img { max-width: 100%; border: 1px solid rgba(160,120,50,0.25); }
        .op-doc strong { color: #d4b870; font-weight: 700; }
        .op-doc code { font-family: "Courier New", Courier, monospace; font-size: 0.88em; background: rgba(160,120,50,0.08); padding: 1px 5px; border: 1px solid rgba(160,120,50,0.2); color: #c8a850; }
    `
    } else if (pageTheme === 'coldwar') {
        /*
         * The only light palette on the site. Fixed rather than derived from the
         * operation's `--acc`: a typed page does not change colour per
         * operation, and an operation themed pale blue would print invisibly on
         * paper. Stamp red is the typewriter's second ribbon.
         *
         * Everything here restates a rule `.op-doc` already has — the point is
         * only to invert it for ink on paper, not to lay it out differently.
         */
        themeCSS = `
        .op-doc { font-family: "Courier New", Courier, monospace; color: #2b2721; line-height: 1.75; font-size: 0.92rem; padding: 0; }
        .op-doc p { margin: 0.7em 0; }
        .op-doc h1 { font-family: "Courier New", Courier, monospace; border: none; border-left: 4px solid #8c2b1d; background: rgba(140,43,29,0.06); padding: 7px 13px; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #23201a; margin: 1.5em 0 0.7em; }
        .op-doc h2 { font-family: "Courier New", Courier, monospace; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #8c2b1d; border-bottom: 1px dotted #8b8477; padding-bottom: 3px; margin: 1.4em 0 0.5em; }
        .op-doc h2::before { content: ''; }
        .op-doc h3 { font-family: "Courier New", Courier, monospace; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #4f4a3f; margin: 1.1em 0 0.35em; }
        .op-doc ul, .op-doc ol { padding-left: 1.7em; margin: 0.6em 0; }
        .op-doc li { color: #2b2721; }
        .op-doc ul li::marker { color: #8c2b1d; }
        .op-doc ol li::marker { color: #8c2b1d; }
        .op-doc blockquote { border-left: 4px solid #8c2b1d; border-top: none; border-right: none; border-bottom: none; background: rgba(140,43,29,0.05); padding: 10px 15px; margin: 1em 0; color: #4f4a3f; font-style: italic; }
        .op-doc hr { border: none; border-top: 1px solid #8b8477; margin: 1.6em 0; }
        .op-doc mark { background: rgba(200,150,40,0.35); color: #23201a; padding: 1px 3px; }
        .op-doc a { color: #8c2b1d; text-decoration: underline; text-underline-offset: 2px; opacity: 1; }
        .op-doc a:hover { color: #23201a; }
        .op-doc img { max-width: 100%; border: 1px solid #8b8477; filter: grayscale(0.7) sepia(0.2) contrast(1.1); }
        .op-doc strong { color: #14120e; font-weight: 700; }
        .op-doc code { font-family: "Courier New", monospace; font-size: 0.88em; background: rgba(0,0,0,0.06); border: 1px solid #b5ad9b; color: #23201a; padding: 1px 5px; }
        .op-doc pre { background: rgba(0,0,0,0.05); border: 1px solid #b5ad9b; padding: 10px 13px; overflow-x: auto; }
    `
    } else if (pageTheme === 'scifi') {
        themeCSS = `
        .op-doc { font-family: "Courier New", Courier, monospace; color: #a8d8ee; line-height: 1.75; font-size: 0.9rem; background-image: repeating-linear-gradient(to bottom, ${c(0.015)} 0px, ${c(0.015)} 1px, transparent 1px, transparent 4px); }
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

    /*
     * Two different states, said differently. "Nothing written yet" is a fact
     * about the operation; "we could not render it" is a fault, and telling a
     * reader the section is empty when it is not is how this stayed hidden.
     */
    if (!html) return (
        <div style={{
            textAlign: 'center', padding: '60px 0',
            color: failed
                ? 'rgba(212,160,58,0.75)'
                : pageTheme === 'oldfashioned' ? 'rgba(160,120,50,0.25)' : 'rgba(237,237,237,0.15)',
            fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontStyle: 'italic'
        }}>
            {failed
                ? 'This section could not be displayed — it is still in the editor'
                : 'No document body yet'}
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
