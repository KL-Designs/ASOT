import { RATING_ASPECTS, type RatingAspectKey } from './aar'
import { summariseFeedback, type FeedbackLike } from './aar-access'

/**
 * Row 342: the mission maker's summary of one operation.
 *
 * AAR Reports (row 329) summarises Fix / Improve / Sustain for the chain of
 * command, which is mostly about how call signs fought. The mission maker needs
 * the other half: what the members said about the mission itself and the
 * zeusing. This filters every AAR and feedback comment of the operation down to
 * those points, and leaves out a call sign's own drills, comms and decisions.
 *
 * Pure half. The route is `app/api/operations/[id]/aar/mission-maker`, and the
 * result is cached in `aar_summaries` under `missionMakerKey()`.
 */

export const MISSION_MAKER_SCOPE = 'mission-maker'

export function missionMakerKey(operationId: string): string {
    return `${MISSION_MAKER_SCOPE}|${operationId}`
}

export interface MissionMakerSource {
    aars: { id: string; section: string; fix: string; improve: string; sustain: string; updatedAt: string }[]
    feedback: (FeedbackLike & { id: string; updatedAt: string })[]
}

/** Changes whenever an AAR or a feedback form of the operation is added, edited or removed. */
export function missionMakerSignature(src: MissionMakerSource): string {
    return [
        ...src.aars.map(a => `a:${a.id}@${a.updatedAt}`),
        ...src.feedback.map(f => `f:${f.id}@${f.updatedAt}`),
    ].sort().join(',')
}

/** Is there anything worth sending? Empty boxes and score-only forms with no comment do not count as text. */
export function hasMissionMakerInput(src: MissionMakerSource): boolean {
    return src.aars.some(a => [a.fix, a.improve, a.sustain].some(v => v.trim()))
        || src.feedback.some(f => f.comment?.trim())
}

export const MISSION_MAKER_SYSTEM_PROMPT = [
    'You summarise after action reports and feedback forms from one operation of a military simulation (ARMA 3) unit, for the mission maker who designed and zeused it.',
    'Keep only points about the mission and the zeusing: mission design, objectives and their flow, the story and briefing, intel, enemy behaviour, numbers and placement,',
    'AI and Zeus reactions, pacing and timings, difficulty, assets and resupply provided by the mission, the map and setting, scripts, and bugs in the mission.',
    'Leave out points about how the members or call signs played: their own drills, comms, leadership, decisions, movement, kit choices and personal experiences,',
    'unless the point is really about what the mission or Zeus did to them. Leave out server performance unless it was caused by the mission (for example too many AI).',
    'Write these headed sections, each a short list, most often raised first, with how many reports raised each point:',
    'Worked well (keep doing), Did not work (fix), Ideas for next time.',
    'Then one line headed Scores that restates the average scores you are given, without adding to them.',
    'Merge points that say the same thing. Use only what the reports say: do not invent, do not name individual members, and do not add advice of your own.',
    'If nothing in the reports is about the mission or the zeusing, say so in one line.',
].join(' ')

/** The user message. Names are left out; only the call sign is kept, so the model can tell reports apart. */
export function buildMissionMakerInput(operationTitle: string, src: MissionMakerSource, maxChars = 60_000): string {
    const summary = summariseFeedback(src.feedback)
    const scores = RATING_ASPECTS
        .map(a => `${a.label}: ${fmt(summary.averages[a.key as RatingAspectKey])}`)
        .join('; ')

    const blocks: string[] = []
    let used = 0
    let dropped = 0
    const push = (block: string) => {
        if (used + block.length > maxChars) { dropped++; return }
        blocks.push(block)
        used += block.length
    }

    // Comments first: they are written for the mission maker, so they are the last thing to drop.
    for (const c of summary.comments) push(`[Feedback comment]\n${c}`)
    for (const a of src.aars) {
        if (![a.fix, a.improve, a.sustain].some(v => v.trim())) continue
        push(`[AAR · ${a.section || 'No call sign'}]\nFix: ${a.fix.trim() || '-'}\nImprove: ${a.improve.trim() || '-'}\nSustain: ${a.sustain.trim() || '-'}`)
    }

    return [
        `Operation: ${operationTitle}`,
        `Feedback forms: ${summary.responses}. Average scores, 1 to 5 where 3 is a normal night: ${scores}`,
        `Reports included: ${blocks.length}${dropped ? ` (${dropped} more did not fit)` : ''}`,
        '',
        blocks.join('\n\n'),
    ].join('\n')
}

function fmt(n: number | null): string {
    return n === null ? 'no answers' : n.toFixed(1)
}
