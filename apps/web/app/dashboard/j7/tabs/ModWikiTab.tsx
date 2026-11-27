'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ModWikiMarkdown } from '@/components/mod-wiki/ModWikiMarkdown'
import { ModWikiArticleEditor } from '@/components/mod-wiki/ModWikiArticleEditor'
import { MOD_WIKI_CATEGORIES, type ModWikiArticleView } from '@/lib/mod-wiki/search'
import { slugFromTitle } from '@/lib/mod-wiki/validate'
import { MOD_WIKI_SUGGESTION_KIND_LABEL, type ModWikiSuggestionView } from '@/lib/mod-wiki/suggestions'
import s from '@/styles/help.module.css'

type Mode = 'queue' | 'articles'
type Status = 'pending' | 'approved' | 'rejected'

interface EditorState {
    original: ModWikiArticleView | null
    slug: string
    suggestion?: ModWikiSuggestionView
}

function editorFor(a: ModWikiArticleView | null, suggestion?: ModWikiSuggestionView): EditorState {
    return { original: a, slug: a?.slug ?? (suggestion ? slugFromTitle(suggestion.title) : ''), suggestion }
}

/**
 * J7/J4's side of the ASOT Mod & Features wiki: suggestion queue and
 * direct article editing. Mirrors the HelpWikiTab pattern.
 */
export default function ModWikiTab() {
    const [mode, setMode] = useState<Mode>('queue')
    const [status, setStatus] = useState<Status>('pending')
    const [suggestions, setSuggestions] = useState<ModWikiSuggestionView[] | null>(null)
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [articles, setArticles] = useState<ModWikiArticleView[]>([])
    const [error, setError] = useState<string | null>(null)
    const [editor, setEditor] = useState<EditorState | null>(null)

    const loadArticles = useCallback(async () => {
        const res = await fetch('/api/mod-wiki', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (json?.articles) setArticles(json.articles)
        return (json?.articles ?? []) as ModWikiArticleView[]
    }, [])

    const loadQueue = useCallback(async () => {
        setSuggestions(null)
        const res = await fetch(`/api/mod-wiki/suggestions?status=${status}`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) { setError(json?.error ?? 'The queue could not be loaded.'); setSuggestions([]); return }
        setSuggestions(json.suggestions)
        if (json.counts) setCounts(json.counts)
    }, [status])

    useEffect(() => { loadQueue() }, [loadQueue])
    useEffect(() => { loadArticles() }, [loadArticles])

    const afterChange = async () => { await Promise.all([loadQueue(), loadArticles()]) }

    const pendingTotal = Object.values(counts).reduce((a, b) => a + b, 0)

    if (editor) {
        const baseArticle = editor.original
        const isNew = !baseArticle
        const sg = editor.suggestion

        return (
            <div className='mx-6 my-4'>
                <ModWikiArticleEditor
                    article={baseArticle ?? {
                        slug: editor.slug,
                        title: sg?.title ?? '',
                        category: sg?.category ?? 'misc',
                        summary: sg?.summary ?? '',
                        body: sg?.body ?? '',
                        pbos: [],
                        requiredMods: [],
                        keywords: [],
                        version_num: 0,
                        builtIn: false,
                    }}
                    onSave={async () => { setEditor(null); await afterChange() }}
                    onCancel={() => setEditor(null)}
                    isNew={isNew}
                    slug={editor.slug}
                />
            </div>
        )
    }

    return (
        <div className='mx-6 my-4' style={{ fontFamily: 'var(--font-ui)' }}>
            <div className={s.row} style={{ marginBottom: 14 }}>
                <button type='button' className={`${s.btn} ${mode === 'queue' ? s.btnPrimary : ''}`} onClick={() => setMode('queue')}>
                    Queue{pendingTotal ? ` (${pendingTotal})` : ''}
                </button>
                <button type='button' className={`${s.btn} ${mode === 'articles' ? s.btnPrimary : ''}`} onClick={() => setMode('articles')}>
                    Articles ({articles.length})
                </button>
                <span className={s.spacer} />
                <Link href='/dashboard/unit/mod-features' className={`${s.btn} ${s.btnGhost}`}>Open the wiki</Link>
            </div>

            {error && <div className={s.error}>{error}</div>}

            {mode === 'queue' ? (
                <>
                    <div className={s.row} style={{ marginBottom: 12 }}>
                        {(['pending', 'approved', 'rejected'] as Status[]).map(st => (
                            <button key={st} type='button' className={`${s.btn} ${s.btnSmall} ${status === st ? s.btnPrimary : s.btnGhost}`} onClick={() => setStatus(st)}>
                                {st === 'pending' ? 'Waiting' : st === 'approved' ? 'Approved' : 'Rejected'}
                            </button>
                        ))}
                        {status === 'pending' && pendingTotal > 0 && (
                            <span className={s.hint}>
                                {Object.entries(counts).map(([k, n]) => `${n} ${MOD_WIKI_SUGGESTION_KIND_LABEL[k as ModWikiSuggestionKind].toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}
                            </span>
                        )}
                    </div>
                    {!suggestions
                        ? <div className={s.thinking}>Loading…</div>
                        : suggestions.length === 0
                            ? <div className={s.empty}>{status === 'pending' ? 'Nothing waiting. New suggestions from the mod wiki appear here.' : 'Nothing here yet.'}</div>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {suggestions.map(sg => (
                                    <SuggestionCard key={sg.id} suggestion={sg} articles={articles}
                                        onEditFirst={() => setEditor(editorFor(sg.kind === 'edit' ? articles.find(a => a.slug === sg.articleSlug) ?? null : null, sg))}
                                        onDone={afterChange} />
                                ))}
                            </div>}
                </>
            ) : (
                <ArticleIndex articles={articles} onEdit={a => setEditor(editorFor(a))} onNew={() => setEditor(editorFor(null))} />
            )}
        </div>
    )
}

// ── Queue ─────────────────────────────────────────────────────────────────────

function SuggestionCard({ suggestion: sg, articles, onEditFirst, onDone }: {
    suggestion: ModWikiSuggestionView
    articles: ModWikiArticleView[]
    onEditFirst: () => void
    onDone: () => Promise<void>
}) {
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [view, setView] = useState<'body' | 'preview'>('body')

    const article = sg.articleSlug ? articles.find(a => a.slug === sg.articleSlug) : undefined
    const isStale = sg.kind === 'edit' && !!article && sg.baseVersion !== undefined && sg.baseVersion !== article.version_num
    const changesArticles = sg.kind === 'edit' || sg.kind === 'new'

    const act = async (action: 'approve' | 'reject', force = false) => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/mod-wiki/suggestions/${sg.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, note, force }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setError(json.error ?? 'That did not work.'); return }
            await onDone()
        } finally {
            setBusy(false)
        }
    }

    const when = new Date(sg.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    const catLabel = sg.category ? MOD_WIKI_CATEGORIES.find(c => c.key === sg.category)?.label : undefined

    return (
        <div style={{ border: '1px solid var(--line-2)', background: 'var(--ink-1)', padding: '12px 14px' }}>
            <div className={s.row}>
                <span className={`${s.tag} ${sg.kind === 'bug' ? s.tagRed : s.tagLive}`}>{MOD_WIKI_SUGGESTION_KIND_LABEL[sg.kind]}</span>
                <strong style={{ fontSize: '0.95rem' }}>{sg.title}</strong>
                <span className={s.spacer} />
                <span className={s.hint}>{sg.authorName} · {when}</span>
            </div>
            <div className={s.row} style={{ marginTop: 4 }}>
                {article && <span className={s.hint}>Article: <Link href={`/dashboard/unit/mod-features/${article.slug}` as never} style={{ color: 'var(--red-hi)' }}>{article.title}</Link></span>}
                {sg.kind === 'new' && catLabel && <span className={s.hint}>Category: {catLabel}</span>}
            </div>
            {sg.note && <div className={s.callout} style={{ fontSize: '0.85rem' }}><strong>Why:</strong> {sg.note}</div>}
            {isStale && <div className={s.error} style={{ marginTop: 8 }}>This article has changed since the edit was written.</div>}

            <div style={{ marginTop: 10 }}>
                {sg.kind === 'edit' || sg.kind === 'new' ? (
                    <>
                        <div className={s.row} style={{ marginBottom: 6 }}>
                            <button type='button' className={`${s.btn} ${s.btnSmall} ${view === 'body' ? s.btnPrimary : s.btnGhost}`} onClick={() => setView('body')}>Markdown</button>
                            <button type='button' className={`${s.btn} ${s.btnSmall} ${view === 'preview' ? s.btnPrimary : s.btnGhost}`} onClick={() => setView('preview')}>Preview</button>
                        </div>
                        {view === 'body'
                            ? <pre className={s.compareCol} style={{ whiteSpace: 'pre-wrap', fontSize: '0.82em', margin: 0 }}>{sg.body}</pre>
                            : <div className={s.compareCol}><ModWikiMarkdown body={sg.body} /></div>}
                    </>
                ) : (
                    <div className={s.compareCol} style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.5 }}>{sg.body}</div>
                )}
            </div>

            {sg.status === 'pending' ? (
                <div style={{ marginTop: 10 }}>
                    {error && <div className={s.error}>{error}</div>}
                    <div className={s.field} style={{ marginBottom: 8 }}>
                        <label htmlFor={`mw-note-${sg.id}`}>Note to {sg.authorName} (optional)</label>
                        <input id={`mw-note-${sg.id}`} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={sg.kind === 'bug' ? 'What you did about it' : 'Thanks, or why not'} />
                    </div>
                    <div className={s.row}>
                        <button type='button' className={`${s.btn} ${s.btnPrimary}`} disabled={busy || (sg.kind === 'edit' && !article)} onClick={() => act('approve', isStale)}>
                            {changesArticles ? (isStale ? 'Approve anyway' : 'Approve and publish') : 'Mark handled'}
                        </button>
                        {changesArticles && (sg.kind === 'new' || article) && <button type='button' className={s.btn} disabled={busy} onClick={onEditFirst}>Edit, then approve</button>}
                        <span className={s.spacer} />
                        <button type='button' className={`${s.btn} ${s.btnGhost}`} disabled={busy} onClick={() => act('reject')}>{changesArticles ? 'Reject' : 'Dismiss'}</button>
                    </div>
                </div>
            ) : (
                <div className={s.hint} style={{ marginTop: 8 }}>
                    {sg.status === 'approved' ? 'Approved' : 'Rejected'} by {sg.reviewedByName ?? 'J7'}{sg.reviewedAt ? ` on ${new Date(sg.reviewedAt).toLocaleDateString()}` : ''}{sg.reviewNote ? `: "${sg.reviewNote}"` : ''}
                </div>
            )}
        </div>
    )
}

// ── Articles ──────────────────────────────────────────────────────────────────

function ArticleIndex({ articles, onEdit, onNew }: { articles: ModWikiArticleView[]; onEdit: (a: ModWikiArticleView) => void; onNew: () => void }) {
    return (
        <>
            <div className={s.row} style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: '0.88rem' }}>All articles</strong>
                <span className={s.spacer} />
                <button type='button' className={`${s.btn} ${s.btnPrimary}`} onClick={onNew}>New article</button>
            </div>
            {MOD_WIKI_CATEGORIES.map(c => {
                const inCat = articles.filter(a => a.category === c.key)
                if (!inCat.length) return null
                return (
                    <div key={c.key} className={s.section}>
                        <div className={s.sectionHead}><span className={s.kicker}>{c.label}</span></div>
                        <ul className={s.items}>
                            {inCat.map(a => (
                                <li key={a.slug}>
                                    <button type='button' className={s.item} onClick={() => onEdit(a)}>
                                        <div className={s.itemTitle}>
                                            {a.title}
                                            {a.hidden && <span className={`${s.tag} ${s.tagAmber}`}>Hidden</span>}
                                            {a.builtIn && <span className={s.tag} title='Never edited — still the built-in copy'>Built-in</span>}
                                        </div>
                                        <div className={s.itemSummary}>
                                            /mod-features/{a.slug}{a.updatedByName ? ` · v${a.version_num} by ${a.updatedByName}` : ''}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )
            })}
        </>
    )
}
