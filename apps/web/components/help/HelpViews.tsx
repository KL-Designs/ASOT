'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ArrowBack, OpenInNew, EditNote, BugReport, PlayCircleOutline, Close, Send, ExpandMore } from '@mui/icons-material'
import HelpMarkdown from './HelpMarkdown'
import {
    HELP_CATEGORIES, HELP_GROUPS, articlesForPath, articlesInCategory, searchArticles,
    type HelpArticleView,
} from '@/lib/help/search'
import { faqForPath, type FaqEntry } from '@/lib/help/questions'
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

export function CategoryGrid({ articles, faqCount = 0, onPick }: { articles: HelpArticleView[]; faqCount?: number; onPick: (c: HelpCategory) => void }) {
    return (
        <>
            {HELP_GROUPS.map(g => {
                const cats = HELP_CATEGORIES.filter(c => c.group === g.key)
                    .map(c => ({ c, n: articles.filter(a => a.category === c.key).length + (c.key === 'faq' ? faqCount : 0) }))
                    .filter(x => x.n > 0)
                if (!cats.length) return null
                return (
                    <div key={g.key} className={s.catGroup}>
                        <span className={s.catGroupLabel}>{g.label}</span>
                        <div className={s.categories}>
                            {cats.map(({ c, n }) => (
                                <button key={c.key} type='button' className={s.category} onClick={() => onPick(c.key)}>
                                    <div className={s.row}>
                                        <span className={s.categoryLabel}>{c.label}</span>
                                        <span className={s.spacer} />
                                        <span className={s.categoryCount}>{n}</span>
                                    </div>
                                    <div className={s.categoryBlurb}>{c.blurb}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )
            })}
        </>
    )
}

/**
 * Questions people asked the assistant, each opening to its answer. Most
 * asked first (the caller's order). `titles` resolves `[[slug]]` links.
 */
export function FaqList({ entries, titles, onArticle, onNavigate, open: openFirst }: {
    entries: FaqEntry[]
    titles: Map<string, string>
    onArticle?: (slug: string) => void
    onNavigate?: () => void
    /** Start with the first entry open. */
    open?: boolean
}) {
    const [openId, setOpenId] = useState<string | null>(openFirst ? entries[0]?.id ?? null : null)
    return (
        <ul className={s.faq}>
            {entries.map(e => {
                const isOpen = openId === e.id
                return (
                    <li key={e.id} className={`${s.faqItem} ${isOpen ? s.faqOpen : ''}`}>
                        <button type='button' className={s.faqQ} aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : e.id)}>
                            <span className={s.faqText}>{e.question}</span>
                            {e.pinned
                                ? <span className={`${s.tag} ${s.tagLive}`}>J7 pick</span>
                                : <span className={s.faqCount} title={`${e.askers} people asked this`}>{e.askers}×</span>}
                            <ExpandMore sx={{ fontSize: 18 }} className={s.faqChevron} />
                        </button>
                        {isOpen && (
                            <div className={s.faqA}>
                                <HelpMarkdown source={e.answer} onArticle={onArticle} onNavigate={onNavigate} titles={titles} />
                                {e.articleSlug && titles.has(e.articleSlug) && (
                                    onArticle
                                        ? <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => onArticle(e.articleSlug!)}>Read the full guide</button>
                                        : <Link className={`${s.btn} ${s.btnSmall}`} href={`/help/${e.articleSlug}` as never}>Read the full guide</Link>
                                )}
                            </div>
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

/** "Ask about this page": a one-line box that hands the question to the Ask tab. */
export function AskAboutPage({ label, onAsk, suggestions }: { label: string; onAsk: (q: string) => void; suggestions?: string[] }) {
    const [q, setQ] = useState('')
    const send = (text: string) => { const t = text.trim(); if (t) { onAsk(t); setQ('') } }
    return (
        <div className={s.pageAsk}>
            <form className={s.pageAskBox} onSubmit={e => { e.preventDefault(); send(q) }}>
                <input value={q} onChange={e => setQ(e.target.value)} maxLength={600}
                    placeholder={`Ask about ${label}…`} aria-label='Ask the assistant about this page' />
                <button type='submit' className={`${s.btn} ${s.btnPrimary} ${s.btnSmall}`} disabled={!q.trim()} aria-label='Ask'><Send sx={{ fontSize: 14 }} /></button>
            </form>
            {!!suggestions?.length && (
                <div className={s.chips}>
                    {suggestions.map(t => <button key={t} type='button' className={s.chip} onClick={() => send(t)}>{t}</button>)}
                </div>
            )}
        </div>
    )
}

/**
 * The panel's front page. With a query, search results. Otherwise it starts
 * with the page the reader is on: what it is, a box to ask about it, the
 * guides written for it and what people most often ask there. Then the most
 * asked questions site-wide, then every topic.
 */
export function HelpHome({ articles, faq, pathname, label, query, setQuery, category, setCategory, onOpen, onAsk, onNavigate, canAsk, autoFocus }: {
    articles: HelpArticleView[]
    faq: FaqEntry[]
    pathname: string
    /** What to call the current page. */
    label: string
    query: string
    setQuery: (q: string) => void
    category: HelpCategory | null
    setCategory: (c: HelpCategory | null) => void
    onOpen: (slug: string) => void
    /** Ask the assistant (switches to the Ask tab). */
    onAsk?: (q: string) => void
    onNavigate?: () => void
    canAsk?: boolean
    autoFocus?: boolean
}) {
    const hits = useMemo(() => query.trim() ? searchArticles(articles, query) : [], [articles, query])
    const here = useMemo(() => articlesForPath(articles, pathname), [articles, pathname])
    const askedHere = useMemo(() => faqForPath(faq, pathname, 5), [faq, pathname])
    const titles = useMemo(() => new Map(articles.map(a => [a.slug, a.title])), [articles])
    const faqHits = useMemo(() => {
        const t = query.trim().toLowerCase()
        if (!t) return []
        const words = t.split(/\s+/).filter(w => w.length > 2)
        return faq.filter(e => words.length && words.every(w => e.question.toLowerCase().includes(w))).slice(0, 5)
    }, [faq, query])
    const topAsked = useMemo(() => faq.filter(e => !askedHere.some(h => h.id === e.id)).slice(0, 5), [faq, askedHere])

    return (
        <>
            <SearchBox value={query} onChange={setQuery} autoFocus={autoFocus} placeholder='Search the guides and questions…' />

            {query.trim() ? (
                <div className={s.section} style={{ marginTop: 14 }}>
                    <div className={s.sectionHead}><span className={s.kicker}>{hits.length} guide{hits.length === 1 ? '' : 's'}</span></div>
                    {hits.length
                        ? <ArticleList articles={hits.map(h => h.article)} onOpen={onOpen} snippets={new Map(hits.map(h => [h.article.slug, h.snippet]))} />
                        : <div className={s.empty}>No guide matches that yet. Try other words{onAsk && canAsk ? <>, or <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => onAsk(query.trim())}>ask the assistant</button></> : ''}.</div>}
                    {faqHits.length > 0 && (
                        <div className={s.section}>
                            <div className={s.sectionHead}><span className={s.kicker}>Asked before</span></div>
                            <FaqList entries={faqHits} titles={titles} onArticle={onOpen} onNavigate={onNavigate} />
                        </div>
                    )}
                </div>
            ) : category ? (
                <div className={s.section} style={{ marginTop: 14 }}>
                    <button type='button' className={s.back} onClick={() => setCategory(null)}><ArrowBack sx={{ fontSize: 15 }} />All topics</button>
                    <div className={s.sectionHead}><span className={s.kicker}>{CATEGORY_LABEL[category]}</span></div>
                    {category === 'faq' && faq.length > 0 && (
                        <>
                            <div className={s.hint} style={{ marginBottom: 8 }}>What people ask the assistant, most asked first.</div>
                            <FaqList entries={faq} titles={titles} onArticle={onOpen} onNavigate={onNavigate} />
                            {articlesInCategory(articles, 'faq').length > 0 && <div className={s.sectionHead} style={{ marginTop: 16 }}><span className={s.kicker}>FAQ guides</span></div>}
                        </>
                    )}
                    <ArticleList articles={articlesInCategory(articles, category)} onOpen={onOpen} />
                </div>
            ) : (
                <>
                    <div className={s.here}>
                        <span className={s.kicker}>You&apos;re on</span>
                        <div className={s.hereTitle}>{label}</div>
                        {onAsk && canAsk && <AskAboutPage label='this page' onAsk={onAsk} suggestions={askedHere.length ? [] : ['What can I do on this page?']} />}
                    </div>

                    <div className={s.section} style={{ marginTop: 14 }}>
                        <div className={s.sectionHead}><span className={s.kicker}>Guides for this page</span></div>
                        {here.length
                            ? <ArticleList articles={here} onOpen={onOpen} />
                            : <div className={s.hint}>No guide is written for this page yet{canAsk ? ', but you can still ask about it above' : ''}.</div>}
                    </div>

                    {askedHere.length > 0 && (
                        <div className={s.section}>
                            <div className={s.sectionHead}><span className={s.kicker}>Common questions on this page</span></div>
                            <FaqList entries={askedHere} titles={titles} onArticle={onOpen} onNavigate={onNavigate} />
                        </div>
                    )}

                    {topAsked.length > 0 && (
                        <div className={s.section}>
                            <div className={s.sectionHead}>
                                <span className={s.kicker}>Most asked</span>
                                <span className={s.spacer} />
                                {faq.length > topAsked.length && <button type='button' className={`${s.btn} ${s.btnSmall} ${s.btnGhost}`} onClick={() => setCategory('faq')}>All {faq.length}</button>}
                            </div>
                            <FaqList entries={topAsked} titles={titles} onArticle={onOpen} onNavigate={onNavigate} />
                        </div>
                    )}

                    <div className={s.section}>
                        <div className={s.sectionHead}><span className={s.kicker}>Browse topics</span></div>
                        <CategoryGrid articles={articles} faqCount={faq.length} onPick={setCategory} />
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
