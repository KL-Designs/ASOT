import { describe, expect, it } from 'vitest'
import {
    answerScope, faqForPath, faqVisible, jaccard, matchQuestion, pageKey, parseAskReply,
    questionTokens, sortFaq, suggestionToRaise, toQuestionView, type FaqEntry,
} from './questions'
import { canSee, pageLabel, type HelpArticleView, type HelpReaderScope } from './search'
import { articleChapters } from './markdown'

const member: HelpReaderScope = { level: 'member', departments: [], allDepartments: false }
const j1Member: HelpReaderScope = { level: 'member', departments: ['j1'], allDepartments: false }
const reviewer: HelpReaderScope = { level: 'staff', departments: [], allDepartments: true }
const visitor: HelpReaderScope = { level: 'public', departments: [], allDepartments: false }

function q(over: Partial<HelpQuestion> = {}): HelpQuestion {
    return {
        question: 'How do I RSVP for an operation?', tokens: questionTokens('How do I RSVP for an operation?'),
        askCount: 3, askerIds: ['a', 'b'], distinctAskers: 2,
        firstAskedAt: new Date('2026-11-01'), lastAskedAt: new Date('2026-11-10'),
        pages: [{ path: '/operations/*', count: 2 }],
        answer: 'Open the operation and press Attending.', sources: ['rsvp-to-an-operation'],
        outcome: 'answered', audience: 'member',
        ...over,
    }
}

function article(slug: string, audience: HelpAudience, departments?: string[]): HelpArticleView {
    return { slug, title: slug, category: 'faq', summary: '', body: '', audience, paths: [], keywords: [], departments, version: 0, builtIn: true }
}

describe('matching questions', () => {
    it('folds rewordings of the same question together', () => {
        const a = questionTokens('How do I RSVP for an operation?')
        const b = questionTokens('how can i rsvp to operations')
        expect(jaccard(a, b)).toBeGreaterThanOrEqual(0.6)
        expect(matchQuestion(b, [{ tokens: a }])).not.toBeNull()
    })

    it('keeps different questions apart', () => {
        const a = questionTokens('How do I RSVP for an operation?')
        const b = questionTokens('How do I change my operation callsign?')
        expect(matchQuestion(b, [{ tokens: a }])).toBeNull()
    })

    it('needs short questions to match exactly', () => {
        expect(matchQuestion(questionTokens('rsvp discord'), [{ tokens: questionTokens('rsvp') }])).toBeNull()
        expect(matchQuestion(questionTokens('RSVPs?'), [{ tokens: questionTokens('rsvp') }])).not.toBeNull()
    })

    it('picks the closest match', () => {
        const near = { id: 'near', tokens: questionTokens('where are the unit SOPs kept') }
        const far = { id: 'far', tokens: questionTokens('where are the unit SOPs and training docs kept') }
        expect(matchQuestion(questionTokens('where are unit SOPs kept?'), [far, near])?.id).toBe('near')
    })
})

describe('page keys', () => {
    it('folds ids and drops queries', () => {
        expect(pageKey('/operations/65f0c3a1b2c3d4e5f6a7b8c9?tab=2')).toBe('/operations/*')
        expect(pageKey('/milpacs/john.smith')).toBe('/milpacs/john.smith')
        expect(pageKey('/dashboard/j3/training-records/123')).toBe('/dashboard/j3/training-records/*')
        expect(pageKey('/')).toBe('/')
        expect(pageKey('/dashboard/')).toBe('/dashboard')
    })

    it('names pages for people', () => {
        expect(pageLabel('/dashboard/j1')).toBe('Dashboard › J1')
        expect(pageLabel('/operations/65f0c3a1b2c3d4e5f6a7b8c9/aar')).toBe('Operations › Aar')
        expect(pageLabel('/', 'Australian Special Operations Taskforce')).toBe('Home')
        expect(pageLabel('/help', 'Help & guides | Australian Special Operations Taskforce')).toBe('Help & guides')
    })
})

describe('reading the reply', () => {
    it('takes the status line off', () => {
        expect(parseAskReply('Open [Operations](/operations).\n\nSTATUS: answered')).toEqual({ answer: 'Open [Operations](/operations).', outcome: 'answered' })
        expect(parseAskReply("The wiki doesn't cover that yet.\nSTATUS: unanswered").outcome).toBe('unanswered')
    })

    it('reads a site issue and what it noticed', () => {
        const r = parseAskReply('That button should be there.\n**STATUS: site-issue: the RSVP button is missing on the operation page**')
        expect(r.outcome).toBe('site-issue')
        expect(r.issue).toBe('the RSVP button is missing on the operation page')
        expect(r.answer).toBe('That button should be there.')
    })

    it('treats a reply without a status as answered', () => {
        expect(parseAskReply('Just an answer.')).toEqual({ answer: 'Just an answer.', outcome: 'answered' })
    })
})

describe('who may read an answer', () => {
    it('takes the highest audience shown and the cited departments', () => {
        const shown = [article('a', 'public'), article('b', 'member', ['j1']), article('c', 'member', ['j2'])]
        expect(answerScope(shown, ['b'])).toEqual({ audience: 'member', departments: ['j1'] })
        expect(answerScope(shown, [])).toEqual({ audience: 'member', departments: ['j1', 'j2'] })
        expect(answerScope([article('a', 'public')], ['a'])).toEqual({ audience: 'public', departments: undefined })
    })

    it('gates guides and answers by audience and department', () => {
        expect(canSee({ audience: 'member', departments: ['j1'] }, member)).toBe(false)
        expect(canSee({ audience: 'member', departments: ['j1'] }, j1Member)).toBe(true)
        expect(canSee({ audience: 'member', departments: ['j1'] }, reviewer)).toBe(true)
        expect(canSee({ audience: 'member' }, visitor)).toBe(false)
        expect(canSee({ audience: 'staff' }, j1Member)).toBe(false)
    })
})

describe('the living FAQ', () => {
    const readable = new Set(['rsvp-to-an-operation'])

    it('shows answered questions asked by enough people', () => {
        expect(faqVisible(q(), member, readable)).toBe(true)
        expect(faqVisible(q({ distinctAskers: 1 }), member, readable)).toBe(false)
        expect(faqVisible(q({ distinctAskers: 1, pinned: true }), member, readable)).toBe(true)
        expect(faqVisible(q({ outcome: 'unanswered' }), member, readable)).toBe(false)
        expect(faqVisible(q({ hidden: true, pinned: true }), member, readable)).toBe(false)
    })

    it('never shows an answer drawn from a guide the reader cannot open', () => {
        expect(faqVisible(q(), visitor, readable)).toBe(false)
        expect(faqVisible(q({ departments: ['j1'] }), member, readable)).toBe(false)
        expect(faqVisible(q({ departments: ['j1'] }), j1Member, readable)).toBe(true)
        expect(faqVisible(q(), member, new Set())).toBe(false)
    })

    it("uses J7's answer over the assistant's", () => {
        expect(faqVisible(q({ answer: undefined, editedAnswer: 'J7 wrote this.' }), member, readable)).toBe(true)
    })

    it('puts pinned, then most asked, then most recent first', () => {
        const sorted = sortFaq([
            { id: 'old', distinctAskers: 5, lastAskedAt: new Date('2026-01-01') },
            { id: 'new', distinctAskers: 5, lastAskedAt: new Date('2026-06-01') },
            { id: 'most', distinctAskers: 9, lastAskedAt: new Date('2025-01-01') },
            { id: 'pin', distinctAskers: 1, lastAskedAt: new Date('2025-01-01'), pinned: true },
        ])
        expect(sorted.map(x => x.id)).toEqual(['pin', 'most', 'new', 'old'])
    })

    it('finds the questions asked on a page', () => {
        const entries: FaqEntry[] = [
            { id: '1', question: 'a', answer: 'x', sources: [], askers: 3, pages: ['/operations/*'] },
            { id: '2', question: 'b', answer: 'x', sources: [], askers: 2, pages: ['/dashboard/j1'] },
            { id: '3', question: 'c', answer: 'x', sources: [], askers: 2, pages: ['/operations'] },
        ]
        expect(faqForPath(entries, '/operations/65f0c3a1b2c3d4e5f6a7b8c9').map(e => e.id)).toEqual(['1', '3'])
        expect(faqForPath(entries, '/dashboard/j1?tab=2').map(e => e.id)).toEqual(['2'])
    })

    it('marks whether J7 sees it in the FAQ', () => {
        expect(toQuestionView({ ...q(), _id: undefined }).inFaq).toBe(true)
        expect(toQuestionView(q({ distinctAskers: 1 })).inFaq).toBe(false)
    })
})

describe('raising with J7', () => {
    it("raises what the guides couldn't answer, once", () => {
        expect(suggestionToRaise(q({ outcome: 'unanswered', distinctAskers: 1 }))).toBe('question')
        expect(suggestionToRaise(q({ outcome: 'unanswered', suggestionId: 'x', suggestionKind: 'question' }))).toBeNull()
    })

    it('raises a fault even after a question was raised', () => {
        expect(suggestionToRaise(q({ outcome: 'site-issue', suggestionId: 'x', suggestionKind: 'question' }))).toBe('bug')
        expect(suggestionToRaise(q({ outcome: 'site-issue', suggestionId: 'y', suggestionKind: 'bug' }))).toBeNull()
    })

    it('drafts a FAQ guide once enough people ask', () => {
        expect(suggestionToRaise(q({ distinctAskers: 2 }))).toBeNull()
        expect(suggestionToRaise(q({ distinctAskers: 3 }))).toBe('new')
    })

    it('leaves alone what J7 has hidden or answered with a guide', () => {
        expect(suggestionToRaise(q({ outcome: 'unanswered', hidden: true }))).toBeNull()
        expect(suggestionToRaise(q({ outcome: 'unanswered', articleSlug: 'some-guide' }))).toBeNull()
    })
})

describe('chapters', () => {
    it("lists an article's headings for the contents", () => {
        expect(articleChapters('Intro\n\n## Before the **operation**\ntext\n\n### Lead Zeus\nmore')).toEqual([
            { id: 'before-the-operation', level: 2, text: 'Before the operation' },
            { id: 'lead-zeus', level: 3, text: 'Lead Zeus' },
        ])
    })
})
