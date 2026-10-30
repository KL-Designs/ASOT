import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { canDo, type NcoAction, type NcoActor } from './nco-assessment'

/**
 * The database half of `nco-assessment.ts`: who the caller is, in the terms
 * the rules are written in. Section staff and CHQ are both read off the ORBAT
 * — positional, like the rest of the unit's chain of command.
 */
export async function ncoActor(me: User): Promise<NcoActor> {
    const positions = await Db.orbatPositions
        .find({ userId: me.id }, { projection: { category: 1, sectionTitle: 1, isSenior: 1 } })
        .toArray()
    return {
        id: me.id,
        isJ3Lead: client.hasRoles(me, PERMISSIONS.training.manage),
        staffOf: [...new Set(positions.filter(p => p.isSenior && p.sectionTitle).map(p => p.sectionTitle))],
        isChq: positions.some(p => p.category === 'companyHQ'),
    }
}

/** The section a candidate is in, or null (reservists hold no section). */
export async function sectionOf(userId: string): Promise<string | null> {
    const position = await Db.orbatPositions.findOne(
        { userId, sectionTitle: { $exists: true, $ne: '' } },
        { projection: { sectionTitle: 1 } },
    )
    return position?.sectionTitle ?? null
}

/** Everybody who is staff of this section, to ask about a shadow. */
export async function staffOfSection(sectionTitle: string): Promise<string[]> {
    const positions = await Db.orbatPositions
        .find({ sectionTitle, isSenior: true, userId: { $ne: null } }, { projection: { userId: 1 } })
        .toArray()
    return [...new Set(positions.map(p => p.userId as string))]
}

const ACTIONS: NcoAction[] = ['assign', 'confirm', 'requestShadow', 'decideShadow', 'sheet', 'recording', 'complete', 'cancel']

/** One assessment as the page receives it, with what this caller may do to it. */
export function toNcoView(a: NcoAssessment, actor: NcoActor) {
    return {
        id: String(a._id),
        operationId: String(a.operationId),
        operationTitle: a.operationTitle,
        operationDate: new Date(a.operationDate).toISOString(),
        candidateId: a.candidateId,
        candidateName: a.candidateName,
        candidateSection: a.candidateSection ?? null,
        notes: a.notes ?? '',
        status: a.status,
        assessorId: a.assessorId ?? null,
        assessorName: a.assessorName ?? null,
        shadow: a.shadow
            ? { status: a.shadow.status, decidedByName: a.shadow.decidedByName ?? null }
            : null,
        sheetUrl: a.sheetUrl ?? null,
        assessorNotes: a.assessorNotes ?? '',
        outcome: a.outcome ?? null,
        recordingUrl: a.recordingUrl ?? null,
        can: Object.fromEntries(ACTIONS.map(action => [action, canDo(action, actor, a)])) as Record<NcoAction, boolean>,
    }
}

export type NcoAssessmentView = ReturnType<typeof toNcoView>
