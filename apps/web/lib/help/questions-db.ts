import type { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import { createNotificationForRole } from '@/lib/notifications'
import { CATEGORY_KEYS, type HelpArticleView, type HelpReaderScope } from './search'
import {
    HELP_ASSISTANT_ID, HELP_ASSISTANT_NAME, MAX_ASKER_IDS,
    faqVisible, matchQuestion, pageKey, questionTokens, sortFaq, suggestionToRaise,
    type AskOutcome, type FaqEntry,
} from './questions'

/**
 * The database half of `questions.ts`: fold an asking into its entry, raise
 * what the assistant learned with J7, and read the FAQ back.
 */

export interface AskRecord {
    question: string
    pathname: string
    askerId: string
    answer: string
    sources: string[]
    outcome: AskOutcome
    issue?: string
    scope: { audience: HelpAudience; departments?: string[] }
}

/** Questions shorter than this are not worth remembering ("hi", "test"). */
const MIN_QUESTION_WORDS = 2

export async function recordQuestion(r: AskRecord): Promise<{ id?: string; raised: HelpSuggestionKind | null }> {
    const tokens = questionTokens(r.question)
    if (tokens.length < MIN_QUESTION_WORDS) return { raised: null }

    const now = new Date()
    const page = pageKey(r.pathname)
    const candidates = await Db.helpQuestions.find({ tokens: { $in: tokens } }).sort({ askCount: -1 }).limit(300).toArray()
    const match = matchQuestion(tokens, candidates)

    let entry: HelpQuestion & { _id: ObjectId }
    if (match) {
        const newAsker = !match.askerIds.includes(r.askerId)
        const pages = [...match.pages]
        const p = pages.find(x => x.path === page)
        if (p) p.count++
        else pages.push({ path: page, count: 1 })
        pages.sort((a, b) => b.count - a.count)

        const set: Partial<HelpQuestion> = {
            lastAskedAt: now,
            pages: pages.slice(0, 12),
            outcome: r.outcome,
            issue: r.outcome === 'site-issue' ? r.issue : undefined,
            audience: r.scope.audience,
            departments: r.scope.departments,
        }
        // Keep the latest answer, unless this time it couldn't answer and an
        // earlier time it could: a good answer isn't thrown away by one bad run.
        if (r.outcome === 'answered' || !match.answer) { set.answer = r.answer; set.sources = r.sources }
        else { delete set.outcome; delete set.audience; delete set.departments }
        if (r.outcome === 'site-issue') { set.outcome = 'site-issue'; set.issue = r.issue }

        await Db.helpQuestions.updateOne({ _id: match._id }, {
            $set: set,
            $inc: { askCount: 1, ...(newAsker ? { distinctAskers: 1 } : {}) },
            ...(newAsker && match.askerIds.length < MAX_ASKER_IDS ? { $push: { askerIds: r.askerId } } : {}),
        })
        entry = (await Db.helpQuestions.findOne({ _id: match._id }))! as HelpQuestion & { _id: ObjectId }
    } else {
        const doc: HelpQuestion = {
            question: r.question.trim().replace(/\s+/g, ' ').slice(0, 300),
            tokens,
            askCount: 1,
            askerIds: [r.askerId],
            distinctAskers: 1,
            firstAskedAt: now,
            lastAskedAt: now,
            pages: [{ path: page, count: 1 }],
            answer: r.answer,
            sources: r.sources,
            outcome: r.outcome,
            issue: r.issue,
            audience: r.scope.audience,
            departments: r.scope.departments,
        }
        const { insertedId } = await Db.helpQuestions.insertOne(doc)
        entry = { ...doc, _id: insertedId }
    }

    const raised = await raiseWithJ7(entry, r.pathname)
    return { id: String(entry._id), raised }
}

/**
 * Put what the assistant learned in J7's queue, once per question (a fault is
 * raised even if a plain question was raised before):
 *  - couldn't answer → a question for J7 to answer with a guide;
 *  - points at something broken → a bug report;
 *  - answered, and enough people asked → a drafted FAQ guide from its answer.
 */
async function raiseWithJ7(q: HelpQuestion & { _id: ObjectId }, pathname: string): Promise<HelpSuggestionKind | null> {
    const kind = suggestionToRaise(q)
    if (!kind) return null

    const askers = `${q.distinctAskers} ${q.distinctAskers === 1 ? 'person has' : 'people have'} asked this (${q.askCount} time${q.askCount === 1 ? '' : 's'}).`
    const where = q.pages.slice(0, 3).map(p => p.path).join(', ')
    const doc: HelpSuggestion = kind === 'new'
        ? {
            kind: 'new',
            title: q.question,
            summary: `Asked by ${q.distinctAskers} members on the help assistant.`,
            category: CATEGORY_KEYS.includes('faq') ? 'faq' : undefined,
            body: q.answer ?? '',
            note: `${askers} This is the assistant's own answer, drafted as a FAQ guide. Check it before approving: it can be wrong if a guide it used is out of date.`,
            pagePath: pathname,
            status: 'pending', authorId: HELP_ASSISTANT_ID, authorName: HELP_ASSISTANT_NAME, questionId: String(q._id), createdAt: new Date(),
        }
        : kind === 'bug'
            ? {
                kind: 'bug',
                title: `Possible fault: ${q.issue ?? q.question}`.slice(0, 120),
                body: `The help assistant thinks this points at something not working on the site.\n\nWhat it noticed: ${q.issue ?? '(no detail)'}\n\nThe question: "${q.question}"\nAsked from: ${where}\n${askers}`,
                pagePath: pathname,
                status: 'pending', authorId: HELP_ASSISTANT_ID, authorName: HELP_ASSISTANT_NAME, questionId: String(q._id), createdAt: new Date(),
            }
            : {
                kind: 'question',
                title: q.question.slice(0, 120),
                body: `The help assistant couldn't answer this from the guides.\n\nThe question: "${q.question}"\nAsked from: ${where}\n${askers}\n\nWrite a guide for it (or add it to an existing one) and the assistant will use it from then on.`,
                pagePath: pathname,
                status: 'pending', authorId: HELP_ASSISTANT_ID, authorName: HELP_ASSISTANT_NAME, questionId: String(q._id), createdAt: new Date(),
            }

    const { insertedId } = await Db.helpSuggestions.insertOne(doc)
    await Db.helpQuestions.updateOne({ _id: q._id }, { $set: { suggestionId: String(insertedId), suggestionKind: kind } })
    for (const role of PERMISSIONS.help.review) {
        await createNotificationForRole(role, {
            type: 'help_suggestion_submitted',
            title: kind === 'new' ? 'Help wiki: the assistant drafted a FAQ guide' : kind === 'bug' ? 'Help wiki: the assistant spotted a possible fault' : "Help wiki: a question the assistant couldn't answer",
            body: q.question.slice(0, 140),
            actionUrl: '/dashboard/j7?tab=3',
            relatedId: String(insertedId),
        })
    }
    return kind
}

export function toFaqEntry(q: HelpQuestion & { _id?: ObjectId }): FaqEntry {
    return {
        id: String(q._id),
        question: q.question,
        answer: q.editedAnswer ?? q.answer ?? '',
        sources: q.sources ?? [],
        askers: q.distinctAskers,
        pages: q.pages.map(p => p.path),
        articleSlug: q.articleSlug,
        pinned: q.pinned || undefined,
    }
}

/** The living FAQ for one reader, most asked first. */
export async function loadFaq(reader: HelpReaderScope, readable: HelpArticleView[], limit = 60): Promise<FaqEntry[]> {
    const slugs = new Set(readable.map(a => a.slug))
    const docs = await Db.helpQuestions
        .find({ hidden: { $ne: true }, $or: [{ pinned: true }, { outcome: 'answered' }] })
        .sort({ pinned: -1, distinctAskers: -1, lastAskedAt: -1 })
        .limit(400)
        .toArray()
    return sortFaq(docs.filter(q => faqVisible(q, reader, slugs))).slice(0, limit).map(toFaqEntry)
}
