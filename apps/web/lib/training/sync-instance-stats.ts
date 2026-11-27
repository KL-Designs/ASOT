import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'

export async function syncInstanceStats(courseInstanceId: string, oid: ObjectId): Promise<void> {
    const [candidates, staff] = await Promise.all([
        Db.courseCandidates.find({ courseInstanceId }).toArray(),
        Db.courseStaff.find({ courseInstanceId }).toArray(),
    ])

    const lead = staff.find(s => s.role === 'lead_instructor')

    const update: Record<string, unknown> = {
        candidateCount: candidates.length,
        passedCount: candidates.filter(c => c.status === 'passed').length,
        failedCount: candidates.filter(c => c.status === 'failed').length,
        withdrawnCount: candidates.filter(c => ['withdrawn', 'removed'].includes(c.status)).length,
        staffCount: staff.length,
        instructors: staff.map(s => ({ userId: s.userId, displayName: s.displayName, role: s.role })),
        updatedAt: new Date(),
    }

    // Sync lead instructor fields from the staff list so Training Record
    // summary always reflects the current lead_instructor assignment.
    if (lead) {
        update.leadInstructorId   = lead.userId
        update.leadInstructorName = lead.displayName
    }

    await Db.courseInstances.updateOne({ _id: oid }, { $set: update })
}
