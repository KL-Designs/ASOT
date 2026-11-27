'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { TextField, IconButton, Chip, Tooltip } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import ExtensionIcon from '@mui/icons-material/Extension'
import { ModWikiMarkdown, extractHeadings } from './ModWikiMarkdown'
import { ModWikiSuggest } from './ModWikiSuggest'
import { ModWikiArticleEditor } from './ModWikiArticleEditor'
import type { ModWikiArticleView, ModWikiSearchHit } from '@/lib/mod-wiki/search'
import { searchModWikiArticles, articlesInCategory, MOD_WIKI_CATEGORIES } from '@/lib/mod-wiki/search'
import type { ModWikiViewer } from '@/lib/mod-wiki/viewer'

interface Props {
    initialData?: { viewer: ModWikiViewer; articles: ModWikiArticleView[] }
    slug?: string
}

type View = 'home' | 'article' | 'search'

export function ModWikiPage({ initialData, slug }: Props) {
    const [viewer, setViewer] = useState<ModWikiViewer>(initialData?.viewer ?? { signedIn: false, canSuggest: false, canReview: false })
    const [articles, setArticles] = useState<ModWikiArticleView[]>(initialData?.articles ?? [])
    const [loading, setLoading] = useState(!initialData)
    const [view, setView] = useState<View>(slug ? 'article' : 'home')
    const [currentSlug, setCurrentSlug] = useState<string | null>(slug ?? null)
    const [query, setQuery] = useState('')
    const [searchResults, setSearchResults] = useState<ModWikiSearchHit[]>([])
    const [editing, setEditing] = useState(false)
    const [suggesting, setSuggesting] = useState(false)

    const article = currentSlug ? articles.find(a => a.slug === currentSlug) ?? null : null

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/mod-wiki')
            if (res.ok) {
                const data = await res.json()
                setViewer(data.viewer)
                setArticles(data.articles)
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { if (!initialData) fetchData() }, [fetchData, initialData])

    useEffect(() => {
        if (slug) { setCurrentSlug(slug); setView('article') }
    }, [slug])

    useEffect(() => {
        if (query.trim().length >= 2) {
            setSearchResults(searchModWikiArticles(articles, query))
            setView('search')
        } else if (view === 'search') {
            setView(currentSlug ? 'article' : 'home')
        }
    }, [query, articles])

    function openArticle(s: string) {
        setCurrentSlug(s)
        setView('article')
        setQuery('')
        setEditing(false)
        setSuggesting(false)
        window.history.pushState({}, '', `/dashboard/unit/mod-features/${s}`)
    }

    function goHome() {
        setCurrentSlug(null)
        setView('home')
        setQuery('')
        setEditing(false)
        setSuggesting(false)
        window.history.pushState({}, '', '/dashboard/unit/mod-features')
    }

    if (loading) return <div style={{ padding: 32, color: 'var(--fg-2)' }}>Loading…</div>

    return (
        <div style={{ display: 'flex', gap: 0, minHeight: 400 }}>
            {/* ── Left sidebar ───────────────────────────── */}
            <Sidebar
                articles={articles}
                currentSlug={currentSlug}
                onSelect={openArticle}
                onHome={goHome}
                query={query}
                setQuery={setQuery}
            />

            {/* ── Main content ───────────────────────────── */}
            <div style={{ flex: 1, minWidth: 0, padding: '0 24px 40px' }}>
                {view === 'search' && (
                    <SearchResults results={searchResults} query={query} onSelect={openArticle} />
                )}

                {view === 'home' && (
                    <HomeView articles={articles} onSelect={openArticle} canReview={viewer.canReview} />
                )}

                {view === 'article' && article && !editing && (
                    <ArticleView
                        article={article}
                        viewer={viewer}
                        onEdit={() => setEditing(true)}
                        suggesting={suggesting}
                        onSuggest={() => setSuggesting(true)}
                        onSuggestClose={() => setSuggesting(false)}
                        afterSave={(updated) => {
                            setArticles(prev => prev.map(a => a.slug === updated.slug ? updated : a))
                            setEditing(false)
                        }}
                    />
                )}

                {view === 'article' && article && editing && viewer.canReview && (
                    <ModWikiArticleEditor
                        article={article}
                        onSave={(updated) => {
                            setArticles(prev => prev.map(a => a.slug === updated.slug ? updated : a))
                            setEditing(false)
                        }}
                        onCancel={() => setEditing(false)}
                    />
                )}

                {view === 'article' && !article && (
                    <div style={{ padding: 32, color: 'var(--fg-2)' }}>
                        Article not found.{' '}
                        <button onClick={goHome} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            Back to index
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ articles, currentSlug, onSelect, onHome, query, setQuery }: {
    articles: ModWikiArticleView[]
    currentSlug: string | null
    onSelect: (slug: string) => void
    onHome: () => void
    query: string
    setQuery: (q: string) => void
}) {
    const categories = MOD_WIKI_CATEGORIES.filter(c => articles.some(a => a.category === c.key && !a.hidden))

    return (
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--line-1)', paddingRight: 16, paddingTop: 2, paddingBottom: 40 }}>
            <button
                onClick={onHome}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontWeight: 600, fontSize: '0.95em', marginBottom: 14, padding: '4px 0', width: '100%' }}
            >
                <ExtensionIcon sx={{ fontSize: 16, color: 'var(--accent)' }} />
                ASOT Mod &amp; Features
            </button>

            <div style={{ marginBottom: 12 }}>
                <TextField
                    size='small'
                    fullWidth
                    placeholder='Search…'
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    InputProps={{
                        startAdornment: <SearchIcon sx={{ fontSize: 16, mr: 0.5, color: 'var(--fg-3)' }} />,
                        endAdornment: query ? <IconButton size='small' onClick={() => setQuery('')}><CloseIcon sx={{ fontSize: 14 }} /></IconButton> : null,
                    }}
                    sx={{ '& .MuiInputBase-root': { fontSize: '0.85em' } }}
                />
            </div>

            {categories.map(cat => {
                const catArticles = articlesInCategory(articles.filter(a => !a.hidden), cat.key)
                return (
                    <div key={cat.key} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: '0.72em', fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 1, padding: '2px 0 4px' }}>
                            {cat.label}
                        </div>
                        {catArticles.map(a => (
                            <button
                                key={a.slug}
                                onClick={() => onSelect(a.slug)}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left', background: 'none',
                                    border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 4,
                                    fontSize: '0.88em', lineHeight: 1.4, color: a.slug === currentSlug ? 'var(--accent)' : 'var(--fg)',
                                    backgroundColor: a.slug === currentSlug ? 'rgba(var(--accent-rgb,155,27,48),0.08)' : 'transparent',
                                    marginBottom: 1,
                                }}
                            >
                                {a.title}
                            </button>
                        ))}
                    </div>
                )
            })}
        </div>
    )
}

// ── Home view ─────────────────────────────────────────────────────────────────

function HomeView({ articles, onSelect, canReview }: { articles: ModWikiArticleView[]; onSelect: (s: string) => void; canReview: boolean }) {
    const categories = MOD_WIKI_CATEGORIES.filter(c => articles.some(a => a.category === c.key && (!a.hidden || canReview)))

    return (
        <div>
            <h2 style={{ fontSize: '1.4em', fontWeight: 700, marginBottom: 6, marginTop: 0 }}>ASOT Mod &amp; Features</h2>
            <p style={{ color: 'var(--fg-2)', marginBottom: 24, fontSize: '0.95em' }}>
                Player guides for all ASOT Development and Training Addons Mod features.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {categories.map(cat => {
                    const catArticles = articlesInCategory(articles.filter(a => !a.hidden || canReview), cat.key)
                    return (
                        <div key={cat.key} style={{ border: '1px solid var(--line-1)', borderRadius: 8, padding: '12px 14px', background: 'var(--ink-2)' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95em', marginBottom: 2 }}>{cat.label}</div>
                            <div style={{ color: 'var(--fg-3)', fontSize: '0.8em', marginBottom: 10 }}>{cat.blurb}</div>
                            {catArticles.map(a => (
                                <button
                                    key={a.slug}
                                    onClick={() => onSelect(a.slug)}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontSize: '0.9em', color: 'var(--accent)' }}
                                >
                                    {a.title}
                                    {a.hidden && <Chip label='hidden' size='small' sx={{ ml: 1, fontSize: '0.65em', height: 16 }} />}
                                </button>
                            ))}
                            {catArticles.length === 0 && <div style={{ color: 'var(--fg-3)', fontSize: '0.85em' }}>No guides yet</div>}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Article view ──────────────────────────────────────────────────────────────

function ArticleView({ article, viewer, onEdit, suggesting, onSuggest, onSuggestClose, afterSave }: {
    article: ModWikiArticleView
    viewer: ModWikiViewer
    onEdit: () => void
    suggesting: boolean
    onSuggest: () => void
    onSuggestClose: () => void
    afterSave: (a: ModWikiArticleView) => void
}) {
    const headings = extractHeadings(article.body).filter(h => h.level <= 3)

    return (
        <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Article header */}
                <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{article.title}</h1>
                        {viewer.canReview && (
                            <button
                                onClick={onEdit}
                                style={{ flexShrink: 0, padding: '4px 12px', fontSize: '0.82em', background: 'var(--ink-2)', border: '1px solid var(--line-2)', borderRadius: 4, cursor: 'pointer', color: 'var(--fg-2)', whiteSpace: 'nowrap' }}
                            >
                                Edit article
                            </button>
                        )}
                    </div>
                    {article.version && (
                        <div style={{ fontSize: '0.82em', color: 'var(--fg-3)', marginBottom: 4 }}>
                            <strong>Version:</strong> {article.version}
                        </div>
                    )}
                    {article.requiredMods.length > 0 && (
                        <div style={{ fontSize: '0.82em', color: 'var(--fg-3)', marginBottom: 4 }}>
                            <strong>Requires:</strong> {article.requiredMods.join(', ')}
                        </div>
                    )}
                    {article.pbos.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                            {article.pbos.map(p => <Chip key={p} label={p} size='small' sx={{ fontSize: '0.75em', height: 20 }} />)}
                        </div>
                    )}
                </div>

                {/* Article body */}
                <ModWikiMarkdown body={article.body} />

                {/* Suggest section */}
                <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--line-1)' }}>
                    {!suggesting && viewer.signedIn && (
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={onSuggest}
                                style={{ padding: '5px 14px', fontSize: '0.85em', background: 'none', border: '1px solid var(--line-2)', borderRadius: 4, cursor: 'pointer', color: 'var(--fg-2)' }}
                            >
                                Suggest an edit
                            </button>
                            <button
                                onClick={onSuggest}
                                style={{ padding: '5px 14px', fontSize: '0.85em', background: 'none', border: '1px solid var(--line-2)', borderRadius: 4, cursor: 'pointer', color: 'var(--fg-2)' }}
                            >
                                Report a bug
                            </button>
                        </div>
                    )}
                    {suggesting && (
                        <ModWikiSuggest article={article} onClose={onSuggestClose} />
                    )}
                </div>
            </div>

            {/* Table of contents */}
            {headings.length > 2 && (
                <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 80, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                    <div style={{ fontSize: '0.78em', fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contents</div>
                    {headings.filter(h => h.level >= 2).map(h => (
                        <a
                            key={h.id}
                            href={`#${h.id}`}
                            style={{
                                display: 'block', fontSize: '0.83em', color: 'var(--fg-2)', textDecoration: 'none', lineHeight: 1.4,
                                padding: `2px 0 2px ${(h.level - 2) * 12}px`,
                                marginBottom: 1,
                            }}
                        >
                            {h.text}
                        </a>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Search results ────────────────────────────────────────────────────────────

function SearchResults({ results, query, onSelect }: { results: ModWikiSearchHit[]; query: string; onSelect: (s: string) => void }) {
    return (
        <div>
            <h2 style={{ fontSize: '1.1em', fontWeight: 600, marginBottom: 12, marginTop: 0, color: 'var(--fg-2)' }}>
                {results.length ? `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"` : `No results for "${query}"`}
            </h2>
            {results.map(hit => (
                <div key={hit.article.slug} style={{ marginBottom: 14, padding: '10px 14px', border: '1px solid var(--line-1)', borderRadius: 6, background: 'var(--ink-2)', cursor: 'pointer' }} onClick={() => onSelect(hit.article.slug)}>
                    <div style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '0.95em', marginBottom: 2 }}>{hit.article.title}</div>
                    <div style={{ color: 'var(--fg-3)', fontSize: '0.82em', marginBottom: 4 }}>{hit.article.summary}</div>
                    {hit.snippet && <div style={{ color: 'var(--fg-2)', fontSize: '0.82em' }}>…{hit.snippet}…</div>}
                </div>
            ))}
        </div>
    )
}
