import type { Tutorial, TutorialContext } from '../types'
import type { SandboxHandler } from '../sandbox'

export const PRACTICE_TICKET_ID = 'tutorial-practice-ticket'

/** Departments whose Admin view has a Tickets tool. J4 handles community tickets elsewhere. */
const TICKET_DEPTS = ['j1', 'j2', 'j3', 'j5', 'j6', 'j7']

/** The department page to run on: the one it was started from, else J1. */
export function ticketsDeptPath(ctx: TutorialContext) {
    const m = /^\/dashboard\/(j[1-7])(?:\/|$)/.exec(ctx.startedFrom)
    const dept = m && TICKET_DEPTS.includes(m[1]) ? m[1] : 'j1'
    return `/dashboard/${dept}`
}

function sandbox(ctx: TutorialContext): SandboxHandler[] {
    const dept = ticketsDeptPath(ctx).split('/').pop()!
    const now = new Date().toISOString()
    const practice: Record<string, any> = {
        _id: PRACTICE_TICKET_ID,
        category: 'request',
        subtype: 'feature-request',
        visibility: 'public',
        status: 'open',
        title: 'Practice ticket: add a range day to the calendar (TUTORIAL)',
        description: 'A made-up ticket for the tutorial. Nothing you do to it is saved.',
        authorId: 'tutorial',
        authorName: 'Practice Member',
        isAnonymous: false,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        upvotes: [],
        downvotes: [],
        voteScore: 3,
        commentCount: 0,
        department: dept,
        departments: [dept],
        tags: [],
    }

    return [
        {
            method: 'GET',
            path: '/api/feedback',
            transform: (data, req) => {
                if (!Array.isArray(data)) return data
                const wantDept = req.url.searchParams.get('department')
                const wantCat = req.url.searchParams.get('category')
                const show = (!wantDept || practice.departments.includes(wantDept)) && (!wantCat || wantCat === practice.category)
                return show ? [{ ...practice }, ...data] : data
            },
        },
        {
            method: 'PATCH',
            path: /^\/api\/tickets\/[^/]+$/,
            respond: req => {
                const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {}
                if (req.url.pathname.endsWith(PRACTICE_TICKET_ID)) Object.assign(practice, body)
                return { ok: true }
            },
        },
        {
            method: 'POST',
            path: /^\/api\/tickets\/[^/]+\/transfer$/,
            respond: req => {
                const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, any> : {}
                if (req.url.pathname.includes(PRACTICE_TICKET_ID) && typeof body.toDepartment === 'string') {
                    practice.department = body.toDepartment
                    practice.departments = [body.toDepartment]
                }
                return { ok: true }
            },
        },
    ]
}

const adminTickets = (ctx: TutorialContext) => `${ticketsDeptPath(ctx)}?view=settings&admin=tickets`
const ROW = '[data-tour="tutorial-practice-ticket"]'

export const deptTicketsTutorial: Tutorial = {
    id: 'dept-tickets',
    title: 'Handling department tickets',
    summary: 'Find tickets sent to your department, update their status, and transfer one to another department.',
    area: 'Departments',
    pages: TICKET_DEPTS.map(d => `/dashboard/${d}`),
    startPath: ticketsDeptPath,
    sandbox,
    steps: [
        {
            title: 'Department tickets',
            body: [
                'When a member raises a ticket (a request, bug, mission idea or feedback), it is routed to the department that owns it. This walkthrough shows how your department works through them.',
                "We've added a practice ticket. You're in tutorial mode, so nothing you change is saved.",
            ],
        },
        {
            title: 'Admin tools',
            body: "Tickets live under your department's Admin tab, alongside meetings and the other admin tools.",
            target: '[data-tour="dept-admin-sections"]',
            path: adminTickets,
        },
        {
            title: 'Find the right tickets',
            body: 'Filter by category and status, or search by title or author. Open tickets are listed first, and closed or resolved ones are underneath.',
            target: '[data-tour="dept-tickets-filters"]',
            path: adminTickets,
        },
        {
            title: 'A ticket',
            body: "Each row shows the ticket's title, who raised it, its type, its status, which departments it's assigned to, and its votes. VIEW opens the full ticket with its comments.",
            target: ROW,
            path: adminTickets,
        },
        {
            title: 'Update the status',
            body: 'As you work on a ticket, keep its status current so the member can see where it is. Change the practice ticket to "In Review".',
            target: `${ROW} select`,
            requires: `${ROW} select`,
            advance: { type: 'write', method: 'PATCH', path: /^\/api\/tickets\/tutorial-practice-ticket$/ },
            hint: 'Waiting for you to change the status.',
        },
        {
            title: 'Wrong department?',
            body: 'If a ticket belongs to another department, transfer it rather than closing it. Click Transfer.',
            target: `${ROW} [data-tour="dept-ticket-transfer-btn"]`,
            requires: `${ROW} [data-tour="dept-ticket-transfer-btn"]`,
            advance: { type: 'visible', selector: '[data-tour="dept-ticket-transfer"]' },
        },
        {
            title: 'Pick where it goes',
            body: 'Choose the department, add a note to explain why if you like, then press Confirm Transfer.',
            target: '[data-tour="dept-ticket-transfer"]',
            requires: '[data-tour="dept-ticket-transfer"]',
            advance: { type: 'write', method: 'POST', path: /^\/api\/tickets\/tutorial-practice-ticket\/transfer$/ },
            hint: 'Waiting for you to confirm the transfer.',
        },
        {
            title: 'All done',
            body: [
                "The practice ticket has left your list because it now belongs to the other department. For real, they'd pick it up from there.",
                'Nothing was saved. When you finish, the page reloads with your real data. You can run this tutorial again any time from the Tutorial button.',
            ],
        },
    ],
}
