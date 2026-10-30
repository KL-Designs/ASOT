/**
 * Training types saved before `status` and `courseType` existed carry only
 * `isActive`, and Selection / Reinforcement Cycle carry only their category.
 * Read through these so the Training Hub, the calendar and the course routes
 * all agree, instead of a type that the Hub shows as enabled reading as
 * Inactive elsewhere until someone toggles it off and on.
 */

export type CourseType = 'selection' | 'reinforcement_cycle'

export function courseTypeOf(t: { courseType?: string | null; category?: string | null; name?: string | null }): CourseType | undefined {
    if (t.courseType === 'selection' || t.courseType === 'reinforcement_cycle') return t.courseType
    const label = `${t.category ?? ''} ${t.name ?? ''}`
    if (/reinforcement\s*cycle/i.test(label)) return 'reinforcement_cycle'
    if (/\bselection\b/i.test(t.category ?? '') || /^\s*selection\s*$/i.test(t.name ?? '')) return 'selection'
    return undefined
}

export function typeStatusOf(t: { status?: string | null; isActive?: boolean | null }): 'active' | 'wip' | 'inactive' {
    if (t.status === 'active' || t.status === 'wip' || t.status === 'inactive') return t.status
    return t.isActive === false ? 'inactive' : 'active'
}

export function normaliseTrainingType<T extends { status?: string | null; isActive?: boolean | null; courseType?: string | null; category?: string | null; name?: string | null }>(t: T): T & { status: 'active' | 'wip' | 'inactive'; isActive: boolean } {
    const status = typeStatusOf(t)
    const courseType = courseTypeOf(t)
    return { ...t, status, isActive: status === 'active', ...(courseType ? { courseType } : {}) }
}

export const COURSE_PREFIX: Record<CourseType, string> = { selection: 'SEL', reinforcement_cycle: 'RC' }

/** The number after the highest this course has used: counter, numbers and refs alike. */
export function nextCourseNumber(counterSeq: number | null | undefined, used: { instanceNumber?: number | null; instanceRef?: string | null }[]): number {
    let max = counterSeq ?? 0
    for (const u of used) {
        if (u.instanceNumber && u.instanceNumber > max) max = u.instanceNumber
        const m = u.instanceRef?.match(/(\d+)\s*$/)
        if (m && Number(m[1]) > max) max = Number(m[1])
    }
    return max + 1
}
