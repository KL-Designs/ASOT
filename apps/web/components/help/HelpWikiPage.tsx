'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QuestionAnswer, EditNote, ExpandMore, MenuBook } from '@mui/icons-material'
import { useHelpData, openHelp, startTutorial } from './useHelpData'
import { ArticleList, ArticleView, CATEGORY_LABEL, FaqList, SearchBox } from './HelpViews'
import { HELP_CATEGORIES, HELP_GROUPS, articlesInCategory, searchArticles } from '@/lib/help/search'
import { articleChapters } from '@/lib/help/markdown'
import s from '@/styles/help.module.css'

/**
 * `/help` and `/help/[slug]`: the help wiki with room to read. A table of
 * contents down the side (sections, then topics, then every guide the reader
 * may see, with the open guide's chapters under it), the guide (or the index
 * and the living FAQ) in the middle. Asking and suggesting open the same side
 * panel the "?" button does, so there is one of each.
 */
export default function HelpWikiPage({ slug }: { slug?: string }) {
    const router = useRouter()
    const { data, error, reload } = useHelpData()
    const [query, setQuery] = useState('')

    const articles = useMemo(() => data?.articles ?? [], [data])
    const hits = useMemo(() => query.trim() ? searchArticles(articles, query) : [], [articles, query])
    const article = slug ? articles.find(a => a.slug === slug) : undefined

    const chapters = useMemo(() => article ? articleChapters(article.body) : [], [article])
    const faq = useMemo(() => data?.faq ?? [], [data])
    const titles = useMemo(() => new Map(articles.map(a => [a.slug, a.title])), [articles])

    // Every topic starts open on the index; on a guide, only its own topic.
    const [closed, setClosed] = useState<Set<HelpCategory>>(new Set())
    useEffect(() => {
        setClosed(article ? new Set(HELP_CATEGORIES.map(c => c.key).filter(k => k !== article.category)) : new Set())
    }, [article])
    const [tocHidden, setTocHidden] = useState(true)
    const toggle = (k: HelpCategory) => setClosed(prev => {
        const next = new Set(prev)
        if (next.has(k)) next.delete(k); else next.add(k)
        return next
    })

    const side = (
        <aside className={`${s.side} ${tocHidden ? s.sideCollapsed : ''}`}>
            <SearchBox value={query} onChange={setQuery} />
            <div className={s.row}>
                <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => openHelp({ tab: 'ask' })}><QuestionAnswer sx={{ fontSize: 14 }} />Ask</button>
                <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => openHelp({ suggest: { kind: 'new' } })}><EditNote sx={{ fontSize: 14 }} />Suggest a guide</button>
                <button type='button' className={`${s.btn} ${s.btnSmall} ${s.sideToggle}`} onClick={() => setTocHidden(h => !h)} aria-expanded={!tocHidden}>
                    <MenuBook sx={{ fontSize: 14 }} />{tocHidden ? 'Contents' : 'Hide contents'}
                </button>
            </div>
            <nav className={s.toc} aria-label='Help contents'>
                <Link href='/help' className={`${s.sideLink} ${!slug ? s.sideLinkActive : ''}`}>All guides{faq.length ? ' & questions' : ''}</Link>
                {HELP_GROUPS.map(g => {
                    const cats = HELP_CATEGORIES.filter(c => c.group === g.key)
                        .map(c => ({ c, list: articlesInCategory(articles, c.key) }))
                        .filter(x => x.list.length || (x.c.key === 'faq' && faq.length))
                    if (!cats.length) return null
                    return (
                        <React.Fragment key={g.key}>
                            <div className={s.tocGroup}>{g.label}</div>
                            {cats.map(({ c, list }) => {
                                const isClosed = closed.has(c.key)
                                return (
                                    <div key={c.key}>
                                        <button type='button' className={`${s.tocCat} ${isClosed ? s.tocCatClosed : ''}`} aria-expanded={!isClosed} onClick={() => toggle(c.key)}>
                                            <ExpandMore sx={{ fontSize: 16 }} />{c.label}
                                            <span className={s.tocCount}>{list.length + (c.key === 'faq' ? faq.length : 0)}</span>
                                        </button>
                                        {!isClosed && (
                                            <div className={s.tocList}>
                                                {c.key === 'faq' && faq.length > 0 && (
                                                    <Link href={'/help#most-asked' as never} className={s.sideLink}>Most asked questions</Link>
                                                )}
                                                {list.map(a => (
                                                    <React.Fragment key={a.slug}>
                                                        <Link href={`/help/${a.slug}` as never} className={`${s.sideLink} ${a.slug === slug ? s.sideLinkActive : ''}`}>
                                                            {a.title}
                                                        </Link>
                                                        {a.slug === slug && chapters.length > 0 && (
                                                            <div className={s.tocChapters}>
                                                                {chapters.map(ch => (
                                                                    <a key={ch.id} href={`#${ch.id}`} className={`${s.tocChapter} ${ch.level > 2 ? s.tocChapterSub : ''}`}>{ch.text}</a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </React.Fragment>
                    )
                })}
            </nav>
        </aside>
    )

    let main: React.ReactNode
    if (!data) {
        main = error
            ? <div className={s.empty}>The guides couldn&apos;t be loaded. <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={reload}>Try again</button></div>
            : <div className={s.thinking}>Loading the guides…</div>
    } else if (query.trim()) {
        main = (
            <>
                <div className={s.sectionHead}><span className={s.kicker}>{hits.length} result{hits.length === 1 ? '' : 's'} for “{query.trim()}”</span></div>
                {hits.length
                    ? <ArticleList articles={hits.map(h => h.article)} hrefFor={sl => `/help/${sl}`} snippets={new Map(hits.map(h => [h.article.slug, h.snippet]))} />
                    : <div className={s.empty}>Nothing matches that yet. <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => openHelp({ tab: 'ask' })}>Ask the assistant</button> or <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => openHelp({ suggest: { kind: 'question', body: query.trim() } })}>send the question to J7</button></div>}
            </>
        )
    } else if (slug && !article) {
        main = (
            <div className={s.empty}>
                That guide doesn&apos;t exist, or it&apos;s for members only.
                {!data.viewer.signedIn && <> <Link href='/login'>Sign in</Link> to see the member guides.</>}
                {' '}<Link href='/help'>Back to all guides</Link>
            </div>
        )
    } else if (article) {
        main = (
            <div className={s.mainCard}>
                <ArticleView
                    article={article}
                    articles={articles}
                    viewer={data.viewer}
                    onSuggestEdit={() => openHelp({ suggest: { kind: 'edit', slug: article.slug } })}
                    onReportBug={() => openHelp({ suggest: { kind: 'bug', slug: article.slug } })}
                    onStartTutorial={id => {
                        startTutorial(id)
                        const start = article.paths.find(p => !p.includes('*')) ?? '/'
                        router.push(`${start}?tutorial=${encodeURIComponent(id)}` as never)
                    }}
                    editHref={data.viewer.canReview ? `/dashboard/j7?tab=3&article=${article.slug}` : undefined}
                />
            </div>
        )
    } else {
        main = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {faq.length > 0 && (
                    <section id='most-asked'>
                        <div className={s.sectionHead}>
                            <span className={s.kicker}>Most asked questions</span>
                            <span className={s.hint}>What people ask the assistant, most asked first</span>
                        </div>
                        <FaqList entries={faq.slice(0, 15)} titles={titles} open />
                    </section>
                )}
                {HELP_GROUPS.map(g => (
                    <React.Fragment key={g.key}>
                        {HELP_CATEGORIES.filter(c => c.group === g.key).map(c => {
                            const list = articlesInCategory(articles, c.key)
                            if (!list.length) return null
                            return (
                                <section key={c.key} id={`topic-${c.key}`}>
                                    <div className={s.sectionHead}>
                                        <span className={s.kicker}>{CATEGORY_LABEL[c.key]}</span>
                                        <span className={s.hint}>{c.blurb}</span>
                                    </div>
                                    <ArticleList articles={list} hrefFor={sl => `/help/${sl}`} />
                                </section>
                            )
                        })}
                    </React.Fragment>
                ))}
            </div>
        )
    }

    return (
        <div className={s.page}>
            <header className={s.pageHead}>
                <span className={s.kicker}>Help &amp; guides</span>
                <h1 className={s.pageTitle}>ASOT Wiki</h1>
                <p className={s.pageLede}>
                    How the website works and how to get things done in the unit. Press <strong>?</strong> on any page to open these guides beside what you&apos;re doing.
                    {data && !data.viewer.signedIn && <> <Link href='/login' style={{ color: 'var(--red-hi)' }}>Sign in</Link> to see the member guides and ask questions.</>}
                </p>
            </header>
            <div className={s.pageGrid}>
                {side}
                <main className={s.main}>{main}</main>
            </div>
        </div>
    )
}
