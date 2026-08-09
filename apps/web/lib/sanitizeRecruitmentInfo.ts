import sanitizeHtml from 'sanitize-html'
import type { RecruitmentInfoContent } from './recruitment-defaults'

// step.intro is documented as "may contain basic HTML like <em>" and is
// rendered via dangerouslySetInnerHTML on the public /join/info page — this
// module is server-only (imports sanitize-html) and must never be imported
// from a 'use client' file. Call it both when RecruitmentInfoContent is
// written (the admin PUT route) and when it's read for public rendering
// (the info page's server component), so neither a bad write nor data
// stored before this sanitization existed can reach the browser unsanitized.
const INTRO_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: ['em', 'strong', 'b', 'i', 'br', 'a'],
    allowedAttributes: { a: ['href'] },
}

export function sanitizeRecruitmentInfo(info: RecruitmentInfoContent): RecruitmentInfoContent {
    return {
        ...info,
        steps: info.steps.map(step => ({
            ...step,
            intro: step.intro ? sanitizeHtml(step.intro, INTRO_SANITIZE_OPTIONS) : step.intro,
        })),
    }
}
