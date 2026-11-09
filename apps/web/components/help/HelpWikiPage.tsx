'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QuestionAnswer, EditNote } from '@mui/icons-material'
import { useHelpData, openHelp, startTutorial } from './useHelpData'
import { ArticleList, ArticleView, CATEGORY_LABEL, SearchBox } from './HelpViews'
import { HELP_CATEGORIES, articlesInCategory, searchArticles } from '@/lib/help/search'
import s from '@/styles/help.module.css'

/**
 * `/help` and `/help/[slug]`: the help wiki with room to read. Topics down the
 * side, the guide (or the topic index) in the middle. Asking and suggesting
 * open the same side panel the "?" button does, so there is one of each.
 */
export default function HelpWikiPage({ slug }: { slug?: string }) {
    const router = useRouter()
    const { data, error, reload } = useHelpData()
    const [query, setQuery] = useState('')

    const articles = useMemo(() => data?.articles ?? [], [data])
    const hits = useMemo(() => query.trim() ? searchArticles(articles, query) : [], [articles, query])
    const article = slug ? articles.find(a => a.slug === slug) : undefined

    const side = (
        <aside className={s.side}>
            <SearchBox value={query} onChange={setQuery} />
            <div className={s.row}>
                <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => openHelp({ tab: 'ask' })}><QuestionAnswer sx={{ fontSize: 14 }} />Ask</button>
                <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => openHelp({ suggest: { kind: 'new' } })}><EditNote sx={{ fontSize: 14 }} />Suggest a guide</button>
            </div>
            {HELP_CATEGORIES.map(c => {
                const list = articlesInCategory(articles, c.key)
                if (!list.length) return null
                return (
                    <div key={c.key} className={s.sideGroup}>
                        <span className={s.kicker} style={{ marginBottom: 2 }}>{c.label}</span>
                        {list.map(a => (
                            <Link key={a.slug} href={`/help/${a.slug}` as never}
                                className={`${s.sideLink} ${a.slug === slug ? s.sideLinkActive : ''}`}>
                                {a.title}
                            </Link>
                        ))}
                    </div>
                )
            })}
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
                {HELP_CATEGORIES.map(c => {
                    const list = articlesInCategory(articles, c.key)
                    if (!list.length) return null
                    return (
                        <section key={c.key}>
                            <div className={s.sectionHead}>
                                <span className={s.kicker}>{CATEGORY_LABEL[c.key]}</span>
                                <span className={s.hint}>{c.blurb}</span>
                            </div>
                            <ArticleList articles={list} hrefFor={sl => `/help/${sl}`} />
                        </section>
                    )
                })}
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
