import { describe, expect, it } from 'vitest'
import { BUILT_IN_ARTICLES } from './articles'
import { articleLinks, parseHelpMarkdown, parseInline, safeHref } from './markdown'
import { articlesForPath, canRead, CATEGORY_KEYS, pathSpecificity, searchArticles, type HelpArticleView } from './search'
import { buildAskSystemPrompt, citedSlugs, pickArticles, sanitiseHistory } from './ai'
import { cleanPath, parseArticleFields, parseSuggestion, slugFromTitle, SLUG_RE } from './validate'
import { diffLines, diffStats } from './diff'

const views: HelpArticleView[] = BUILT_IN_ARTICLES.map(a => ({
    slug: a._id, title: a.title, category: a.category, summary: a.summary, body: a.body, audience: a.audience,
    paths: a.paths, keywords: a.keywords, tutorial: a.tutorial, order: a.order, version: 0, builtIn: true,
}))

describe('built-in articles', () => {
    it('have unique, valid slugs and known categories', () => {
        const slugs = BUILT_IN_ARTICLES.map(a => a._id)
        expect(new Set(slugs).size).toBe(slugs.length)
        for (const a of BUILT_IN_ARTICLES) {
            expect(a._id).toMatch(SLUG_RE)
            expect(CATEGORY_KEYS).toContain(a.category)
            expect(a.summary.length).toBeLessThanOrEqual(240)
            expect(a.title.length).toBeLessThanOrEqual(120)
        }
    })

    it('only link articles that exist', () => {
        const slugs = new Set(BUILT_IN_ARTICLES.map(a => a._id))
        for (const a of BUILT_IN_ARTICLES) for (const l of articleLinks(a.body)) expect(slugs, `${a._id} → ${l}`).toContain(l)
    })

    it('never link a public reader to a member article they cannot open', () => {
        const bySlug = new Map(BUILT_IN_ARTICLES.map(a => [a._id, a]))
        for (const a of BUILT_IN_ARTICLES.filter(x => x.audience === 'public')) {
            for (const l of articleLinks(a.body)) {
                // A dead link renders struck through, so this is a warning sign, not a crash — but
                // public guides should stay readable start to finish for a visitor.
                if (bySlug.get(l)!.audience !== 'public') expect.soft(`${a._id} links member-only ${l}`).toBe('')
            }
        }
    })

    it('pass their own validation', () => {
        for (const a of BUILT_IN_ARTICLES) {
            const r = parseArticleFields(a)
            expect('fields' in r, a._id).toBe(true)
            if ('fields' in r) expect(r.fields.paths).toEqual(a.paths)
        }
    })
})

describe('markdown', () => {
    it('parses headings, lists, callouts and paragraphs', () => {
        const blocks = parseHelpMarkdown('## Title\nOne\ntwo\n\n- a\n- b\n\n1. x\n2. y\n\n> **Tip:** note\n\n---')
        expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'callout', 'rule'])
        expect(blocks[2]).toMatchObject({ ordered: false })
        expect(blocks[3]).toMatchObject({ ordered: true })
    })

    it('keeps a paragraph straight after a list separate', () => {
        const blocks = parseHelpMarkdown('- a\n- b\nAfter')
        expect(blocks.map(b => b.type)).toEqual(['list', 'paragraph'])
    })

    it('parses inline marks and links', () => {
        const nodes = parseInline('Go to [Ops](/operations), see [[rsvp-to-an-operation|RSVP]], **bold** `code` *it*')
        expect(nodes.map(n => n.type)).toEqual(['text', 'link', 'text', 'article', 'text', 'bold', 'text', 'code', 'text', 'italic'])
    })

    it('refuses script and protocol-relative links', () => {
        expect(safeHref('javascript:alert(1)')).toBeNull()
        expect(safeHref('//evil.example')).toBeNull()
        expect(safeHref('data:text/html,hi')).toBeNull()
        expect(safeHref('/ok')).toEqual({ href: '/ok', external: false })
        expect(safeHref('https://x.example')).toEqual({ href: 'https://x.example', external: true })
        const nodes = parseInline('[click](javascript:alert(1))')
        expect(nodes.every(n => n.type === 'text')).toBe(true)
    })
})

describe('search', () => {
    it('ranks by title and keywords first', () => {
        const hits = searchArticles(views, 'rsvp')
        expect(hits[0].article.slug).toBe('rsvp-to-an-operation')
    })

    it('stems plurals and handles natural questions', () => {
        expect(searchArticles(views, 'how do I raise tickets?')[0].article.slug).toBe('raising-a-ticket')
        expect(searchArticles(views, 'where are the SOPs')[0].article.slug).toBe('sops')
    })

    it('returns nothing for stop words or nonsense', () => {
        expect(searchArticles(views, 'how do I')).toEqual([])
        expect(searchArticles(views, 'zzqxv')).toEqual([])
    })

    it('matches page paths by specificity, with wildcards', () => {
        expect(pathSpecificity(['/dashboard'], '/dashboard/j3')).toBe(2)
        expect(pathSpecificity(['/dashboard/j3'], '/dashboard/j3?tab=2')).toBe(3)
        expect(pathSpecificity(['/operations/*'], '/operations/abc123')).toBe(3)
        expect(pathSpecificity(['/operations/*'], '/operations')).toBe(0)
        expect(pathSpecificity(['/'], '/')).toBe(1)
        expect(pathSpecificity(['/'], '/orbat')).toBe(0)
        expect(pathSpecificity(['/dash'], '/dashboard')).toBe(0)
        expect(articlesForPath(views, '/orbat')[0].slug).toBe('the-orbat')
    })

    it('gates by audience', () => {
        expect(canRead('public', 'public')).toBe(true)
        expect(canRead('member', 'public')).toBe(false)
        expect(canRead('member', 'staff')).toBe(true)
        expect(canRead('staff', 'member')).toBe(false)
    })
})

describe('ask', () => {
    it('picks articles from the question and the page', () => {
        const picked = pickArticles(views, 'how do I RSVP', '/orbat').map(a => a.slug)
        expect(picked).toContain('rsvp-to-an-operation')
        expect(picked).toContain('the-orbat')
    })

    it('falls back to the wiki intro when nothing matches', () => {
        expect(pickArticles(views, 'zzqxv', '/nowhere').map(a => a.slug)).toEqual(['using-the-help-wiki'])
    })

    it('only puts the given articles in the prompt', () => {
        const prompt = buildAskSystemPrompt(views.filter(v => v.slug === 'kits'), '/kits')
        expect(prompt).toContain('[[kits]]')
        expect(prompt).not.toContain('[[sops]]')
    })

    it('cleans the history it is sent', () => {
        expect(sanitiseHistory('nope')).toEqual([])
        const h = sanitiseHistory([
            { role: 'assistant', content: 'hi' },
            { role: 'system', content: 'evil' },
            { role: 'user', content: 'q'.repeat(5000) },
            { role: 'assistant', content: 'a' },
        ])
        expect(h.map(t => t.role)).toEqual(['user', 'assistant'])
        expect(h[0].content.length).toBe(2000)
    })

    it('finds the articles an answer cited', () => {
        const known = new Set(['kits', 'sops'])
        expect(citedSlugs('See [[kits]] and [SOPs](/help/sops) and [[made-up]], [[kits]] again', known)).toEqual(['kits', 'sops'])
    })
})

describe('validation', () => {
    it('cleans paths', () => {
        expect(cleanPath('/dashboard/j3/')).toBe('/dashboard/j3')
        expect(cleanPath('/operations/*?x=1')).toBe('/operations/*')
        expect(cleanPath('https://x')).toBeNull()
        expect(cleanPath('//x')).toBeNull()
        expect(cleanPath('/a b')).toBeNull()
    })

    it('makes slugs from titles', () => {
        expect(slugFromTitle("How to join ASOT's units!")).toBe('how-to-join-asots-units')
    })

    it('requires an article for an edit, and text for everything', () => {
        expect(parseSuggestion({ kind: 'edit', title: 'x', body: 'y' })).toHaveProperty('error')
        expect(parseSuggestion({ kind: 'bug', body: '   ' })).toHaveProperty('error')
        expect(parseSuggestion({ kind: 'nope', body: 'x' })).toHaveProperty('error')
    })

    it('gives a bug with no headline the start of its text', () => {
        const r = parseSuggestion({ kind: 'bug', body: 'The RSVP button does nothing\nOn Firefox', pagePath: '/operations/1' })
        expect(r).toMatchObject({ input: { title: 'The RSVP button does nothing', pagePath: '/operations/1' } })
    })

    it('drops a base version on anything but an edit', () => {
        const r = parseSuggestion({ kind: 'question', body: 'Why?', baseVersion: 3 })
        expect('input' in r && r.input.baseVersion).toBeUndefined()
    })
})

describe('diff', () => {
    it('marks added and removed lines', () => {
        const d = diffLines('a\nb\nc', 'a\nB\nc\nd')
        expect(d).toEqual([
            { type: 'same', text: 'a' },
            { type: 'del', text: 'b' },
            { type: 'add', text: 'B' },
            { type: 'same', text: 'c' },
            { type: 'add', text: 'd' },
        ])
        expect(diffStats(d)).toEqual({ added: 2, removed: 1 })
    })
})
