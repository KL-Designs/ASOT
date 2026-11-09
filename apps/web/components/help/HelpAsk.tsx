'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Send } from '@mui/icons-material'
import HelpMarkdown from './HelpMarkdown'
import type { HelpArticleView } from '@/lib/help/search'
import s from '@/styles/help.module.css'

export interface AskMessage {
    role: 'user' | 'assistant'
    content: string
    sources?: { slug: string; title: string }[]
    error?: boolean
}

/**
 * The Ask tab: a short conversation with the site's AI, answered from the
 * wiki (`POST /api/help/ask`). The conversation is held by the caller so it
 * survives the panel closing. Every answer offers "Send to J7" so a question
 * the wiki can't answer reaches a person.
 */
export default function HelpAsk({ messages, setMessages, articles, pathname, signedIn, canAsk, onArticle, onNavigate, onSendToJ7 }: {
    messages: AskMessage[]
    setMessages: React.Dispatch<React.SetStateAction<AskMessage[]>>
    articles: HelpArticleView[]
    pathname: string
    signedIn: boolean
    canAsk: boolean
    onArticle: (slug: string) => void
    onNavigate?: () => void
    onSendToJ7: (question: string) => void
}) {
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const end = useRef<HTMLDivElement>(null)
    const titles = new Map(articles.map(a => [a.slug, a.title]))

    useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages, busy])

    if (!signedIn) {
        return <div className={s.empty}><Link href='/login' onClick={onNavigate}>Sign in</Link> with Discord to ask the assistant a question. Until then, the Guide tab's search covers every public guide.</div>
    }
    if (!canAsk) {
        return (
            <div className={s.empty}>
                The AI assistant is for ASOT members. You can still search the guides, or send your question to J7.
                <div style={{ marginTop: 10 }}><button type='button' className={s.btn} onClick={() => onSendToJ7('')}>Ask J7 instead</button></div>
            </div>
        )
    }

    const lastQuestion = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''

    const ask = async () => {
        const question = input.trim()
        if (!question || busy) return
        const history = messages.filter(m => !m.error).map(m => ({ role: m.role, content: m.content }))
        setMessages(m => [...m, { role: 'user', content: question }])
        setInput('')
        setBusy(true)
        try {
            const res = await fetch('/api/help/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, pathname, history }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                setMessages(m => [...m, { role: 'assistant', error: true, content: json.unavailable
                    ? `The assistant isn't available right now (${json.error ?? 'unknown reason'}). You can send your question to J7 instead.`
                    : json.error ?? 'Something went wrong. Try again.' }])
                return
            }
            setMessages(m => [...m, { role: 'assistant', content: json.answer, sources: json.sources }])
        } catch {
            setMessages(m => [...m, { role: 'assistant', error: true, content: 'Could not reach the assistant. Check your connection and try again.' }])
        } finally {
            setBusy(false)
        }
    }

    return (
        <div>
            {messages.length === 0 && (
                <div className={s.empty} style={{ marginBottom: 12 }}>
                    Ask anything about using the site or how the unit runs, like <em>“How do I RSVP for Saturday?”</em> or <em>“Where do I find the SOPs?”</em>. Answers come from the guides in this wiki, so they can be wrong if a guide is out of date. Check the linked guide when it matters.
                </div>
            )}

            <div className={s.chat}>
                {messages.map((m, i) => m.role === 'user'
                    ? <div key={i} className={`${s.msg} ${s.msgUser}`}>{m.content}</div>
                    : (
                        <div key={i} className={`${s.msg} ${s.msgBot}`}>
                            {m.error ? <div>{m.content}</div> : <HelpMarkdown source={m.content} onArticle={onArticle} onNavigate={onNavigate} titles={titles} />}
                            {!!m.sources?.length && (
                                <div className={s.sources}>
                                    {m.sources.map(src => (
                                        <button key={src.slug} type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => onArticle(src.slug)}>{src.title}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                {busy && <div className={s.thinking}>Checking the guides…</div>}
                <div ref={end} />
            </div>

            {messages.length > 0 && !busy && (
                <div className={s.row} style={{ marginTop: 10 }}>
                    <span className={s.hint}>Not answered?</span>
                    <button type='button' className={`${s.btn} ${s.btnSmall}`} onClick={() => onSendToJ7(lastQuestion)}>Send to J7</button>
                    <span className={s.spacer} />
                    <button type='button' className={`${s.btn} ${s.btnSmall} ${s.btnGhost}`} onClick={() => setMessages([])}>New conversation</button>
                </div>
            )}

            <div className={s.askBox}>
                <textarea
                    value={input}
                    maxLength={600}
                    placeholder='Ask a question…'
                    aria-label='Your question'
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
                />
                <button type='button' className={`${s.btn} ${s.btnPrimary}`} onClick={ask} disabled={busy || !input.trim()} aria-label='Ask'>
                    <Send sx={{ fontSize: 16 }} />
                </button>
            </div>
        </div>
    )
}
