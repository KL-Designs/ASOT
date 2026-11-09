'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { Search, ArrowBack, OpenInNew, EditNote, BugReport, PlayCircleOutline, Close } from '@mui/icons-material'
import HelpMarkdown from './HelpMarkdown'
import {
    HELP_CATEGORIES, articlesForPath, articlesInCategory, searchArticles,
    type HelpArticleView,
} from '@/lib/help/search'
import type { HelpViewerInfo } from './useHelpData'
import s from '@/styles/help.module.css'

/*
 * The pieces both help surfaces are built from: the side panel the "?" button
 * opens (`HelpPanel`) and the full `/help` page (`HelpWikiPage`).
 */

export const CATEGORY_LABEL = Object.fromEntries(HELP_CATEGORIES.map(c => [c.key, c.label])) as Record<HelpCategory, string>
export const AUDIENCE_LABEL: Record<HelpAudience, string> = { public: 'Everyone', member: 'Members', staff: 'Staff' }

export function SearchBox({ value, onChange, autoFocus, placeholder }: {
    value: string
    onChange: (v: string) => void
    autoFocus?: boolean
    placeholder?: string
}) {
    return (
        <div className={s.search}>
            <Search sx={{ fontSize: 18 }} />
            <input
                type='search'
                value={value}
                autoFocus={autoFocus}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder ?? 'Search the guides…'}
                aria-label='Search the help guides'
            />
            {value && (
                <button type='button' className={s.iconBtn} onClick={() => onChange('')} aria-label='Clear search'>
                    <Close sx={{ fontSize: 16 }} />
                </button>
            )}
        </div>
    )
}

export function ArticleList({ articles, onOpen, hrefFor, snippets }: {
    articles: HelpArticleView[]
    onOpen?: (slug: string) => void
    hrefFor?: (slug: string) => string
    snippets?: Map<string, string | undefined>
}) {
    return (
        <ul className={s.items}>
            {articles.map(a => {
                const inner = (
                    <>
                        <div className={s.itemTitle}>
                            {a.title}
                            {a.hidden && <span className={`${s.tag} ${s.tagAmber}`}>Hidden</span>}
                            {a.audience === 'staff' && <span className={`${s.tag} ${s.tagRed}`}>Staff</span>}
                        </div>
                        <div className={s.itemSummary}>{snippets?.get(a.slug) ?? a.summary}</div>
                    </>
                )
                return (
                    <li key={a.slug}>
                        {hrefFor
                            ? <Link className={s.item} href={hrefFor(a.slug) as never}>{inner}</Link>
                            : <button type='button' className={s.item} onClick={() => onOpen?.(a.slug)}>{inner}</button>}
                    </li>
                )
            })}
        </ul>
    )
}

export function CategoryGrid({ articles, onPick }: { articles: HelpArticleView[]; onPick: (c: HelpCategory) => void }) {
    return (
        <div className={s.categories}>
            {HELP_CATEGORIES.map(c => {
                const n = articles.filter(a => a.category === c.key).length
                if (!n) return null
                return (
                    <button key={c.key} type='button' className={s.category} onClick={() => onPick(c.key)}>
                        <div className={s.row}>
                            <span className={s.categoryLabel}>{c.label}</span>
                            <span className={s.spacer} />
                            <span className={s.categoryCount}>{n}</span>
                        </div>
                        <div className={s.categoryBlurb}>{c.blurb}</div>
                    </button>
                )
            })}
        </div>
    )
}

/**
 * The panel's front page: search results while there's a query; otherwise the
 * guides about the current page, then every category (or one category's list).
 */
export function HelpHome({ articles, pathname, query, setQuery, category, setCategory, onOpen, autoFocus }: {
    articles: HelpArticleView[]
    pathname: string
    query: string
    setQuery: (q: string) => void
    category: HelpCategory | null
    setCategory: (c: HelpCategory | null) => void
    onOpen: (slug: string) => void
    autoFocus?: boolean
}) {
    const hits = useMemo(() => query.trim() ? searchArticles(articles, query) : [], [articles, query])
    const here = useMemo(() => articlesForPath(articles, pathname), [articles, pathname])

    return (
        <>
            <SearchBox value={query} onChange={setQuery} autoFocus={autoFocus} />

            {query.trim() ? (
                <div className={s.section} style={{ marginTop: 14 }}>
                    <div className={s.sectionHead}><span className={s.kicker}>{hits.length} result{hits.length === 1 ? '' : 's'}</span></div>
                    {hits.length
                        ? <ArticleList articles={hits.map(h => h.article)} onOpen={onOpen} snippets={new Map(hits.map(h => [h.article.slug, h.snippet]))} />
                        : <div className={s.empty}>No guide matches that yet. Try other words, or ask on the <strong>Ask</strong> tab, or send the question to J7 on the <strong>Suggest</strong> tab.</div>}
                </div>
            ) : category ? (
                <div className={s.section} style={{ marginTop: 14 }}>
                    <button type='button' className={s.back} onClick={() => setCategory(null)}><ArrowBack sx={{ fontSize: 15 }} />All topics</button>
                    <div className={s.sectionHead}><span className={s.kicker}>{CATEGORY_LABEL[category]}</span></div>
                    <ArticleList articles={articlesInCategory(articles, category)} onOpen={onOpen} />
                </div>
            ) : (
                <>
                    {here.length > 0 && (
                        <div className={s.section} style={{ marginTop: 16 }}>
                            <div className={s.sectionHead}><span className={s.kicker}>On this page</span></div>
                            <ArticleList articles={here} onOpen={onOpen} />
                        </div>
                    )}
                    <div className={s.section}>
                        <div className={s.sectionHead}><span className={s.kicker}>Browse topics</span></div>
                        <CategoryGrid articles={articles} onPick={setCategory} />
                    </div>
                </>
            )}
        </>
    )
}

/** One article, with its walkthrough, edit and bug buttons. */
export function ArticleView({ article, articles, viewer, onArticle, onNavigate, onSuggestEdit, onReportBug, onStartTutorial, fullPageHref, editHref }: {
    article: HelpArticleView
    articles: HelpArticleView[]
    viewer: HelpViewerInfo
    onArticle?: (slug: string) => void
    onNavigate?: () => void
    onSuggestEdit: () => void
    onReportBug: () => void
    onStartTutorial?: (id: string) => void
    fullPageHref?: string
    editHref?: string
}) {
    const titles = useMemo(() => new Map(articles.map(a => [a.slug, a.title])), [articles])
    const updated = article.updatedAt ? new Date(article.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null

    return (
        <article>
            <span className={s.kicker}>{CATEGORY_LABEL[article.category]}</span>
            <h1 className={s.articleTitle}>{article.title}</h1>
            <div className={s.articleMeta}>
                {article.audience !== 'public' && <span className={`${s.tag} ${article.audience === 'staff' ? s.tagRed : ''}`}>{AUDIENCE_LABEL[article.audience]}</span>}
                {article.hidden && <span className={`${s.tag} ${s.tagAmber}`}>Hidden</span>}
                {updated && <span className='muted'>Updated {updated}{article.updatedByName ? ` by ${article.updatedByName}` : ''}</span>}
            </div>

            {article.tutorial && onStartTutorial && (
                <div style={{ marginBottom: 14 }}>
                    <button type='button' className={`${s.btn} ${s.btnPrimary}`} onClick={() => onStartTutorial(article.tutorial!)}>
                        <PlayCircleOutline sx={{ fontSize: 16 }} />Start the walkthrough
                    </button>
                    <div className={s.hint} style={{ marginTop: 4 }}>A guided run-through on practice data. Nothing you do in it changes anything real.</div>
                </div>
            )}

            <HelpMarkdown source={article.body} onArticle={onArticle} onNavigate={onNavigate} titles={titles} />

            <div className={s.articleActions}>
                {viewer.signedIn ? (
                    <>
                        <button type='button' className={s.btn} onClick={onSuggestEdit}><EditNote sx={{ fontSize: 16 }} />Suggest an edit</button>
                        <button type='button' className={s.btn} onClick={onReportBug}><BugReport sx={{ fontSize: 16 }} />Report a bug</button>
                    </>
                ) : (
                    <Link className={s.btn} href='/login' onClick={onNavigate}>Sign in to suggest an edit</Link>
                )}
                <span className={s.spacer} />
                {editHref && <Link className={`${s.btn} ${s.btnGhost}`} href={editHref as never} onClick={onNavigate}>Edit (J7)</Link>}
                {fullPageHref && <Link className={`${s.btn} ${s.btnGhost}`} href={fullPageHref as never} onClick={onNavigate}><OpenInNew sx={{ fontSize: 15 }} />Full page</Link>}
            </div>
        </article>
    )
}
