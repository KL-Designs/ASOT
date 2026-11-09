'use client'

import Link from 'next/link'
import React, { useMemo } from 'react'
import { parseHelpMarkdown, type HelpInline } from '@/lib/help/markdown'
import s from '@/styles/help.module.css'

/**
 * Draws an article written in the wiki's Markdown dialect. Never sets HTML:
 * every node is a React element, so a suggested edit can't inject markup.
 *
 * `onArticle` makes `[[slug]]` links open inside the current surface (the side
 * panel); without it they link to `/help/{slug}`. `titles` turns a bare
 * `[[slug]]` into the article's title, and marks links to articles that don't
 * exist (or the reader can't see).
 */
export default function HelpMarkdown({ source, onArticle, onNavigate, titles }: {
    source: string
    onArticle?: (slug: string) => void
    /** Called before a site link navigates, e.g. to close the panel on a phone. */
    onNavigate?: () => void
    titles?: Map<string, string>
}) {
    const blocks = useMemo(() => parseHelpMarkdown(source), [source])

    const inline = (nodes: HelpInline[], key = ''): React.ReactNode[] => nodes.map((n, i) => {
        const k = `${key}${i}`
        switch (n.type) {
            case 'text': return <React.Fragment key={k}>{n.text}</React.Fragment>
            case 'bold': return <strong key={k}>{inline(n.children, k)}</strong>
            case 'italic': return <em key={k}>{inline(n.children, k)}</em>
            case 'code': return <code key={k}>{n.text}</code>
            case 'link':
                return n.external
                    ? <a key={k} href={n.href} target='_blank' rel='noopener noreferrer'>{inline(n.children, k)}</a>
                    : <Link key={k} href={n.href as never} onClick={onNavigate}>{inline(n.children, k)}</Link>
            case 'article': {
                const title = titles?.get(n.slug)
                const label = n.text ?? title ?? n.slug
                if (titles && !title) return <span key={k} className={s.deadLink} title='This guide is not available'>{label}</span>
                return onArticle
                    ? <a key={k} role='link' tabIndex={0} onClick={() => onArticle(n.slug)} onKeyDown={e => { if (e.key === 'Enter') onArticle(n.slug) }}>{label}</a>
                    : <Link key={k} href={`/help/${n.slug}` as never}>{label}</Link>
            }
        }
    })

    return (
        <div className={s.md}>
            {blocks.map((b, i) => {
                switch (b.type) {
                    case 'heading': {
                        const H = (`h${b.level + 1}`) as 'h2' | 'h3' | 'h4'
                        return <H key={i} id={b.id}>{inline(b.text)}</H>
                    }
                    case 'paragraph': return <p key={i}>{inline(b.text)}</p>
                    case 'callout': return <div key={i} className={s.callout}>{inline(b.text)}</div>
                    case 'rule': return <hr key={i} />
                    case 'list': {
                        const L = b.ordered ? 'ol' : 'ul'
                        return <L key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}-`)}</li>)}</L>
                    }
                }
            })}
        </div>
    )
}
