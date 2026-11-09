import Db from '@/lib/mongo'
import { pickNextSelection, UPCOMING, type NextSelection } from './next-selection'

/** The next Selection's Session 1 from the database. See `next-selection.ts`. */
export async function findNextSelection(now = new Date()): Promise<NextSelection | null> {
    const candidates = await Db.courseInstances.find({
        courseType: 'selection',
        status: { $in: UPCOMING },
        deletedAt: { $exists: false },
        session1Date: { $gt: now },
    }).sort({ session1Date: 1 }).limit(5).toArray()
    return pickNextSelection(candidates, now)
}
