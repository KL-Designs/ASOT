import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'

export async function syncInstanceStats(courseInstanceId: string, oid: ObjectId): Promise<void> {
    const [candidates, staff] = await Promise.all([
        Db.courseCandidates.find({ courseInstanceId }).toArray(),
        Db.courseStaff.find({ courseInstanceId }).toArray(),
    ])
    await Db.courseInstances.updateOne({ _id: oid }, {
        $set: {
            candidateCount: candidates.length,
            passedCount: candidates.filter(c => c.status === 'passed').length,
            failedCount: candidates.filter(c => c.status === 'failed').length,
            withdrawnCount: candidates.filter(c => ['withdrawn', 'removed'].includes(c.status)).length,
            staffCount: staff.length,
            instructors: staff.map(s => ({ userId: s.userId, displayName: s.displayName, role: s.role })),
            updatedAt: new Date(),
        },
    })
}
