'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import HelpMarkdown from '@/components/help/HelpMarkdown'
import { SearchBox, CATEGORY_LABEL, AUDIENCE_LABEL } from '@/components/help/HelpViews'
import { reloadHelp } from '@/components/help/useHelpData'
import { HELP_AUDIENCES, HELP_CATEGORIES, searchArticles, type HelpArticleView } from '@/lib/help/search'
import { diffLines, diffStats } from '@/lib/help/diff'
import { DEPARTMENT_CODES, slugFromTitle } from '@/lib/help/validate'
import type { HelpQuestionView } from '@/lib/help/questions'
import { SUGGESTION_KIND_LABEL, type HelpSuggestionView } from '@/lib/help/suggestions'
import s from '@/styles/help.module.css'

type Mode = 'queue' | 'questions' | 'articles'
type Status = 'pending' | 'approved' | 'rejected'

interface EditorState {
    /** null for a new article. */
    original: HelpArticleView | null
    slug: string
    fields: {
        title: string; summary: string; body: string; category: HelpCategory; audience: HelpAudience
        paths: string; keywords: string; tutorial: string; order: string; hidden: boolean; departments: string[]
    }
    /** When editing a suggestion before approving it. */
    suggestion?: HelpSuggestionView
    /** When turning an asked question into a guide. */
    question?: HelpQuestionView
}

function editorFor(a: HelpArticleView | null, suggestion?: HelpSuggestionView): EditorState {
    const base = a ?? null
    return {
        original: base,
        slug: base?.slug ?? (suggestion ? slugFromTitle(suggestion.title) : ''),
        suggestion,
        fields: {
            title: suggestion && suggestion.kind !== 'bug' ? suggestion.title : base?.title ?? '',
            summary: suggestion?.kind === 'new' ? suggestion.summary ?? '' : base?.summary ?? '',
            body: suggestion && (suggestion.kind === 'edit' || suggestion.kind === 'new') ? suggestion.body : base?.body ?? '',
            category: suggestion?.kind === 'new' ? suggestion.category ?? 'faq' : base?.category ?? 'faq',
            audience: base?.audience ?? 'member',
            paths: (base?.paths ?? (suggestion?.pagePath ? [suggestion.pagePath] : [])).join('\n'),
            keywords: (base?.keywords ?? []).join(', '),
            tutorial: base?.tutorial ?? '',
            order: base?.order !== undefined ? String(base.order) : '',
            hidden: !!base?.hidden,
            departments: base?.departments ?? [],
        },
    }
}

/** A new FAQ guide drafted from a question people asked the assistant. */
function editorForQuestion(q: HelpQuestionView): EditorState {
    const st = editorFor(null)
    return {
        ...st,
        slug: slugFromTitle(q.question),
        question: q,
        fields: {
            ...st.fields,
            title: q.question,
            summary: `Asked by ${q.askers} ${q.askers === 1 ? 'member' : 'members'} on the help assistant.`,
            body: q.editedAnswer ?? q.answer ?? '',
            category: 'faq',
            audience: q.audience,
            departments: q.departments ?? [],
            paths: q.pages.slice(0, 3).map(p => p.path).join('\n'),
        },
    }
}

/**
 * J7's side of the help wiki: the queue of edit suggestions, new-guide ideas,
 * bug reports and questions readers (and the help assistant) send in; every
 * question people have asked the assistant, which make up the living FAQ; and
 * direct editing of every guide with its history. See the "J7: reviewing help
 * wiki suggestions" guide.
 */
export default function HelpWikiTab() {
    const params = useSearchParams()
    const [mode, setMode] = useState<Mode>(params.get('article') ? 'articles' : params.get('view') === 'questions' ? 'questions' : 'queue')
    const [status, setStatus] = useState<Status>('pending')
    const [suggestions, setSuggestions] = useState<HelpSuggestionView[] | null>(null)
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [articles, setArticles] = useState<HelpArticleView[]>([])
    const [error, setError] = useState<string | null>(null)
    const [editor, setEditor] = useState<EditorState | null>(null)

    const loadArticles = useCallback(async () => {
        const res = await fetch('/api/help', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (json?.articles) setArticles(json.articles)
        return (json?.articles ?? []) as HelpArticleView[]
    }, [])

    const loadQueue = useCallback(async () => {
        setSuggestions(null)
        const res = await fetch(`/api/help/suggestions?status=${status}`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) { setError(json?.error ?? 'The queue could not be loaded.'); setSuggestions([]); return }
        setSuggestions(json.suggestions)
        if (json.counts) setCounts(json.counts)
    }, [status])

    useEffect(() => { loadQueue() }, [loadQueue])
    useEffect(() => {
        loadArticles().then(list => {
            const want = params.get('article')
            const a = want ? list.find(x => x.slug === want) : undefined
            if (a) setEditor(editorFor(a))
        })
        // Only the first load follows the ?article= deep link from the help panel's "Edit (J7)".
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadArticles])

    const afterChange = async () => {
        await Promise.all([loadQueue(), loadArticles()])
        reloadHelp().catch(() => { })
    }

    const pendingTotal = Object.values(counts).reduce((a, b) => a + b, 0)

    if (editor) {
        return (
            <div className='mx-6 my-4'>
                <ArticleEditor
                    state={editor}
                    articles={articles}
                    onCancel={() => setEditor(null)}
                    onSaved={async () => { setEditor(null); await afterChange() }}
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
                <button type='button' className={`${s.btn} ${mode === 'questions' ? s.btnPrimary : ''}`} onClick={() => setMode('questions')}>
                    Asked questions
                </button>
                <button type='button' className={`${s.btn} ${mode === 'articles' ? s.btnPrimary : ''}`} onClick={() => setMode('articles')}>
                    Guides ({articles.length})
                </button>
                <span className={s.spacer} />
                <Link href='/help' className={`${s.btn} ${s.btnGhost}`}>Open the wiki</Link>
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
                                {Object.entries(counts).map(([k, n]) => `${n} ${SUGGESTION_KIND_LABEL[k as HelpSuggestionKind].toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}
                            </span>
                        )}
                    </div>
                    {!suggestions
                        ? <div className={s.thinking}>Loading…</div>
                        : suggestions.length === 0
                            ? <div className={s.empty}>{status === 'pending' ? 'Nothing waiting. New suggestions from the help wiki appear here.' : 'Nothing here yet.'}</div>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {suggestions.map(sg => (
                                    <SuggestionCard key={sg.id} suggestion={sg} articles={articles}
                                        onEditFirst={() => setEditor(editorFor(sg.kind === 'edit' ? articles.find(a => a.slug === sg.articleSlug) ?? null : null, sg))}
                                        onDone={afterChange} />
                                ))}
                            </div>}
                </>
            ) : mode === 'questions' ? (
                <QuestionsView articles={articles} onMakeGuide={q => setEditor(editorForQuestion(q))} />
            ) : (
                <ArticleIndex articles={articles} onEdit={a => setEditor(editorFor(a))} onNew={() => setEditor(editorFor(null))} />
            )}
        </div>
    )
}

// ── Queue ─────────────────────────────────────────────────────────────────────

function SuggestionCard({ suggestion: sg, articles, onEditFirst, onDone }: {
    suggestion: HelpSuggestionView
    articles: HelpArticleView[]
    onEditFirst: () => void
    onDone: () => Promise<void>
}) {
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [stale, setStale] = useState(false)
    const [view, setView] = useState<'diff' | 'preview'>('diff')

    const article = sg.articleSlug ? articles.find(a => a.slug === sg.articleSlug) : undefined
    const isStale = sg.kind === 'edit' && !!article && sg.baseVersion !== undefined && sg.baseVersion !== article.version
    const diff = useMemo(() => sg.kind === 'edit' && article ? diffLines(article.body, sg.body) : [], [sg, article])
    const stats = diffStats(diff)
    const titles = useMemo(() => new Map(articles.map(a => [a.slug, a.title])), [articles])

    const act = async (action: 'approve' | 'reject', force = false) => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/help/suggestions/${sg.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, note, force }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setError(json.error ?? 'That did not work.'); if (json.stale) setStale(true); return }
            await onDone()
        } finally {
            setBusy(false)
        }
    }

    const when = new Date(sg.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    const changesArticles = sg.kind === 'edit' || sg.kind === 'new'

    return (
        <div style={{ border: '1px solid var(--line-2)', background: 'var(--ink-1)', padding: '12px 14px' }}>
            <div className={s.row}>
                <span className={`${s.tag} ${sg.kind === 'bug' ? s.tagRed : sg.kind === 'question' ? s.tagAmber : s.tagLive}`}>{SUGGESTION_KIND_LABEL[sg.kind]}</span>
                <strong style={{ fontSize: '0.95rem' }}>{sg.title}</strong>
                <span className={s.spacer} />
                <span className={s.hint}>{sg.authorName} · {when}</span>
            </div>
            <div className={s.row} style={{ marginTop: 4 }}>
                {article && <span className={s.hint}>Guide: <Link href={`/help/${article.slug}` as never} style={{ color: 'var(--red-hi)' }}>{article.title}</Link></span>}
                {sg.kind === 'new' && sg.category && <span className={s.hint}>Topic: {CATEGORY_LABEL[sg.category]}</span>}
                {sg.pagePath && <span className={s.hint}>Sent from <Link href={sg.pagePath as never} style={{ color: 'var(--txt-2)' }}>{sg.pagePath}</Link></span>}
                {sg.kind === 'edit' && article && <span className={s.hint}>+{stats.added} / −{stats.removed} lines{sg.title !== article.title ? ' · title changed' : ''}</span>}
            </div>
            {sg.note && <div className={s.callout} style={{ fontSize: '0.85rem' }}><strong>Why:</strong> {sg.note}</div>}

            <div style={{ marginTop: 10 }}>
                {sg.kind === 'edit' && article ? (
                    <>
                        <div className={s.row} style={{ marginBottom: 6 }}>
                            <button type='button' className={`${s.btn} ${s.btnSmall} ${view === 'diff' ? s.btnPrimary : s.btnGhost}`} onClick={() => setView('diff')}>Changes</button>
                            <button type='button' className={`${s.btn} ${s.btnSmall} ${view === 'preview' ? s.btnPrimary : s.btnGhost}`} onClick={() => setView('preview')}>Current vs proposed</button>
                        </div>
                        {view === 'diff' ? (
                            <div className={s.compareCol}>
                                {sg.title !== article.title && <pre><span className={s.diffDel}>{article.title}</span>{'\n'}<span className={s.diffAdd}>{sg.title}</span>{'\n\n'}</pre>}
                                <pre>{diff.map((l, i) => (
                                    <span key={i} className={l.type === 'add' ? s.diffAdd : l.type === 'del' ? s.diffDel : undefined}>
                                        {l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}{l.text}{'\n'}
                                    </span>
                                ))}</pre>
                            </div>
                        ) : (
                            <div className={s.compare}>
                                <div className={s.compareCol}><span className={s.kicker}>Current</span><HelpMarkdown source={article.body} titles={titles} /></div>
                                <div className={s.compareCol}><span className={s.kicker}>Proposed</span><HelpMarkdown source={sg.body} titles={titles} /></div>
                            </div>
                        )}
                    </>
                ) : sg.kind === 'edit' ? (
                    <div className={s.empty}>The guide this edit was for no longer exists.</div>
                ) : sg.kind === 'new' ? (
                    <div className={s.compareCol}>{sg.summary && <div className={s.hint} style={{ marginBottom: 6 }}>{sg.summary}</div>}<HelpMarkdown source={sg.body} titles={titles} /></div>
                ) : (
                    <div className={s.compareCol} style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.5 }}>{sg.body}</div>
                )}
            </div>

            {sg.status === 'pending' ? (
                <div style={{ marginTop: 10 }}>
                    {(isStale || stale) && <div className={s.error}>This guide has changed since the edit was written. Check the changes above before approving, or use Edit, then approve to merge it by hand.</div>}
                    {error && !stale && <div className={s.error}>{error}</div>}
                    <div className={s.field} style={{ marginBottom: 8 }}>
                        <label htmlFor={`note-${sg.id}`}>{sg.questionId ? 'Note to the people who asked (optional)' : `Note to ${sg.authorName} (optional)`}</label>
                        <input id={`note-${sg.id}`} value={note} onChange={e => setNote(e.target.value)} maxLength={1000}
                            placeholder={sg.kind === 'question' ? 'Your answer, or where the new guide is' : sg.kind === 'bug' ? "What you did about it" : 'Thanks, or why not'} />
                    </div>
                    <div className={s.row}>
                        <button type='button' className={`${s.btn} ${s.btnPrimary}`} disabled={busy || (sg.kind === 'edit' && !article)} onClick={() => act('approve', isStale || stale)}>
                            {changesArticles ? (isStale || stale ? 'Approve anyway' : 'Approve and publish') : 'Mark handled'}
                        </button>
                        {changesArticles && (sg.kind === 'new' || article) && <button type='button' className={s.btn} disabled={busy} onClick={onEditFirst}>Edit, then approve</button>}
                        {sg.kind === 'question' && <button type='button' className={s.btn} disabled={busy} onClick={onEditFirst}>Write a guide for it</button>}
                        <span className={s.spacer} />
                        <button type='button' className={`${s.btn} ${s.btnGhost}`} disabled={busy} onClick={() => act('reject')}>{changesArticles ? 'Reject' : 'Dismiss'}</button>
                    </div>
                </div>
            ) : (
                <div className={s.hint} style={{ marginTop: 8 }}>
                    {sg.status === 'approved' ? 'Approved' : 'Rejected'} by {sg.reviewedByName ?? 'J7'}{sg.reviewedAt ? ` on ${new Date(sg.reviewedAt).toLocaleDateString()}` : ''}{sg.reviewNote ? `: “${sg.reviewNote}”` : ''}
                </div>
            )}
        </div>
    )
}

// ── Asked questions ───────────────────────────────────────────────────────────

type QFilter = 'all' | 'faq' | 'unanswered' | 'issues' | 'hidden'
const Q_FILTERS: { key: QFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'faq', label: 'In the FAQ' },
    { key: 'unanswered', label: 'Not answered' },
    { key: 'issues', label: 'Possible faults' },
    { key: 'hidden', label: 'Hidden' },
]
const OUTCOME_LABEL: Record<HelpQuestionView['outcome'], string> = { answered: 'Answered', unanswered: 'Not answered', 'site-issue': 'Possible fault' }

/**
 * Everything people have asked the help assistant, most asked first. Entries
 * asked by enough people (or pinned) are the living FAQ readers see; J7 can
 * pin, hide, reword, answer them in their own words, or turn one into a guide.
 */
function QuestionsView({ articles, onMakeGuide }: { articles: HelpArticleView[]; onMakeGuide: (q: HelpQuestionView) => void }) {
    const [filter, setFilter] = useState<QFilter>('all')
    const [list, setList] = useState<HelpQuestionView[] | null>(null)
    const [counts, setCounts] = useState<{ all: number; unanswered: number; issues: number } | null>(null)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setList(null)
        const res = await fetch(`/api/help/questions?filter=${filter}`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) { setError(json?.error ?? 'The questions could not be loaded.'); setList([]); return }
        setList(json.questions)
        setCounts(json.counts)
    }, [filter])
    useEffect(() => { load() }, [load])

    const replace = (q: HelpQuestionView | null, id: string) => {
        setList(prev => prev ? (q ? prev.map(x => x.id === id ? q : x) : prev.filter(x => x.id !== id)) : prev)
        reloadHelp().catch(() => { })
    }

    return (
        <>
            <div className={s.row} style={{ marginBottom: 6 }}>
                {Q_FILTERS.map(f => (
                    <button key={f.key} type='button' className={`${s.btn} ${s.btnSmall} ${filter === f.key ? s.btnPrimary : s.btnGhost}`} onClick={() => setFilter(f.key)}>
                        {f.label}{counts && f.key === 'all' ? ` (${counts.all})` : counts && f.key === 'unanswered' && counts.unanswered ? ` (${counts.unanswered})` : counts && f.key === 'issues' && counts.issues ? ` (${counts.issues})` : ''}
                    </button>
                ))}
            </div>
            <div className={s.hint} style={{ marginBottom: 12 }}>
                Every question asked on the help assistant, with rewordings of the same question folded together. An answered question asked by 2 or more people shows in the FAQ for readers who can see the guides it came from; pin one to always show it. The assistant raises unanswered questions, likely faults and anything asked by 3 or more people in the Queue.
            </div>
            {error && <div className={s.error}>{error}</div>}
            {!list ? <div className={s.thinking}>Loading…</div>
                : list.length === 0 ? <div className={s.empty}>{filter === 'all' ? 'Nobody has asked the assistant anything yet.' : 'None here.'}</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {list.map(q => <QuestionCard key={q.id} q={q} articles={articles} onChange={replace} onMakeGuide={() => onMakeGuide(q)} />)}
                    </div>}
        </>
    )
}

function QuestionCard({ q, articles, onChange, onMakeGuide }: {
    q: HelpQuestionView
    articles: HelpArticleView[]
    onChange: (q: HelpQuestionView | null, id: string) => void
    onMakeGuide: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [question, setQuestion] = useState(q.question)
    const [answer, setAnswer] = useState(q.editedAnswer ?? q.answer ?? '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const titles = useMemo(() => new Map(articles.map(a => [a.slug, a.title])), [articles])
    const guide = q.articleSlug ? articles.find(a => a.slug === q.articleSlug) : undefined

    const patch = async (body: Record<string, unknown>) => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/help/questions/${q.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setError(json.error ?? 'That did not work.'); return false }
            onChange(json.question, q.id)
            return true
        } finally { setBusy(false) }
    }
    const remove = async () => {
        setBusy(true)
        try {
            const res = await fetch(`/api/help/questions/${q.id}`, { method: 'DELETE' })
            if (res.ok) onChange(null, q.id)
        } finally { setBusy(false) }
    }

    const last = new Date(q.lastAskedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    return (
        <div style={{ border: '1px solid var(--line-2)', background: 'var(--ink-1)', padding: '10px 14px' }}>
            <div className={s.row}>
                <span className={`${s.tag} ${q.outcome === 'site-issue' ? s.tagRed : q.outcome === 'unanswered' ? s.tagAmber : s.tagLive}`}>{OUTCOME_LABEL[q.outcome]}</span>
                {q.inFaq && <span className={`${s.tag} ${s.tagLive}`}>In FAQ</span>}
                {q.pinned && <span className={s.tag}>Pinned</span>}
                {q.hidden && <span className={`${s.tag} ${s.tagAmber}`}>Hidden</span>}
                {q.audience !== 'public' && <span className={s.tag}>{AUDIENCE_LABEL[q.audience]}</span>}
                {q.departments?.map(d => <span key={d} className={s.tag}>{d.toUpperCase()}</span>)}
                <strong style={{ fontSize: '0.95rem' }}>{q.question}</strong>
                <span className={s.spacer} />
                <span className={s.hint}>{q.askers} {q.askers === 1 ? 'person' : 'people'} · asked {q.askCount}× · last {last}</span>
            </div>
            <div className={s.row} style={{ marginTop: 4 }}>
                <span className={s.hint}>Asked on {q.pages.slice(0, 4).map(p => `${p.path} (${p.count})`).join(', ')}</span>
                {guide && <span className={s.hint}>Guide: <Link href={`/help/${guide.slug}` as never} style={{ color: 'var(--red-hi)' }}>{guide.title}</Link></span>}
                {q.suggestionKind && <span className={s.hint}>Raised in the queue as a {SUGGESTION_KIND_LABEL[q.suggestionKind].toLowerCase()}</span>}
            </div>
            {q.issue && <div className={s.callout} style={{ fontSize: '0.85rem' }}><strong>What the assistant noticed:</strong> {q.issue}</div>}

            {editing ? (
                <div style={{ marginTop: 8 }}>
                    <div className={s.field}>
                        <label htmlFor={`qq-${q.id}`}>Question as the FAQ shows it</label>
                        <input id={`qq-${q.id}`} value={question} maxLength={300} onChange={e => setQuestion(e.target.value)} />
                    </div>
                    <div className={s.field}>
                        <label htmlFor={`qa-${q.id}`}>Answer (empty goes back to the assistant&apos;s)</label>
                        <textarea id={`qa-${q.id}`} className={s.mono} rows={6} value={answer} onChange={e => setAnswer(e.target.value)} />
                    </div>
                    <div className={s.row}>
                        <button type='button' className={`${s.btn} ${s.btnPrimary} ${s.btnSmall}`} disabled={busy || !question.trim()}
                            onClick={async () => { if (await patch({ question, answer: answer.trim() === (q.answer ?? '').trim() ? '' : answer })) setEditing(false) }}>Save</button>
                        <button type='button' className={`${s.btn} ${s.btnGhost} ${s.btnSmall}`} onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                </div>
            ) : (q.editedAnswer ?? q.answer) ? (
                <div className={s.compareCol} style={{ marginTop: 8 }}>
                    {q.editedAnswer && <span className={s.kicker}>J7&apos;s answer</span>}
                    <HelpMarkdown source={q.editedAnswer ?? q.answer ?? ''} titles={titles} />
                </div>
            ) : null}

            {error && <div className={s.error} style={{ marginTop: 8 }}>{error}</div>}
            {!editing && (
                <div className={s.row} style={{ marginTop: 8 }}>
                    <button type='button' className={`${s.btn} ${s.btnSmall}`} disabled={busy} onClick={() => patch({ pinned: !q.pinned })}>{q.pinned ? 'Unpin' : 'Pin to FAQ'}</button>
                    <button type='button' className={`${s.btn} ${s.btnSmall}`} disabled={busy} onClick={() => setEditing(true)}>Edit wording or answer</button>
                    {!q.articleSlug && <button type='button' className={`${s.btn} ${s.btnSmall}`} disabled={busy} onClick={onMakeGuide}>Turn into a guide</button>}
                    {q.outcome !== 'answered' && (q.editedAnswer || q.articleSlug) && <button type='button' className={`${s.btn} ${s.btnSmall}`} disabled={busy} onClick={() => patch({ outcome: 'answered' })}>Mark answered</button>}
                    <span className={s.spacer} />
                    <button type='button' className={`${s.btn} ${s.btnSmall} ${s.btnGhost}`} disabled={busy} onClick={() => patch({ hidden: !q.hidden })}>{q.hidden ? 'Unhide' : 'Hide from FAQ'}</button>
                    <button type='button' className={`${s.btn} ${s.btnSmall} ${s.btnGhost}`} disabled={busy}
                        onClick={() => confirmDelete ? remove() : setConfirmDelete(true)} onBlur={() => setConfirmDelete(false)}>
                        {confirmDelete ? 'Click again to delete' : 'Delete'}
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Guides ────────────────────────────────────────────────────────────────────

function ArticleIndex({ articles, onEdit, onNew }: { articles: HelpArticleView[]; onEdit: (a: HelpArticleView) => void; onNew: () => void }) {
    const [query, setQuery] = useState('')
    const list = query.trim() ? searchArticles(articles, query, 100).map(h => h.article) : articles
    return (
        <>
            <div className={s.row} style={{ marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 220 }}><SearchBox value={query} onChange={setQuery} placeholder='Find a guide…' /></div>
                <button type='button' className={`${s.btn} ${s.btnPrimary}`} onClick={onNew}>New guide</button>
            </div>
            {HELP_CATEGORIES.map(c => {
                const inCat = list.filter(a => a.category === c.key)
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
                                            <span className={s.tag}>{AUDIENCE_LABEL[a.audience]}</span>
                                            {a.hidden && <span className={`${s.tag} ${s.tagAmber}`}>Hidden</span>}
                                            {a.builtIn && <span className={s.tag} title='Never edited: still the copy that shipped with the site'>Built-in</span>}
                                            {a.tutorial && <span className={`${s.tag} ${s.tagLive}`}>Walkthrough</span>}
                                            {a.departments?.map(d => <span key={d} className={s.tag}>{d.toUpperCase()} only</span>)}
                                        </div>
                                        <div className={s.itemSummary}>
                                            /help/{a.slug}{a.updatedByName ? ` · v${a.version} by ${a.updatedByName}` : ''}
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

interface RevisionView { id: string; version: number; title: string; savedAt: string; savedByName?: string; reason: string; hidden: boolean }

function ArticleEditor({ state, articles, onCancel, onSaved }: {
    state: EditorState
    articles: HelpArticleView[]
    onCancel: () => void
    onSaved: () => Promise<void>
}) {
    const [f, setF] = useState(state.fields)
    const [slug, setSlug] = useState(state.slug)
    const [preview, setPreview] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [revisions, setRevisions] = useState<RevisionView[] | null>(null)
    const isNew = !state.original
    const sg = state.suggestion
    const titles = useMemo(() => new Map(articles.map(a => [a.slug, a.title])), [articles])
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }))

    useEffect(() => {
        if (!state.original) return
        fetch(`/api/help/articles/${state.original.slug}/revisions`, { cache: 'no-store' })
            .then(r => r.json()).then(j => setRevisions(j.revisions ?? [])).catch(() => setRevisions([]))
    }, [state.original])

    const payload = () => ({
        title: f.title, summary: f.summary, body: f.body, category: f.category, audience: f.audience,
        paths: f.paths.split(/[\n,]/).map(x => x.trim()).filter(Boolean),
        keywords: f.keywords.split(',').map(x => x.trim()).filter(Boolean),
        tutorial: f.tutorial.trim() || undefined,
        order: f.order.trim() ? Number(f.order) : undefined,
        hidden: f.hidden,
        departments: f.departments,
    })

    const save = async () => {
        setBusy(true)
        setError(null)
        try {
            let res: Response
            if (sg?.kind === 'question') {
                // A question answered with a new guide: write the guide first, so a
                // failed save leaves the question open, then close the question.
                const created = await fetch(`/api/help/articles/${slug}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload(), create: true }),
                })
                if (!created.ok) { const j = await created.json().catch(() => ({})); setError(j.error ?? 'The guide could not be saved.'); return }
                res = await fetch(`/api/help/suggestions/${sg.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'approve', articleSlug: slug, note: `I've written a guide for this: /help/${slug}` }),
                })
            } else if (state.question) {
                // An asked question turned into a guide: write it, then link the question to it.
                res = await fetch(`/api/help/articles/${slug}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload(), create: true }),
                })
                if (res.ok) {
                    await fetch(`/api/help/questions/${state.question.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ articleSlug: slug, outcome: 'answered' }),
                    })
                }
            } else if (sg) {
                // Editing a suggestion before approving it: the approval carries the tidied fields.
                // The reviewer has merged it by hand here, so an older base version is accepted.
                res = await fetch(`/api/help/suggestions/${sg.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'approve', fields: payload(), slug, force: true }),
                })
            } else {
                res = await fetch(`/api/help/articles/${slug}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload(), create: isNew, baseVersion: state.original?.version }),
                })
            }
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setError(json.error ?? 'That could not be saved.'); return }
            await onSaved()
        } finally {
            setBusy(false)
        }
    }

    const restore = async (rev: RevisionView) => {
        if (!state.original) return
        setBusy(true)
        try {
            const res = await fetch(`/api/help/articles/${state.original.slug}/revisions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionId: rev.id }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setError(json.error ?? 'That could not be restored.'); return }
            await onSaved()
        } finally {
            setBusy(false)
        }
    }

    const slugEditable = isNew
    const heading = state.question ? `Turn into a guide: “${state.question.question}”` : sg
        ? sg.kind === 'question' ? `Write a guide answering “${sg.title}”` : `Edit, then approve: ${sg.title}`
        : isNew ? 'New guide' : `Edit: ${state.original!.title}`

    return (
        <div style={{ fontFamily: 'var(--font-ui)', maxWidth: 1100 }}>
            <div className={s.row} style={{ marginBottom: 12 }}>
                <button type='button' className={s.back} style={{ margin: 0 }} onClick={onCancel}>← Back</button>
                <strong style={{ fontFamily: 'var(--font-cond)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{heading}</strong>
                <span className={s.spacer} />
                {state.original && <Link href={`/help/${state.original.slug}` as never} className={`${s.btn} ${s.btnGhost} ${s.btnSmall}`}>View</Link>}
            </div>
            {state.question && <div className={s.callout} style={{ fontSize: '0.85rem' }}>Asked by {state.question.askers} {state.question.askers === 1 ? 'person' : 'people'}. The text below is the assistant&apos;s answer: check it before publishing.</div>}
            {sg?.kind === 'question' && <div className={s.callout} style={{ fontSize: '0.85rem' }}><strong>{sg.authorName} asked:</strong> {sg.body}</div>}
            {error && <div className={s.error}>{error}</div>}

            <div className={s.row} style={{ alignItems: 'flex-start' }}>
                <div className={s.field} style={{ flex: 3, minWidth: 240 }}>
                    <label htmlFor='he-title'>Title</label>
                    <input id='he-title' value={f.title} maxLength={120} onChange={e => { set('title', e.target.value); if (slugEditable && (!slug || slug === slugFromTitle(f.title))) setSlug(slugFromTitle(e.target.value)) }} />
                </div>
                <div className={s.field} style={{ flex: 2, minWidth: 180 }}>
                    <label htmlFor='he-slug'>Address: /help/…</label>
                    <input id='he-slug' value={slug} disabled={!slugEditable} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                </div>
            </div>
            <div className={s.field}>
                <label htmlFor='he-summary'>One-line summary</label>
                <input id='he-summary' value={f.summary} maxLength={240} onChange={e => set('summary', e.target.value)} />
            </div>
            <div className={s.row} style={{ alignItems: 'flex-start' }}>
                <div className={s.field} style={{ flex: 1, minWidth: 150 }}>
                    <label htmlFor='he-cat'>Topic</label>
                    <select id='he-cat' value={f.category} onChange={e => set('category', e.target.value as HelpCategory)}>
                        {HELP_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                </div>
                <div className={s.field} style={{ flex: 1, minWidth: 150 }}>
                    <label htmlFor='he-aud'>Who can read it</label>
                    <select id='he-aud' value={f.audience} onChange={e => set('audience', e.target.value as HelpAudience)}>
                        {HELP_AUDIENCES.map(a => <option key={a} value={a}>{a === 'public' ? 'Everyone, signed in or not' : a === 'member' ? 'Members and staff' : 'Staff only'}</option>)}
                    </select>
                </div>
                <div className={s.field} style={{ flex: 1, minWidth: 120 }}>
                    <label htmlFor='he-order'>Order in topic</label>
                    <input id='he-order' type='number' min={0} max={999} value={f.order} onChange={e => set('order', e.target.value)} placeholder='50' />
                </div>
                <div className={s.field} style={{ flex: 1, minWidth: 150 }}>
                    <label htmlFor='he-tut'>Walkthrough id</label>
                    <input id='he-tut' value={f.tutorial} onChange={e => set('tutorial', e.target.value)} placeholder='e.g. j1-applications' />
                </div>
            </div>
            <div className={s.row} style={{ alignItems: 'flex-start' }}>
                <div className={s.field} style={{ flex: 1, minWidth: 220 }}>
                    <label htmlFor='he-paths'>Pages it&apos;s about (one per line)</label>
                    <textarea id='he-paths' className={s.mono} rows={3} style={{ minHeight: 60 }} value={f.paths} onChange={e => set('paths', e.target.value)} />
                    <span className={s.hint}>Shows under “On this page” there and on pages below it. Use * for one segment, e.g. /operations/*.</span>
                </div>
                <div className={s.field} style={{ flex: 1, minWidth: 220 }}>
                    <label htmlFor='he-kw'>Search keywords (comma separated)</label>
                    <textarea id='he-kw' rows={3} style={{ minHeight: 60 }} value={f.keywords} onChange={e => set('keywords', e.target.value)} />
                    <span className={s.hint}>Words people might search for that aren&apos;t in the title.</span>
                </div>
            </div>

            <div className={s.field}>
                <label>Departments (leave all off for everyone the audience allows)</label>
                <div className={s.row}>
                    {DEPARTMENT_CODES.map(d => (
                        <label key={d} className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase' }}>
                            <input type='checkbox' checked={f.departments.includes(d)}
                                onChange={e => set('departments', e.target.checked ? [...f.departments, d] : f.departments.filter(x => x !== d))} />
                            {d}
                        </label>
                    ))}
                </div>
                <span className={s.hint}>Only members of the ticked departments (and J7 and J4 administration) see it, in the wiki, the FAQ and the assistant&apos;s answers.</span>
            </div>

            <div className={s.field}>
                <div className={s.row}>
                    <label htmlFor='he-body'>Guide text</label>
                    <span className={s.spacer} />
                    <button type='button' className={`${s.btn} ${s.btnSmall} ${s.btnGhost}`} onClick={() => setPreview(p => !p)}>{preview ? 'Edit' : 'Preview'}</button>
                </div>
                {preview
                    ? <div className={s.compareCol}><HelpMarkdown source={f.body} titles={titles} /></div>
                    : <textarea id='he-body' className={s.mono} rows={22} value={f.body} onChange={e => set('body', e.target.value)} />}
                <span className={s.hint}>**bold**, *italic*, - bullets, 1. steps, ## heading, &gt; note, [link text](/page), [[guide-slug]] links another guide.</span>
            </div>

            <div className={s.row}>
                <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type='checkbox' checked={f.hidden} onChange={e => set('hidden', e.target.checked)} /> Hidden (only J7 can see it)
                </label>
                <span className={s.spacer} />
                <button type='button' className={`${s.btn} ${s.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
                <button type='button' className={`${s.btn} ${s.btnPrimary}`} onClick={save} disabled={busy || !f.title.trim() || !f.body.trim() || !slug}>
                    {busy ? 'Saving…' : state.question ? 'Publish guide' : sg ? (sg.kind === 'question' ? 'Publish guide and close question' : 'Approve and publish') : 'Save'}
                </button>
            </div>

            {state.original && (
                <div className={s.section} style={{ marginTop: 24 }}>
                    <div className={s.sectionHead}><span className={s.kicker}>History</span></div>
                    {!revisions ? <div className={s.thinking}>Loading…</div>
                        : revisions.length === 0 ? <div className={s.hint}>{state.original.builtIn ? 'Never edited. This is the copy that shipped with the site.' : 'No earlier versions.'}</div>
                            : (
                                <ul className={s.items}>
                                    {revisions.map(r => (
                                        <li key={r.id} className={s.row} style={{ border: '1px solid var(--line-1)', padding: '6px 10px', background: 'var(--ink-2)' }}>
                                            <span style={{ fontSize: '0.85rem' }}>v{r.version} · {r.title}{r.hidden ? ' (hidden)' : ''}</span>
                                            <span className={s.hint}>replaced {new Date(r.savedAt).toLocaleString()} by {r.savedByName ?? '?'} ({r.reason})</span>
                                            <span className={s.spacer} />
                                            <button type='button' className={`${s.btn} ${s.btnSmall}`} disabled={busy} onClick={() => restore(r)}>Restore</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </div>
            )}
        </div>
    )
}
