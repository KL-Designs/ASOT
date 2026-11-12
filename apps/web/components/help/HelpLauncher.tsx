'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Drawer } from '@mui/material'
import { Close, ArrowBack } from '@mui/icons-material'
import { useHelpData, startTutorial, type HelpOpenDetail } from './useHelpData'
import { ArticleView, HelpHome } from './HelpViews'
import HelpAsk, { type AskMessage } from './HelpAsk'
import HelpSuggest, { type SuggestDraft } from './HelpSuggest'
import { pageLabel } from '@/lib/help/search'
import { faqForPath } from '@/lib/help/questions'
import s from '@/styles/help.module.css'

type Tab = 'guide' | 'ask' | 'suggest'

/** Pages that are a full-screen tool of their own, where a floating button would sit on top of it. */
const HIDDEN_ON = [/^\/recruit-session\//, /^\/operations\/[^/]+\/map/, /^\/help(\/|$)/]

/**
 * The site-wide "?" button and the help panel it opens. Mounted once in the
 * root layout, so it is on every page. Also opens on the `?` key (outside a
 * text box), and on `openHelp()` from `useHelpData.ts` — the `/help` page's
 * Ask and Suggest buttons use that.
 *
 * The panel's state (your Ask conversation, a half-written suggestion) lives
 * here rather than in the drawer, so closing and reopening it doesn't lose
 * anything. It opens on the page you're on: an article opened on another page
 * is put away when the "?" opens it somewhere new.
 */
export default function HelpLauncher() {
    const pathname = usePathname() || '/'
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [everOpened, setEverOpened] = useState(false)
    const [tab, setTab] = useState<Tab>('guide')
    const [slug, setSlug] = useState<string | null>(null)
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<HelpCategory | null>(null)
    const [messages, setMessages] = useState<AskMessage[]>([])
    const [draft, setDraft] = useState<SuggestDraft>({ kind: 'bug' })
    const [pending, setPending] = useState<string | null>(null)
    const [label, setLabel] = useState('this page')
    const { data, error, reload } = useHelpData(everOpened)

    // The page the panel last showed. Opening it on a different page starts on that page.
    const shownOn = useRef<string | null>(null)
    const pathRef = useRef(pathname)
    pathRef.current = pathname

    const openRef = useRef(open)
    openRef.current = open

    const show = useCallback((detail?: HelpOpenDetail) => {
        setEverOpened(true)
        setOpen(true)
        setLabel(pageLabel(pathRef.current, document.title))
        const fresh = !detail?.slug && !detail?.tab && !detail?.suggest && !detail?.ask
        if (fresh && shownOn.current !== pathRef.current) { setSlug(null); setTab('guide'); setQuery(''); setCategory(null) }
        shownOn.current = pathRef.current
        if (detail?.slug) { setSlug(detail.slug); setTab('guide') }
        if (detail?.tab) setTab(detail.tab)
        if (detail?.suggest) { setDraft({ ...detail.suggest }); setTab('suggest') }
        if (detail?.ask) { setPending(detail.ask); setTab('ask') }
    }, [])
    const clearPending = useCallback(() => setPending(null), [])

    useEffect(() => {
        const onOpen = (e: Event) => show((e as CustomEvent).detail)
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return
            const t = e.target as HTMLElement | null
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
            e.preventDefault()
            if (openRef.current) setOpen(false)
            else show()
        }
        window.addEventListener('asot:help-open', onOpen)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('asot:help-open', onOpen)
            window.removeEventListener('keydown', onKey)
        }
    }, [show])

    // While the panel is open, the article being read stays put across
    // navigation (its links are usually the way to the page it describes). A
    // category list doesn't, so the front page shows the new page instead.
    useEffect(() => {
        setCategory(null)
        if (!open) return
        shownOn.current = pathname
        // Next sets the new page's title just after the path changes.
        const t = setTimeout(() => setLabel(pageLabel(pathname, document.title)), 50)
        return () => clearTimeout(t)
    }, [pathname, open])

    const askedHere = useMemo(() => data ? faqForPath(data.faq, pathname, 4).map(e => e.question) : [], [data, pathname])
    const askAbout = (q: string) => { setPending(q); setTab('ask') }

    const hidden = HIDDEN_ON.some(re => re.test(pathname))

    // On a narrow screen the panel covers the page, so following a link closes it.
    const onNavigate = () => { if (window.innerWidth < 900) setOpen(false) }

    const openArticle = (next: string) => { setSlug(next); setTab('guide') }
    const article = slug ? data?.articles.find(a => a.slug === slug) : undefined

    const suggest = (next: SuggestDraft) => { setDraft(next); setTab('suggest') }

    const runTutorial = (id: string) => {
        setOpen(false)
        startTutorial(id)
        router.push(`${pathname}?tutorial=${encodeURIComponent(id)}` as never)
    }

    return (
        <>
            {!hidden && (
                <button
                    type='button'
                    className={`${s.launcher} ${open ? s.launcherOpen : ''}`}
                    onClick={() => (open ? setOpen(false) : show())}
                    aria-label='Help and guides'
                    aria-expanded={open}
                    title='Help and guides (?)'
                    data-help-launcher=''
                >
                    ?
                </button>
            )}

            <Drawer anchor='right' open={open} onClose={() => setOpen(false)} sx={{ zIndex: 1400 }}
                PaperProps={{ sx: { background: 'transparent', boxShadow: '-12px 0 40px rgba(0,0,0,0.5)' } }}>
                <div className={s.panel} role='dialog' aria-label='Help'>
                    <div className={s.panelHead}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <span className={s.kicker}>Help &amp; guides</span>
                            <span className={s.panelTitle}>ASOT Wiki</span>
                        </div>
                        <button type='button' className={s.iconBtn} onClick={() => setOpen(false)} aria-label='Close help'><Close sx={{ fontSize: 18 }} /></button>
                    </div>

                    <div className={s.tabs} role='tablist'>
                        {(['guide', 'ask', 'suggest'] as Tab[]).map(t => (
                            <button key={t} type='button' role='tab' aria-selected={tab === t}
                                className={`${s.tab} ${tab === t ? s.tabActive : ''}`}
                                onClick={() => { if (t === 'guide' && tab === 'guide') setSlug(null); setTab(t) }}>
                                {t === 'guide' ? 'Guide' : t === 'ask' ? 'Ask' : 'Suggest'}
                            </button>
                        ))}
                    </div>

                    <div className={s.body}>
                        {!data ? (
                            error
                                ? <div className={s.empty}>The guides couldn&apos;t be loaded. <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={reload}>Try again</button></div>
                                : <div className={s.thinking}>Loading the guides…</div>
                        ) : tab === 'guide' ? (
                            article ? (
                                <>
                                    <button type='button' className={s.back} onClick={() => setSlug(null)}><ArrowBack sx={{ fontSize: 15 }} />All guides</button>
                                    <ArticleView
                                        article={article}
                                        articles={data.articles}
                                        viewer={data.viewer}
                                        onArticle={openArticle}
                                        onNavigate={onNavigate}
                                        onSuggestEdit={() => suggest({ kind: 'edit', slug: article.slug })}
                                        onReportBug={() => suggest({ kind: 'bug', slug: article.slug })}
                                        onStartTutorial={runTutorial}
                                        fullPageHref={`/help/${article.slug}`}
                                        editHref={data.viewer.canReview ? `/dashboard/j7?tab=3&article=${article.slug}` : undefined}
                                    />
                                </>
                            ) : (
                                <HelpHome
                                    articles={data.articles}
                                    faq={data.faq}
                                    pathname={pathname}
                                    label={label}
                                    onAsk={askAbout}
                                    onNavigate={onNavigate}
                                    canAsk={data.viewer.canAsk}
                                    query={query}
                                    setQuery={setQuery}
                                    category={category}
                                    setCategory={setCategory}
                                    onOpen={openArticle}
                                    autoFocus={open}
                                />
                            )
                        ) : tab === 'ask' ? (
                            <HelpAsk
                                messages={messages}
                                setMessages={setMessages}
                                articles={data.articles}
                                pathname={pathname}
                                pageTitle={label}
                                pending={pending}
                                clearPending={clearPending}
                                suggestions={askedHere.length ? askedHere : ['What can I do on this page?', `How do I use ${label}?`]}
                                signedIn={data.viewer.signedIn}
                                canAsk={data.viewer.canAsk}
                                onArticle={openArticle}
                                onNavigate={onNavigate}
                                onSendToJ7={q => suggest({ kind: 'question', body: q })}
                            />
                        ) : (
                            <HelpSuggest
                                draft={draft}
                                articles={data.articles}
                                pathname={pathname}
                                signedIn={data.viewer.signedIn}
                                onDone={() => setTab('guide')}
                                onOpenArticle={openArticle}
                            />
                        )}
                    </div>
                </div>
            </Drawer>
        </>
    )
}
