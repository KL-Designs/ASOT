import type { Tutorial, TutorialContext } from '../types'
import type { SandboxHandler } from '../sandbox'

const PAGE = '/dashboard/unit/staff-induction'

const PRACTICE_INDUCTION_ID = 'tutorial-practice-induction'

function practiceRecord(ctx: TutorialContext) {
    return {
        _id: PRACTICE_INDUCTION_ID,
        userId: ctx.userId || 'tutorial',
        userName: 'Practice Member',
        context: 'staff',
        triggerLabel: 'Tutorial Walkthrough — Practice Induction',
        triggeredById: 'system',
        triggeredByName: 'Tutorial System',
        triggeredAt: new Date().toISOString(),
        partACompletedAt: undefined as string | undefined,
        completedAt: undefined as string | undefined,
    }
}

function sandbox(ctx: TutorialContext): SandboxHandler[] {
    const practice = practiceRecord(ctx)

    return [
        {
            method: 'GET',
            path: '/api/me/staff-induction-page',
            transform: data => ({
                ...data,
                records: [{ ...practice }, ...(Array.isArray(data?.records) ? data.records : [])],
            }),
        },
        {
            method: 'PATCH',
            path: /^\/api\/staff-induction\/[^/]+$/,
            respond: req => {
                const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {}
                if (body.action === 'complete-part-a') practice.partACompletedAt = new Date().toISOString()
                if (body.action === 'complete-part-b' || body.action === 'skip-part-b') practice.completedAt = new Date().toISOString()
                return { record: { ...practice } }
            },
        },
    ]
}

export const staffInductionTutorial: Tutorial = {
    id: 'staff-induction',
    title: 'Completing a staff induction',
    summary: 'Walk through how to complete a staff induction when you receive one — Part A rules acknowledgement and the optional Part B orientation.',
    area: 'Staff',
    pages: [PAGE],
    startPath: PAGE,
    sandbox,
    steps: [
        {
            title: 'Staff inductions',
            body: [
                'When you are promoted, transfer departments, or join the staff team, you may receive a staff induction. This page shows any that are waiting for you.',
                "We've added a practice induction for you to work through. Nothing you do here is saved.",
            ],
        },
        {
            title: 'Your pending inductions',
            body: 'Each induction is shown as a card. It tells you what triggered it — your promotion, appointment, or department transfer — and who sent it.',
            target: '[data-tour="staff-induction-card"]',
            requires: '[data-tour="staff-induction-card"]',
        },
        {
            title: 'Part A — Rules & Standards',
            body: 'Part A contains the staff rules and standards set by J4 or your department lead. Read through it carefully before acknowledging.',
            target: '[data-tour="staff-induction-part-a"]',
            requires: '[data-tour="staff-induction-part-a"]',
        },
        {
            title: 'Acknowledge the rules',
            body: 'Once you have read Part A, click this button to confirm you have read and accept the rules. This is the only mandatory step.',
            target: '[data-tour="staff-induction-complete-a"]',
            requires: '[data-tour="staff-induction-complete-a"]',
            advance: { type: 'write', method: 'PATCH', path: /^\/api\/staff-induction\/[^/]+$/ },
            hint: 'Waiting for you to click the acknowledgement button.',
        },
        {
            title: 'Part B — Orientation Tutorial',
            body: [
                'If your department has set up an orientation tutorial, Part B will appear after you complete Part A.',
                'It is optional — you can complete it or skip it. The induction is considered done once Part A is acknowledged.',
            ],
            target: '[data-tour="staff-induction-part-b"]',
            requires: '[data-tour="staff-induction-part-b"]',
        },
        {
            title: 'All done',
            body: [
                'Once you have worked through your induction, the card is marked as complete and disappears from this list.',
                'If you receive another induction in the future — from a new appointment or department move — it will appear here again.',
            ],
        },
    ],
}
