import type { Tutorial, TutorialContext } from '../types'
import type { SandboxHandler } from '../sandbox'

export const PRACTICE_APPLICATION_ID = 'tutorial-practice-application'

function practiceApplication(ctx: TutorialContext) {
    const submittedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    return {
        _id: PRACTICE_APPLICATION_ID,
        discordUsername: 'practice.recruit (TUTORIAL)',
        discordName: 'Practice Recruit',
        inGameName: 'Pte. Practice',
        age: 24,
        experience: 'A made-up applicant for the tutorial. Nothing you do to this application is saved.',
        status: 'reviewing',
        submittedAt,
        region: 'Australia (AEST)',
        heardAbout: 'A friend',
        armaHours: '500+',
        priorMilsim: true,
        dualClan: false,
        availableNights: 'Wednesday, Saturday',
        opsPerMonth: '4',
        primaryRole: 'Rifleman',
        secondaryRole: 'Medic',
        ownsArma: true,
        // Assigned to whoever runs the tutorial, so a recruiter sees the
        // recommendation buttons and a lead sees the final decision.
        assignedReviewerId: ctx.userId,
        assignedReviewerName: 'You',
        returningMemberCheck: { status: 'CLEAR', checkedAt: submittedAt },
    }
}

function sandbox(ctx: TutorialContext): SandboxHandler[] {
    const practice: Record<string, any> = practiceApplication(ctx)
    const patches = new Map<string, Record<string, unknown>>()
    const deleted = new Set<string>()

    return [
        {
            method: 'GET',
            path: '/api/admin/j1/applications',
            transform: data => {
                const real = Array.isArray(data?.applications) ? data.applications : []
                const all = [{ ...practice, ...patches.get(PRACTICE_APPLICATION_ID) }, ...real]
                return {
                    ...data,
                    applications: all
                        .filter((a: any) => !deleted.has(a._id))
                        .map((a: any) => patches.has(a._id) ? { ...a, ...patches.get(a._id) } : a),
                }
            },
        },
        {
            method: 'PATCH',
            path: /^\/api\/admin\/j1\/applications\/[^/]+$/,
            respond: req => {
                const id = req.url.pathname.split('/').pop()!
                const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {}
                const patch: Record<string, unknown> = { ...patches.get(id), ...body }
                if (body.j4ReviewDecision) patch.j4ReviewStatus = body.j4ReviewDecision
                patches.set(id, patch)
                return { ok: true, application: { _id: id, ...patch } }
            },
        },
        {
            method: 'DELETE',
            path: /^\/api\/admin\/j1\/applications\/[^/]+$/,
            respond: req => {
                deleted.add(req.url.pathname.split('/').pop()!)
                return { ok: true }
            },
        },
    ]
}

const PRACTICE_WRITE = /^\/api\/admin\/j1\/applications\/tutorial-practice-application$/

export const j1ApplicationsTutorial: Tutorial = {
    id: 'j1-applications',
    title: 'Reviewing an application',
    summary: 'Find a new application, write review notes, and make your recommendation or decision.',
    area: 'J1 Recruitment',
    pages: ['/dashboard/j1'],
    startPath: '/dashboard/j1',
    sandbox,
    steps: [
        {
            title: 'Reviewing applications',
            body: [
                'This walkthrough shows you how a J1 recruiter handles an application, from opening it to recommending a decision.',
                "We've added a practice applicant for you to work on. You're in tutorial mode, so nothing you change here is saved, and no one gets a message.",
            ],
        },
        {
            title: 'The Applications tab',
            body: 'Every application submitted on the recruitment page lands here. Click the Applications tab.',
            target: '[data-tour="j1-tab-applications"]',
            path: '/dashboard/j1',
            advance: { type: 'click' },
        },
        {
            title: 'Filter by status',
            body: [
                'Applications move through statuses: Pending (new, nobody on it yet), Reviewing (a recruiter is assigned), Returned (sent back to the recruiter by a lead), then Accepted or Rejected.',
                'Use these filters to find what needs your attention, or search by name on the right.',
            ],
            target: '[data-tour="j1-app-filters"]',
            path: '/dashboard/j1?tab=1',
        },
        {
            title: 'Open the practice application',
            body: "This is the practice applicant, and they've been assigned to you. Click their row to open the application.",
            target: '[data-tour="tutorial-practice-row"]',
            path: '/dashboard/j1?tab=1',
            advance: { type: 'visible', selector: '[data-tour="j1-app-dialog"]' },
        },
        {
            title: 'The application',
            body: 'The top half is what the applicant told us: in-game name, age, experience, availability and preferred roles. Read through it before you talk to them.',
            target: '[data-tour="j1-app-dialog"]',
        },
        {
            title: 'Write your notes',
            body: 'Record anything useful from your chat with the applicant here, for example "Spoke on TS, keen on medic". Other recruiters and the J1 lead will read these. Type a note, then press Next.',
            target: '[data-tour="j1-app-notes"]',
        },
        {
            title: 'Save your notes',
            body: 'Click Save to keep your notes.',
            target: '[data-tour="j1-app-save"]',
            advance: { type: 'write', method: 'PATCH', path: PRACTICE_WRITE },
            hint: 'Waiting for you to click Save.',
        },
        {
            title: 'Make the call',
            body: [
                'As the assigned recruiter, you give a recommendation here: approve, deny or pend. The J1 lead then accepts or rejects it.',
                'If you are a J1 lead, you see Accept, Reject, Assign Recruiter and Send Back instead.',
                'Pick one now. It is only practice.',
            ],
            target: '[data-tour="j1-app-actions"]',
            requires: '[data-tour="j1-app-actions"] button',
            advance: {
                type: 'write',
                method: 'PATCH',
                path: PRACTICE_WRITE,
                test: b => !!b && typeof b === 'object' && ('status' in b || 'recruiterRecommendation' in b || 'j4ReviewDecision' in b),
            },
            hint: 'Waiting for you to choose an option.',
        },
        {
            title: "That's an application done",
            body: [
                'For real, a decision notifies the people involved, and an accepted recruit moves on to induction.',
                'None of that happened just now. When you finish, the page reloads with your real data. You can run this tutorial again any time from the Tutorial button.',
            ],
        },
    ],
}
